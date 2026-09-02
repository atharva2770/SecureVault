/**
 * Session lifecycle: the sliding idle window, the absolute cap that must survive
 * it, the sweeper that reclaims abandoned sessions and their KEKs, and the
 * eviction of dead throttle keys.
 *
 * No database and no HTTP — the store and the attempt guards are pure in-memory
 * state driven by fake timers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Runs before the imports below are evaluated, so `apiConfig` resolves without a
// developer's local .env. The timeouts are pinned to the shipped defaults rather
// than inherited, because CI supplies neither. Credentials use ||= so this file
// cannot poison a sibling suite sharing the worker process.
vi.hoisted(() => {
  process.env.USE_TRUSTED_CONNECTION = 'false'
  process.env.NODE_ENV = process.env.NODE_ENV || 'test'
  process.env.API_COOKIE_SECRET ||= 'session-lifecycle-suite-cookie-secret'
  process.env.VAULT_KMS_WRAP_KEY ||=
    '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1ff'
  process.env.DATABASE_URL ||=
    'sqlserver://localhost:1433;database=SecureVaultUnit;user=sa;password=unit-tests-only;trustServerCertificate=true'
  process.env.VAULT_IDLE_TIMEOUT_MS = '900000'
  process.env.VAULT_SESSION_MAX_MS = '43200000'
})

import { apiConfig } from './config'
import { AttemptGuard, TooManyAttemptsError } from './plugins/rateLimit'
import { httpSessions } from './session'

const MINUTE = 60_000
const IDLE_MS = 15 * MINUTE
const ABSOLUTE_MS = 12 * 60 * MINUTE

function newSession(userId: string, kek?: Buffer) {
  return httpSessions.create({
    userId,
    username: userId,
    role: 'member',
    roles: ['MEMBER'],
    kek
  })
}

beforeEach(() => {
  // Order matters. The store is constructed at import time, so its interval is
  // registered against the REAL clock; clearing it after installing fake timers
  // would silently no-op and leave a live 60s timer running for the whole file.
  httpSessions.stopSweeper()
  vi.useFakeTimers()
  httpSessions.destroyAll()
  httpSessions.startSweeper()
})

afterEach(() => {
  // Mirror image: drop the fake interval before uninstalling the fake clock.
  httpSessions.stopSweeper()
  vi.useRealTimers()
  httpSessions.destroyAll()
  httpSessions.startSweeper()
  vi.restoreAllMocks()
})

describe('config the suite depends on', () => {
  it('uses the shipped idle and absolute windows', () => {
    expect(apiConfig.idleTimeoutMs).toBe(IDLE_MS)
    expect(apiConfig.sessionAbsoluteMaxMs).toBe(ABSOLUTE_MS)
  })
})

describe('HttpSessionStore idle window', () => {
  it('1. keeps a session alive indefinitely while it is touched every 10 minutes', () => {
    const session = newSession('active-user')

    for (let i = 0; i < 6; i += 1) {
      vi.advanceTimersByTime(10 * MINUTE)
      expect(httpSessions.touch(session.sessionId)).not.toBeNull()
    }

    // An hour of steady work — four times the idle window.
    expect(httpSessions.get(session.sessionId)).not.toBeNull()
  })

  it('2. drops a session left idle past the window', () => {
    const session = newSession('idle-user')

    vi.advanceTimersByTime(16 * MINUTE)

    expect(httpSessions.get(session.sessionId)).toBeNull()
  })

  it('3. still drops a continuously touched session once the absolute cap passes', () => {
    // The security-critical one: sliding the idle window must never extend a
    // session past VAULT_SESSION_MAX_MS.
    const session = newSession('never-idle-user')

    for (let elapsed = 0; elapsed < ABSOLUTE_MS; elapsed += 10 * MINUTE) {
      vi.advanceTimersByTime(10 * MINUTE)
      httpSessions.touch(session.sessionId)
    }

    // Right at the cap it is still valid, and still being touched.
    expect(httpSessions.get(session.sessionId)).not.toBeNull()

    vi.advanceTimersByTime(MINUTE)

    expect(httpSessions.touch(session.sessionId)).toBeNull()
    expect(httpSessions.get(session.sessionId)).toBeNull()
  })
})

describe('HttpSessionStore sweeper', () => {
  it('4. reclaims an abandoned session nobody reads, and zeroes its KEK', () => {
    const source = Buffer.alloc(32, 0xab)
    const created = newSession('abandoned-user', source)

    // create() copies the buffer, so the store's own copy is what must be zeroed.
    const retained = created.kek
    expect(retained).toBeDefined()
    expect(retained).not.toBe(source)
    expect(retained?.every((byte) => byte === 0xab)).toBe(true)
    expect(httpSessions.size()).toBe(1)

    // Nothing calls get() or touch() — only the sweeper can reclaim this.
    vi.advanceTimersByTime(16 * MINUTE)

    expect(httpSessions.size()).toBe(0)
    expect(retained?.every((byte) => byte === 0)).toBe(true)
  })

  it('leaves a live session alone', () => {
    const session = newSession('live-user')

    vi.advanceTimersByTime(10 * MINUTE)

    expect(httpSessions.size()).toBe(1)
    expect(httpSessions.get(session.sessionId)).not.toBeNull()
  })
})

describe('HttpSessionStore per-user cap', () => {
  it('5. revokes the oldest session when a user opens a sixth', () => {
    const ids: string[] = []
    for (let i = 0; i < 6; i += 1) {
      ids.push(newSession('busy-user').sessionId)
      vi.advanceTimersByTime(1000)
    }

    expect(httpSessions.size()).toBe(5)
    expect(httpSessions.get(ids[0])).toBeNull()
    for (const id of ids.slice(1)) {
      expect(httpSessions.get(id)).not.toBeNull()
    }
  })

  it('caps each user independently', () => {
    for (let i = 0; i < 6; i += 1) newSession('user-a')
    const other = newSession('user-b')

    expect(httpSessions.size()).toBe(6)
    expect(httpSessions.get(other.sessionId)).not.toBeNull()
  })
})

describe('AttemptGuard eviction', () => {
  it('6. forgets a key once its window closes with no new failures', () => {
    const guard = new AttemptGuard({
      label: 'test:idle',
      freeAttempts: 3,
      backoffBaseMs: 1000,
      maxLockMs: 60_000,
      windowMs: 5 * MINUTE
    })

    // One failure, still under freeAttempts — the case assert() never cleaned up.
    guard.recordFailure('key')
    expect(guard.size).toBe(1)

    guard.sweep()
    expect(guard.size).toBe(1)

    vi.advanceTimersByTime(5 * MINUTE + 1)
    guard.sweep()
    expect(guard.size).toBe(0)
  })

  it('7. keeps a key that is still inside an active lockout', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    // maxLockMs > windowMs so the "locked but past its window" state is
    // reachable at all. Every shipped guard has maxLockMs <= windowMs, so this
    // exercises the predicate rather than a production configuration.
    const guard = new AttemptGuard({
      label: 'test:locked',
      freeAttempts: 1,
      backoffBaseMs: 30 * MINUTE,
      maxLockMs: 60 * MINUTE,
      windowMs: MINUTE
    })

    guard.recordFailure('key')
    guard.recordFailure('key')

    vi.advanceTimersByTime(5 * MINUTE)

    guard.sweep()

    expect(guard.size).toBe(1)
    expect(() => guard.assert('key')).toThrow(TooManyAttemptsError)
  })

  it('does not shorten a lockout it declines to evict', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const guard = new AttemptGuard({
      label: 'test:expiry',
      freeAttempts: 1,
      backoffBaseMs: 2 * MINUTE,
      maxLockMs: 2 * MINUTE,
      windowMs: MINUTE
    })

    guard.recordFailure('key')
    guard.recordFailure('key')

    vi.advanceTimersByTime(90_000)
    guard.sweep()
    expect(() => guard.assert('key')).toThrow(TooManyAttemptsError)

    // Once the lock lapses and the window has closed, the key goes.
    vi.advanceTimersByTime(60_000)
    guard.sweep()
    expect(guard.size).toBe(0)
    expect(() => guard.assert('key')).not.toThrow()
  })
})
