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
import {
  assertLoginAllowed,
  assertRegisterAllowed,
  recordLoginFailure,
  recordLoginSuccess,
  recordRegisterAttempt,
  TooManyAttemptsError
} from '../plugins/rateLimit'
import { httpSessions } from '../session'

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
      try {
        assertRegisterAllowed(request.ip)
      } catch (error) {
        if (error instanceof TooManyAttemptsError) {
          return reply
            .header('Retry-After', Math.ceil(error.retryAfterMs / 1000))
            .status(429)
            .send({ error: error.message })
        }
        throw error
      }
      recordRegisterAttempt(request.ip)
      const body = (request.body ?? {}) as { username?: string; password?: string }
      const result = await credentials.register(body.username ?? '', body.password ?? '', {
        ipOrDevice: clientMeta(request)
      })
      try {
        const session = httpSessions.create({
          userId: result.user.userId,
          username: result.user.username,
          role: result.user.role,
          roles: result.roles,
          kek: result.kek
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
    const body = (request.body ?? {}) as { username?: string; password?: string }
    const username = body.username ?? ''
    try {
      assertLoginAllowed(request.ip, username)
    } catch (error) {
      if (error instanceof TooManyAttemptsError) {
        return reply
          .header('Retry-After', Math.ceil(error.retryAfterMs / 1000))
          .status(429)
          .send({ error: error.message })
      }
      throw error
    }

    try {
      const result = await credentials.login(username, body.password ?? '', {
        ipOrDevice: clientMeta(request)
      })
      recordLoginSuccess(request.ip, username)
      try {
        const session = httpSessions.create({
          userId: result.user.userId,
          username: result.user.username,
          role: result.user.role,
          roles: result.roles,
          kek: result.kek
        })
        setSessionCookie(reply, session.sessionId)
        const user = credentials.toUserDto(result.user, result.roles)
        return { user, session: sessionPayload(true, session) }
      } finally {
        secureZero(result.kek)
      }
    } catch (error) {
      recordLoginFailure(request.ip, username)
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
      const currentSessionId = readSessionId(request)
      // A credential change invalidates every other live session for this user.
      httpSessions.destroyAllForUser(session.userId, currentSessionId)
      httpSessions.replaceKek(currentSessionId, result.kek)
      secureZero(result.kek)
      return { ok: true }
    } catch (error) {
      return sendError(reply, error)
    }
  })
}
