import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { apiConfig } from '../config'
import { HttpError } from '../httpErrors'
import type { HttpSession } from '../session'
import { httpSessions } from '../session'

declare module 'fastify' {
  interface FastifyRequest {
    vaultSession: HttpSession | null
  }
}

const PUBLIC_PATHS = new Set([
  '/health',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
  '/api/auth/session'
])

export function setSessionCookie(reply: FastifyReply, sessionId: string): void {
  reply.setCookie(apiConfig.cookieName, sessionId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: apiConfig.cookieSecure,
    signed: true,
    maxAge: Math.ceil(apiConfig.idleTimeoutMs / 1000)
  })
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(apiConfig.cookieName, { path: '/' })
}

export function readSessionId(request: FastifyRequest): string | undefined {
  const raw = request.cookies[apiConfig.cookieName]
  if (!raw) return undefined
  const unsigned = request.unsignCookie(raw)
  if (!unsigned.valid || !unsigned.value) return undefined
  return unsigned.value
}

export async function registerAuthGuard(app: FastifyInstance): Promise<void> {
  app.decorateRequest('vaultSession', null)

  app.addHook('preHandler', async (request, reply) => {
    const path = request.url.split('?')[0] ?? request.url
    const session = httpSessions.touch(readSessionId(request))
    request.vaultSession = session

    if (PUBLIC_PATHS.has(path)) {
      return
    }

    if (!session) {
      return reply.status(401).send({ error: 'Vault is locked. Sign in to continue.' })
    }
  })
}

export function requireSession(request: FastifyRequest): HttpSession {
  if (!request.vaultSession) {
    throw new HttpError(401, 'Vault is locked. Sign in to continue.')
  }
  return request.vaultSession
}
