/**
 * Registration and login hardening. No database: the Prisma client behind
 * DBService is stubbed, and Argon2 is stubbed so the suite stays fast — what is
 * asserted is that the derivation is *invoked*, not what it computes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DBService } from '@securevault/db'

import { CryptoService } from '../crypto/CryptoService'
import { CapacityError } from '../utils/Semaphore'
import { AuthCredentials, REGISTRATION_REJECTED } from './AuthCredentials'

const GOOD_PASSWORD = 'a-perfectly-fine-long-passphrase'

type PrismaStub = {
  user: {
    findUnique: ReturnType<typeof vi.fn>
    count: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  auditLog: { create: ReturnType<typeof vi.fn> }
}

let prisma: PrismaStub
let deriveKEK: ReturnType<typeof vi.spyOn>

const credentials = AuthCredentials.getInstance()

beforeEach(() => {
  prisma = {
    user: {
      findUnique: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({})
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) }
  }
  vi.spyOn(DBService.prototype, 'prisma', 'get').mockReturnValue(prisma as never)

  // A real derivation costs 64 MiB and ~200ms; the property under test is that
  // it happens at all.
  deriveKEK = vi
    .spyOn(CryptoService.prototype, 'deriveKEK')
    .mockResolvedValue(Buffer.alloc(32, 7))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('register does not leak why it failed', () => {
  it('answers identically for a taken username and a weak password', async () => {
    prisma.user.findUnique.mockResolvedValue({ userId: 'existing' })
    const taken = await credentials.register('takenuser', GOOD_PASSWORD).catch((e: Error) => e)

    prisma.user.findUnique.mockResolvedValue(null)
    const weak = await credentials.register('brandnewuser', 'short').catch((e: Error) => e)

    expect(taken).toBeInstanceOf(Error)
    expect(weak).toBeInstanceOf(Error)
    expect((taken as Error).message).toBe(REGISTRATION_REJECTED)
    expect((weak as Error).message).toBe((taken as Error).message)
  })

  it('answers identically for a malformed username', async () => {
    prisma.user.findUnique.mockResolvedValue(null)

    const short = await credentials.register('ab', GOOD_PASSWORD).catch((e: Error) => e)
    const empty = await credentials.register('', GOOD_PASSWORD).catch((e: Error) => e)

    expect((short as Error).message).toBe(REGISTRATION_REJECTED)
    expect((empty as Error).message).toBe(REGISTRATION_REJECTED)
  })

  it('never echoes the submitted username back in the message', async () => {
    prisma.user.findUnique.mockResolvedValue({ userId: 'existing' })

    const error = await credentials.register('secret-tender-user', GOOD_PASSWORD).catch(
      (e: Error) => e
    )

    expect((error as Error).message).not.toContain('secret-tender-user')
  })

  it('reports an empty user table for bootstrap', async () => {
    prisma.user.count.mockResolvedValue(0)
    await expect(credentials.hasNoUsers()).resolves.toBe(true)

    prisma.user.count.mockResolvedValue(3)
    await expect(credentials.hasNoUsers()).resolves.toBe(false)
  })
})

describe('login timing equalisation', () => {
  it('still derives a key for an unknown username', async () => {
    prisma.user.findUnique.mockResolvedValue(null)

    await expect(credentials.login('nobody-here', GOOD_PASSWORD)).rejects.toThrow(
      'Invalid username or password.'
    )

    // The burn path must spend the same Argon2 work a real login would.
    expect(deriveKEK).toHaveBeenCalledTimes(1)
  })

  it('derives exactly as many times for a known username', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    await credentials.login('nobody-here', GOOD_PASSWORD).catch(() => undefined)
    const unknownCalls = deriveKEK.mock.calls.length

    deriveKEK.mockClear()
    prisma.user.findUnique.mockResolvedValue({
      userId: 'u1',
      username: 'realuser',
      isDisabled: false,
      passwordSalt: new Uint8Array(32),
      argon2Params: JSON.stringify({
        type: 'argon2id',
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
        hashLength: 32,
        kekVerifier: 'not-the-right-verifier'
      })
    })
    await credentials.login('realuser', GOOD_PASSWORD).catch(() => undefined)

    expect(deriveKEK.mock.calls.length).toBe(unknownCalls)
  })

  it('sheds load on the unknown-username path exactly as on the real one', async () => {
    // If burnKekDerivation swallowed CapacityError, an unknown username would
    // answer 401 immediately while a known one answered 503 — an enumeration
    // oracle that only appears under load.
    deriveKEK.mockRejectedValue(new CapacityError('Authentication'))
    prisma.user.findUnique.mockResolvedValue(null)

    await expect(credentials.login('nobody-here', GOOD_PASSWORD)).rejects.toBeInstanceOf(
      CapacityError
    )
  })
})
