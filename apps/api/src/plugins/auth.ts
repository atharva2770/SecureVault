import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { AccessControlService, AuditAction, bindAuditUser, recordAudit } from '@securevault/core'

import { apiConfig } from '../config'
import { HttpError } from '../httpErrors'
import type { HttpSession } from '../session'
import { httpSessions } from '../session'

/** Effective identity resolved once per request from the server-side rights model. */
export interface RequestIdentity {
  userId: string
  roleCodes: string[]
  isAdmin: boolean
}

declare module 'fastify' {
  interface FastifyRequest {
    vaultSession: HttpSession | null
    /** Resolved once per request by the auth guard; never trusted from the client. */
    identity: RequestIdentity | null
  }
}

const acl = AccessControlService.getInstance()

const PUBLIC_PATHS = new Set([
  '/health',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
  '/api/auth/session'
])

const ADMIN_PREFIX = '/api/admin/'

/*
  Lightweight probing monitor: counts 403s per user in a rolling window and
  emits a structured security log when a user trips the threshold, surfacing
  likely authorization-probing behaviour to log-based alerting.
*/
const FORBIDDEN_WINDOW_MS = 5 * 60 * 1000
const FORBIDDEN_ALERT_AT = 8
const forbiddenHits = new Map<string, { count: number; firstAt: number; alerted: boolean }>()

export function recordForbidden(userId: string | null | undefined, path: string): void {
  if (!userId) return
  const now = Date.now()
  const row = forbiddenHits.get(userId)
  if (!row || now - row.firstAt > FORBIDDEN_WINDOW_MS) {
    forbiddenHits.set(userId, { count: 1, firstAt: now, alerted: false })
    return
  }
  row.count += 1
  if (row.count >= FORBIDDEN_ALERT_AT && !row.alerted) {
    row.alerted = true
    console.warn(
      JSON.stringify({
        level: 'security',
        event: 'authz_probing_suspected',
        userId,
        forbiddenCount: row.count,
        windowMs: FORBIDDEN_WINDOW_MS,
        lastPath: path
      })
    )
  }
}

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

/**
 * Resolves the caller's effective identity from the rights model (roles + admin
 * flag) using the ACL cache. Never derived from client input or the cookie body.
 */
async function resolveIdentity(userId: string): Promise<RequestIdentity> {
  const [roleCodes, isAdmin] = await Promise.all([acl.getRoleCodes(userId), acl.isAdmin(userId)])
  return { userId, roleCodes, isAdmin }
}

export async function registerAuthGuard(app: FastifyInstance): Promise<void> {
  app.decorateRequest('vaultSession', null)
  app.decorateRequest('identity', null)

  app.addHook('preHandler', async (request, reply) => {
    const path = request.url.split('?')[0] ?? request.url
    const session = httpSessions.touch(readSessionId(request))
    request.vaultSession = session
    bindAuditUser(session?.userId)

    if (PUBLIC_PATHS.has(path)) {
      return
    }

    if (!session) {
      return reply.status(401).send({ error: 'Vault is locked. Sign in to continue.' })
    }

    // Resolve effective rights once per request, exposed to every handler so a
    // route can never accidentally skip the check.
    try {
      request.identity = await resolveIdentity(session.userId)
    } catch {
      request.identity = null
    }

    // Server-side admin gate for the entire admin surface (defense in depth;
    // the service layer also verifies). Non-admins never reach admin handlers.
    if (path.startsWith(ADMIN_PREFIX) && !request.identity?.isAdmin) {
      recordForbidden(session.userId, path)
      recordAudit({
        action: AuditAction.AUTH_DENY,
        userId: session.userId,
        details: `deny:admin-route:${path}`
      })
      return reply.status(403).send({ error: 'Access denied. Admin privileges required.' })
    }
  })

  // Catch every 403 (including those thrown deep in services) for probing detection.
  app.addHook('onResponse', async (request, reply) => {
    if (reply.statusCode === 403 && request.vaultSession) {
      const path = request.url.split('?')[0] ?? request.url
      if (!path.startsWith(ADMIN_PREFIX)) {
        recordForbidden(request.vaultSession.userId, path)
      }
    }
  })
}

export function requireSession(request: FastifyRequest): HttpSession {
  if (!request.vaultSession) {
    throw new HttpError(401, 'Vault is locked. Sign in to continue.')
  }
  return request.vaultSession
}

/**
 * Route-level admin assertion for use inside handlers when the global gate is
 * not sufficient (e.g. mixed routes). Throws 403 for non-admins.
 */
export function requireAdmin(request: FastifyRequest): RequestIdentity {
  const session = requireSession(request)
  if (!request.identity?.isAdmin) {
    recordForbidden(session.userId, request.url)
    recordAudit({
      action: AuditAction.AUTH_DENY,
      userId: session.userId,
      details: `deny:admin-route:${request.url.split('?')[0] ?? request.url}`
    })
    throw new HttpError(403, 'Access denied. Admin privileges required.')
  }
  return request.identity
}
