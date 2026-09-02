import { randomBytes, timingSafeEqual } from 'node:crypto'

import type { FastifyInstance } from 'fastify'

import { apiConfig } from '../config'
import { slidingCookieMaxAgeSeconds } from '../session'

/*
  Double-submit CSRF protection.

  The session cookie is httpOnly + SameSite=Lax (which already blocks classic
  cross-site form/fetch POSTs from attaching it), so this is defense in depth.
  We additionally issue a non-httpOnly `sv_csrf` cookie that the SPA echoes back
  in an `x-csrf-token` header on every state-changing request. A forged cross-site
  request cannot read the victim's cookie, so it cannot produce a matching header.

  Safe methods (GET/HEAD/OPTIONS) are never checked; they only (re)issue the token.
*/

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const CSRF_HEADER = 'x-csrf-token'

/**
 * One source of truth for the cookie's attributes. `httpOnly` must stay false —
 * the SPA reads this value from document.cookie to echo it back in the header.
 */
function csrfCookieOptions() {
  return {
    path: '/',
    httpOnly: false,
    sameSite: 'lax' as const,
    secure: apiConfig.cookieSecure,
    maxAge: slidingCookieMaxAgeSeconds()
  }
}

function tokensMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export async function registerCsrf(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (request, reply) => {
    const existing = request.cookies[apiConfig.csrfCookieName]

    // Issue a token to any client that doesn't have one yet (e.g. on the SPA's
    // initial GET /api/auth/session), so later unsafe requests can echo it.
    if (!existing) {
      const token = randomBytes(32).toString('hex')
      reply.setCookie(apiConfig.csrfCookieName, token, csrfCookieOptions())
    } else if (SAFE_METHODS.has(request.method)) {
      // Slide the token's expiry the same way the session cookie slides. Without
      // this the token dies mid-session and every mutating request starts failing
      // with a 403 the user cannot clear — the check below compares against the
      // OLD cookie, so the request that would refresh it is itself rejected.
      // Kept in this hook (rather than exported for the auth guard to call) so it
      // can never race the issue branch above: at preHandler time a brand new
      // client still has no request cookie, and re-setting under the same cookie
      // key would overwrite the token just issued.
      reply.setCookie(apiConfig.csrfCookieName, existing, csrfCookieOptions())
    }

    if (SAFE_METHODS.has(request.method)) return
    if (!request.url.startsWith('/api/')) return

    const header = request.headers[CSRF_HEADER]
    const headerValue = Array.isArray(header) ? header[0] : header
    if (!tokensMatch(existing, headerValue)) {
      request.log.warn(
        { event: 'csrf_rejected', method: request.method, path: request.url.split('?')[0] },
        'CSRF token missing or mismatched'
      )
      return reply.status(403).send({ error: 'Invalid or missing security token.' })
    }
  })
}
