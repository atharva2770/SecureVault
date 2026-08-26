import { randomBytes, timingSafeEqual } from 'node:crypto'

import type { FastifyInstance } from 'fastify'

import { apiConfig } from '../config'

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
      reply.setCookie(apiConfig.csrfCookieName, token, {
        path: '/',
        httpOnly: false,
        sameSite: 'lax',
        secure: apiConfig.cookieSecure,
        maxAge: Math.ceil(apiConfig.idleTimeoutMs / 1000)
      })
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
