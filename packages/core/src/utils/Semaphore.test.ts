import { describe, expect, it } from 'vitest'

import { CapacityError, Semaphore } from './Semaphore'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('Semaphore', () => {
  it('never exceeds its limit under 100 racing acquires', async () => {
    const limit = 4
    const gate = new Semaphore({ limit, maxQueue: 200 })

    let concurrent = 0
    let peak = 0

    await Promise.all(
      Array.from({ length: 100 }, () =>
        gate.run(async () => {
          concurrent += 1
          peak = Math.max(peak, concurrent)
          // Yield so overlapping tasks actually interleave.
          await new Promise((r) => setTimeout(r, 1))
          concurrent -= 1
        })
      )
    )

    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThanOrEqual(limit)
    expect(gate.active).toBe(0)
    expect(gate.queued).toBe(0)
  })

  it('rejects past the queue cap instead of queueing', async () => {
    const gate = new Semaphore({ limit: 1, maxQueue: 2, label: 'Authentication' })
    const held = deferred()

    const running = gate.run(() => held.promise)
    await Promise.resolve()

    // Two waiters fit; the third is shed.
    const queuedA = gate.acquire()
    const queuedB = gate.acquire()
    expect(gate.queued).toBe(2)

    await expect(gate.acquire()).rejects.toBeInstanceOf(CapacityError)
    await expect(gate.acquire()).rejects.toThrow(/Authentication is at capacity/)
    expect(gate.queued).toBe(2)

    held.resolve()
    await running
    ;(await queuedA)()
    ;(await queuedB)()

    expect(gate.active).toBe(0)
    expect(gate.queued).toBe(0)
  })

  it('carries a Retry-After hint on the typed error', async () => {
    const gate = new Semaphore({ limit: 1, maxQueue: 0 })
    const held = deferred()
    const running = gate.run(() => held.promise)

    const error = await gate.acquire().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(CapacityError)
    expect((error as CapacityError).retryAfterSeconds).toBeGreaterThan(0)

    held.resolve()
    await running
  })

  it('does not leak a permit when an acquire is rejected', async () => {
    const gate = new Semaphore({ limit: 2, maxQueue: 1 })
    const first = deferred()
    const second = deferred()

    const a = gate.run(() => first.promise)
    const b = gate.run(() => second.promise)
    await Promise.resolve()

    const waiter = gate.acquire()
    await expect(gate.acquire()).rejects.toBeInstanceOf(CapacityError)
    await expect(gate.acquire()).rejects.toBeInstanceOf(CapacityError)

    first.resolve()
    second.resolve()
    await Promise.all([a, b])
    ;(await waiter)()

    // Every permit came back, so the gate still works at full width.
    expect(gate.active).toBe(0)
    expect(gate.queued).toBe(0)

    let ran = 0
    await Promise.all([gate.run(async () => void ran++), gate.run(async () => void ran++)])
    expect(ran).toBe(2)
    expect(gate.active).toBe(0)
  })

  it('releases the permit when the task throws', async () => {
    const gate = new Semaphore({ limit: 1, maxQueue: 1 })

    await expect(
      gate.run(async () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')

    expect(gate.active).toBe(0)
    await expect(gate.run(async () => 'ok')).resolves.toBe('ok')
  })

  it('ignores a second release from the same holder', async () => {
    const gate = new Semaphore({ limit: 1, maxQueue: 1 })

    const release = await gate.acquire()
    release()
    release()

    expect(gate.active).toBe(0)

    // A double release must not have created a spare permit.
    const held = deferred()
    const running = gate.run(() => held.promise)
    await Promise.resolve()
    expect(gate.active).toBe(1)

    held.resolve()
    await running
  })
})
