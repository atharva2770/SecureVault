import { AuthCredentials, secureZero } from '@securevault/core'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

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
import { changePasswordBodySchema, loginBodySchema, registerBodySchema } from '../schemas/auth'
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
  const r = app.withTypeProvider<ZodTypeProvider>()

  r.post('/api/auth/register', { schema: { body: registerBodySchema } }, async (request, reply) => {
    try {
      // Closed by default. 404 rather than 403 so the reply does not confirm the
      // route exists at all — except while the vault has no accounts, which is
      // how a fresh deployment creates its first admin.
      if (!apiConfig.allowPublicRegister && !(await credentials.hasNoUsers())) {
        request.log.warn(
          { event: 'register_disabled', ip: request.ip },
          'registration attempt while disabled'
        )
        return reply.status(404).send({ error: 'Not found.' })
      }

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
      const { username, password } = request.body
      const result = await credentials.register(username, password, {
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
        setSessionCookie(reply, session)
        const user = credentials.toUserDto(result.user, result.roles)
        return { user, session: sessionPayload(true, session) }
      } finally {
        secureZero(result.kek)
      }
    } catch (error) {
      return sendError(reply, error)
    }
  })

  r.post('/api/auth/login', { schema: { body: loginBodySchema } }, async (request, reply) => {
    const { username, password } = request.body
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
      const result = await credentials.login(username, password, {
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
        setSessionCookie(reply, session)
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

  r.post('/api/auth/logout', async (request, reply) => {
    httpSessions.destroy(readSessionId(request))
    clearSessionCookie(reply)
    return sessionPayload(false, null)
  })

  r.get('/api/auth/session', async (request) => {
    return sessionPayload(Boolean(request.vaultSession), request.vaultSession)
  })

  r.post('/api/auth/touch', async (request, reply) => {
    try {
      requireSession(request)
      return { ok: true, idleTimeoutMs: apiConfig.idleTimeoutMs }
    } catch (error) {
      return sendError(reply, error)
    }
  })

  r.post(
    '/api/auth/change-password',
    { schema: { body: changePasswordBodySchema } },
    async (request, reply) => {
      try {
        const session = requireSession(request)
        const { currentPassword, newPassword } = request.body
        const result = await credentials.changePassword(session.userId, currentPassword, newPassword)
        const currentSessionId = readSessionId(request)
        httpSessions.destroyAllForUser(session.userId, currentSessionId)
        httpSessions.replaceKek(currentSessionId, result.kek)
        secureZero(result.kek)
        return { ok: true }
      } catch (error) {
        return sendError(reply, error)
      }
    }
  )
}
