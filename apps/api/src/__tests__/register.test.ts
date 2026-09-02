/**
 * Registration lockdown at the HTTP edge. No database: the Prisma client behind
 * DBService is stubbed so only the route's gate is under test.
 *
 * ALLOW_PUBLIC_REGISTER is left unset, so this file exercises the default
 * (closed) posture. The flag parsing itself is covered in config.test.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FastifyInstance } from 'fastify'

vi.hoisted(() => {
  process.env.USE_TRUSTED_CONNECTION = 'false'
  process.env.NODE_ENV = process.env.NODE_ENV || 'test'
  process.env.API_COOKIE_SECRET ||= 'register-suite-cookie-secret-value'
  process.env.VAULT_KMS_WRAP_KEY ||=
    '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1ff'
  process.env.DATABASE_URL ||=
    'sqlserver://localhost:1433;database=SecureVaultUnit;user=sa;password=unit-tests-only;trustServerCertificate=true'
  delete process.env.ALLOW_PUBLIC_REGISTER
  delete process.env.ALLOW_PUBLIC_REGISTER_UNSAFE
})

import { DBService } from '@securevault/db'

import { buildApi } from '../app'
import { apiConfig } from '../config'

const CSRF_TOKEN = 'b'.repeat(64)

let app: FastifyInstance
let userCount = 3

function post(body: unknown) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: {
      cookie: `${apiConfig.csrfCookieName}=${CSRF_TOKEN}`,
      'x-csrf-token': CSRF_TOKEN
    },
    payload: body as never
  })
}

describe('public registration is closed by default', () => {
  beforeAll(async () => {
    vi.spyOn(DBService.prototype, 'prisma', 'get').mockReturnValue({
      user: {
        count: vi.fn(async () => userCount),
        findUnique: vi.fn(async () => null),
        create: vi.fn()
      },
      auditLog: { create: vi.fn(async () => ({})) }
    } as never)

    app = await buildApi()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    userCount = 3
  })

  it('is disabled without the env flag', () => {
    expect(apiConfig.allowPublicRegister).toBe(false)
  })

  it('answers 404, not 403, when accounts already exist', async () => {
    const res = await post({ username: 'someone-new', password: 'a-long-enough-passphrase' })

    // 403 would confirm the endpoint is real; 404 does not.
    expect(res.statusCode).toBe(404)
    expect(res.statusCode).not.toBe(403)
    expect(JSON.parse(res.payload)).toEqual({ error: 'Not found.' })
  })

  it('does not reveal whether the username exists', async () => {
    const taken = await post({ username: 'existing-admin', password: 'a-long-enough-passphrase' })
    const free = await post({ username: 'nobody-at-all', password: 'a-long-enough-passphrase' })

    expect(taken.statusCode).toBe(free.statusCode)
    expect(taken.payload).toBe(free.payload)
  })

  it('still lets a fresh deployment create its first admin', async () => {
    userCount = 0

    const res = await post({ username: 'first-admin', password: 'a-long-enough-passphrase' })

    // The bootstrap gate opens; what happens past it needs a real database.
    expect(res.statusCode).not.toBe(404)
  })
})
