/**
 * Argon2 parameter policy: logins stay expensive, per-file passwords do not.
 *
 * These run real Argon2, so they are the slowest tests in the suite — that is
 * the point of test 4, which measures the ratio between the two costs rather
 * than any absolute time, so a slow CI box cannot make it flaky.
 */
import { describe, expect, it } from 'vitest'

import * as argon2 from 'argon2'

import {
  ARGON2_MEMORY_COST_KIB,
  ARGON2_PARALLELISM,
  ARGON2_TIME_COST,
  CryptoService,
  FILE_PASSWORD_MEMORY_COST_KIB,
  FILE_PASSWORD_PARALLELISM,
  FILE_PASSWORD_TIME_COST
} from './CryptoService'

const crypto = CryptoService.getInstance()
const PASSWORD = 'a-per-file-access-password'

describe('Argon2 parameters', () => {
  it('uses the OWASP baseline for file passwords', () => {
    expect(FILE_PASSWORD_MEMORY_COST_KIB).toBe(19456)
    expect(FILE_PASSWORD_TIME_COST).toBe(2)
    expect(FILE_PASSWORD_PARALLELISM).toBe(1)
  })

  it('leaves the login parameters untouched', () => {
    expect(ARGON2_MEMORY_COST_KIB).toBe(65536)
    expect(ARGON2_TIME_COST).toBe(3)
    expect(ARGON2_PARALLELISM).toBe(4)
  })

  it('encodes the cheaper parameters into the file password hash', async () => {
    const hash = await crypto.hashAccessPassword(PASSWORD)
    // Argon2 writes its parameters into the PHC string, so this is the real
    // stored cost, not just the constant.
    expect(hash).toContain(`m=${FILE_PASSWORD_MEMORY_COST_KIB}`)
    expect(hash).toContain(`t=${FILE_PASSWORD_TIME_COST}`)
    expect(hash).toContain(`p=${FILE_PASSWORD_PARALLELISM}`)
    expect(await crypto.verifyAccessPassword(PASSWORD, hash)).toBe(true)
    expect(await crypto.verifyAccessPassword('wrong', hash)).toBe(false)
  })
})

describe('deriveKEK', () => {
  it('still refuses anything below 64 MiB', async () => {
    const salt = crypto.generateSalt(32)
    await expect(
      crypto.deriveKEK(PASSWORD, salt, { memoryCost: FILE_PASSWORD_MEMORY_COST_KIB })
    ).rejects.toThrow(/must be ≥ 65536/)
    await expect(crypto.deriveKEK(PASSWORD, salt, { memoryCost: 65535 })).rejects.toThrow()
  })

  it('accepts the login parameters', async () => {
    const salt = crypto.generateSalt(32)
    const kek = await crypto.deriveKEK(PASSWORD, salt)
    expect(kek).toHaveLength(32)
  })
})

describe('backward compatibility', () => {
  it('verifies a hash written at the old 64 MiB parameters', async () => {
    // What every existing row in the database looks like.
    const legacyHash = await argon2.hash(PASSWORD, {
      type: argon2.argon2id,
      memoryCost: ARGON2_MEMORY_COST_KIB,
      timeCost: ARGON2_TIME_COST,
      parallelism: ARGON2_PARALLELISM
    })
    expect(legacyHash).toContain(`m=${ARGON2_MEMORY_COST_KIB}`)

    expect(await crypto.verifyAccessPassword(PASSWORD, legacyHash)).toBe(true)
    expect(await crypto.verifyAccessPassword('wrong', legacyHash)).toBe(false)
  })

  it('costs measurably less than a login derivation', async () => {
    const salt = crypto.generateSalt(32)

    const fileStart = process.hrtime.bigint()
    await crypto.hashAccessPassword(PASSWORD)
    const fileMs = Number(process.hrtime.bigint() - fileStart) / 1e6

    const loginStart = process.hrtime.bigint()
    await crypto.deriveKEK(PASSWORD, salt)
    const loginMs = Number(process.hrtime.bigint() - loginStart) / 1e6

    // A ratio, not a wall-clock bound: 19 MiB/t=2/p=1 against 64 MiB/t=3/p=4 is
    // ~10x cheaper in theory. Assert only that it is clearly cheaper, so the
    // test cannot fail on a slow or contended machine.
    expect(fileMs).toBeLessThan(loginMs)
  }, 30_000)
})
