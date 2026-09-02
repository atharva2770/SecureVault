/**
 * The session cookie must slide with activity, not only be issued at login.
 *
 * No database: GET /api/auth/session is a public path, so the auth guard returns
 * before it resolves an identity, and the path is in auditClassify's SKIP_PATHS
 * so the fallback audit writer never touches Prisma either. The session is
 * injected straight into the in-memory store.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { FastifyInstance } from 'fastify'

// Hoisted above the imports below so apiConfig resolves without a local .env.
vi.hoisted(() => {
  process.env.USE_TRUSTED_CONNECTION = 'false'
  process.env.NODE_ENV = process.env.NODE_ENV || 'test'
  process.env.API_COOKIE_SECRET ||= 'session-cookie-suite-cookie-secret'
  process.env.VAULT_KMS_WRAP_KEY ||=
    '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1ff'
  process.env.DATABASE_URL ||=
    'sqlserver://localhost:1433;database=SecureVaultUnit;user=sa;password=unit-tests-only;trustServerCertificate=true'
  process.env.VAULT_IDLE_TIMEOUT_MS = '900000'
  process.env.VAULT_SESSION_MAX_MS = '43200000'
})

import { buildApi } from '../app'
import { apiConfig } from '../config'
import type { HttpSession } from '../session'
import { httpSessions } from '../session'

interface ParsedCookie {
  name: string
  value: string
  maxAge?: number
}

const CSRF_TOKEN = 'a'.repeat(64)
const IDLE_SECONDS = 900

let app: FastifyInstance

function cookiesOf(res: { cookies: unknown }): ParsedCookie[] {
  return res.cookies as ParsedCookie[]
}

function sessionFor(userId: string): HttpSession {
  return httpSessions.create({
    userId,
    username: userId,
    role: 'member',
    roles: ['MEMBER']
  })
}

function cookieHeader(session: HttpSession): string {
  return `${apiConfig.csrfCookieName}=${CSRF_TOKEN}; ${apiConfig.cookieName}=${app.signCookie(
    session.sessionId
  )}`
}

function authenticatedGet(session: HttpSession) {
  return app.inject({
    method: 'GET',
    url: '/api/auth/session',
    headers: { cookie: cookieHeader(session) }
  })
}

describe('session cookie slides with activity', () => {
  beforeAll(async () => {
    app = await buildApi()
    await app.ready()
  })

  afterAll(async () => {
    httpSessions.destroyAll()
    httpSessions.stopSweeper()
    await app.close()
  })

  it('re-issues the session cookie on an ordinary authenticated GET', async () => {
    const session = sessionFor('sliding-user')
    // As if the user had been working for a while since the cookie was issued.
    session.cookieIssuedAt = Date.now() - 10 * 60 * 1000

    const res = await authenticatedGet(session)
    expect(res.statusCode).toBe(200)

    const reissued = cookiesOf(res).find((c) => c.name === apiConfig.cookieName)
    expect(reissued).toBeDefined()
    // Same signed value — sliding must never rotate the session id.
    expect(reissued?.value).toBe(app.signCookie(session.sessionId))
  })

  it('gives the cookie a longer life than the server idle window', async () => {
    const session = sessionFor('maxage-user')
    session.cookieIssuedAt = Date.now() - 10 * 60 * 1000

    const res = await authenticatedGet(session)

    const reissued = cookiesOf(res).find((c) => c.name === apiConfig.cookieName)
    // cookieIssuedAt is always <= lastActivityAt, so a maxAge equal to the idle
    // window would guarantee the browser drops the cookie first.
    expect(reissued?.maxAge).toBeGreaterThan(IDLE_SECONDS)
  })

  it('does not re-issue a cookie that was only just issued', async () => {
    const session = sessionFor('fresh-user')

    const res = await authenticatedGet(session)
    expect(res.statusCode).toBe(200)

    expect(cookiesOf(res).some((c) => c.name === apiConfig.cookieName)).toBe(false)
  })

  it('slides the csrf token on a safe request without rotating it', async () => {
    const session = sessionFor('csrf-user')

    const res = await authenticatedGet(session)

    const csrf = cookiesOf(res).find((c) => c.name === apiConfig.csrfCookieName)
    expect(csrf?.value).toBe(CSRF_TOKEN)
    expect(csrf?.maxAge).toBeGreaterThan(IDLE_SECONDS)
  })

  it('sends exactly one expiring session cookie on logout', async () => {
    const session = sessionFor('logout-user')
    session.cookieIssuedAt = Date.now() - 10 * 60 * 1000

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: cookieHeader(session), 'x-csrf-token': CSRF_TOKEN }
    })
    expect(res.statusCode).toBe(200)

    // The guard refresh must never race the handler's clearCookie into a
    // set-then-clear pair for the same cookie.
    const entries = cookiesOf(res).filter((c) => c.name === apiConfig.cookieName)
    expect(entries).toHaveLength(1)
    expect(entries[0].value).toBe('')
  })

  it('leaves an unauthenticated request without a session cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/session' })
    expect(res.statusCode).toBe(200)

    expect(cookiesOf(res).some((c) => c.name === apiConfig.cookieName)).toBe(false)
    // A client with no token still gets issued one.
    expect(cookiesOf(res).some((c) => c.name === apiConfig.csrfCookieName)).toBe(true)
  })
})
