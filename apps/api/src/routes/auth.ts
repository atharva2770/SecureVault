import { AuthCredentials, secureZero } from '@securevault/core'
import type { FastifyInstance } from 'fastify'

import { apiConfig } from '../config'
import { clientMeta, sendError } from '../httpErrors'
import {
  clearSessionCookie,
  readSessionId,
  requireSession,
  setSessionCookie
} from '../plugins/auth'
import { httpSessions } from '../session'

const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX = 10

function assertLoginRate(ip: string): void {
  const now = Date.now()
  const row = loginAttempts.get(ip)
  if (!row || now > row.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS })
    return
  }
  row.count += 1
  if (row.count > LOGIN_MAX) {
    throw new Error('Too many login attempts. Try again later.')
  }
}

function sessionPayload(unlocked: boolean, session: ReturnType<typeof httpSessions.create> | null) {
  return {
    unlocked,
    idleTimeoutMs: apiConfig.idleTimeoutMs,
    user: session
      ? {
          userId: session.userId,
          username: session.username,
          role: session.role,
          roles: session.roles,
          createdAt: new Date(session.createdAt).toISOString(),
          lastLoginAt: null
        }
      : null
  }
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const credentials = AuthCredentials.getInstance()

  app.post('/api/auth/register', async (request, reply) => {
    try {
      const body = (request.body ?? {}) as { username?: string; password?: string }
      const result = await credentials.register(body.username ?? '', body.password ?? '', {
        ipOrDevice: clientMeta(request)
      })
      try {
        const session = httpSessions.create({
          userId: result.user.userId,
          username: result.user.username,
          role: result.user.role,
          roles: result.roles
        })
        setSessionCookie(reply, session.sessionId)
        const user = credentials.toUserDto(result.user, result.roles)
        return { user, session: sessionPayload(true, session) }
      } finally {
        secureZero(result.kek)
      }
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/auth/login', async (request, reply) => {
    try {
      assertLoginRate(request.ip)
      const body = (request.body ?? {}) as { username?: string; password?: string }
      const result = await credentials.login(body.username ?? '', body.password ?? '', {
        ipOrDevice: clientMeta(request)
      })
      try {
        const session = httpSessions.create({
          userId: result.user.userId,
          username: result.user.username,
          role: result.user.role,
          roles: result.roles
        })
        setSessionCookie(reply, session.sessionId)
        const user = credentials.toUserDto(result.user, result.roles)
        return { user, session: sessionPayload(true, session) }
      } finally {
        secureZero(result.kek)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed.'
      if (message.includes('Too many')) {
        return reply.status(429).send({ error: message })
      }
      return sendError(reply, error)
    }
  })

  app.post('/api/auth/logout', async (request, reply) => {
    httpSessions.destroy(readSessionId(request))
    clearSessionCookie(reply)
    return sessionPayload(false, null)
  })

  app.get('/api/auth/session', async (request) => {
    return sessionPayload(Boolean(request.vaultSession), request.vaultSession)
  })

  app.post('/api/auth/touch', async (request, reply) => {
    try {
      requireSession(request)
      return { ok: true, idleTimeoutMs: apiConfig.idleTimeoutMs }
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/auth/change-password', async (request, reply) => {
    try {
      const session = requireSession(request)
      const body = (request.body ?? {}) as {
        currentPassword?: string
        newPassword?: string
      }
      const result = await credentials.changePassword(
        session.userId,
        body.currentPassword ?? '',
        body.newPassword ?? ''
      )
      secureZero(result.kek)
      return { ok: true }
    } catch (error) {
      return sendError(reply, error)
    }
  })
}
