import { randomBytes } from 'node:crypto'

import { secureZero } from '@securevault/core'

import { apiConfig } from './config'

export interface HttpSession {
  sessionId: string
  userId: string
  username: string
  role: string
  roles: string[]
  createdAt: number
  lastActivityAt: number
  /** When the browser was last handed a cookie for this session. */
  cookieIssuedAt: number
  /** In-memory KEK for this session. Never sent to the browser. */
  kek?: Buffer
}

const sessions = new Map<string, HttpSession>()

/*
  Cookie lifetime vs. server lifetime.

  The server slides its idle window on every request (`touch`), but a cookie's
  maxAge is fixed at the moment it is issued. Since `cookieIssuedAt` can only
  ever be <= `lastActivityAt`, a cookie whose maxAge equals the idle window
  ALWAYS expires before the session does — logging out a user the server still
  considers active, and orphaning a live session in the map. Both cookies
  therefore get the refresh fraction plus a clock-skew allowance on top of the
  idle window, so the cookie outlives the server's view. A cookie that outlives
  its session is harmless: HttpSessionStore.get() remains the sole authority and
  answers 401.
*/
export const COOKIE_REFRESH_FRACTION = 0.25
const COOKIE_CLOCK_SKEW_MS = 60_000

function toMaxAgeSeconds(ms: number): number {
  // The cookie serializer rejects a non-integer maxAge and treats <= 0 as a
  // deletion, so never emit either.
  return Number.isFinite(ms) ? Math.max(1, Math.ceil(ms / 1000)) : 1
}

function slidingWindowMs(): number {
  return apiConfig.idleTimeoutMs * (1 + COOKIE_REFRESH_FRACTION) + COOKIE_CLOCK_SKEW_MS
}

/** Lifetime for cookies not bound to a single session (the CSRF token). */
export function slidingCookieMaxAgeSeconds(): number {
  return toMaxAgeSeconds(slidingWindowMs())
}

/**
 * Session cookie lifetime, capped at the session's remaining absolute lifetime
 * so the browser never holds a cookie the server is already certain to refuse.
 */
export function sessionCookieMaxAgeSeconds(session: HttpSession, now = Date.now()): number {
  const untilAbsoluteCap = session.createdAt + apiConfig.sessionAbsoluteMaxMs - now
  return toMaxAgeSeconds(Math.min(slidingWindowMs(), untilAbsoluteCap))
}

/**
 * True once enough of the idle window has elapsed that re-issuing the cookie is
 * worth a Set-Cookie header. Throttling this keeps the header off most
 * responses while still leaving the browser copy far longer than the server's.
 */
export function shouldRefreshSessionCookie(session: HttpSession, now = Date.now()): boolean {
  return now - session.cookieIssuedAt >= apiConfig.idleTimeoutMs * COOKIE_REFRESH_FRACTION
}

export class HttpSessionStore {
  private static instance: HttpSessionStore | null = null

  static getInstance(): HttpSessionStore {
    if (!HttpSessionStore.instance) {
      HttpSessionStore.instance = new HttpSessionStore()
    }
    return HttpSessionStore.instance
  }

  create(
    input: Omit<HttpSession, 'sessionId' | 'createdAt' | 'lastActivityAt' | 'cookieIssuedAt'>
  ): HttpSession {
    const now = Date.now()
    const session: HttpSession = {
      ...input,
      sessionId: randomBytes(32).toString('hex'),
      createdAt: now,
      lastActivityAt: now,
      cookieIssuedAt: now,
      kek: input.kek ? Buffer.from(input.kek) : undefined
    }
    sessions.set(session.sessionId, session)
    return session
  }

  /** Records that the browser was just handed a fresh cookie for this session. */
  markCookieIssued(sessionId: string, at = Date.now()): void {
    const session = sessions.get(sessionId)
    if (session) session.cookieIssuedAt = at
  }

  get(sessionId: string | undefined): HttpSession | null {
    if (!sessionId) return null
    const session = sessions.get(sessionId)
    if (!session) return null
    const now = Date.now()
    if (now - session.lastActivityAt > apiConfig.idleTimeoutMs) {
      this.drop(sessionId)
      return null
    }
    // Absolute cap independent of activity: a stolen session can't live forever.
    if (now - session.createdAt > apiConfig.sessionAbsoluteMaxMs) {
      this.drop(sessionId)
      return null
    }
    return session
  }

  touch(sessionId: string | undefined): HttpSession | null {
    const session = this.get(sessionId)
    if (!session) return null
    session.lastActivityAt = Date.now()
    return session
  }

  replaceKek(sessionId: string | undefined, kek: Buffer): void {
    const session = this.get(sessionId)
    if (!session) return
    if (session.kek) secureZero(session.kek)
    session.kek = Buffer.from(kek)
  }

  destroy(sessionId: string | undefined): void {
    if (sessionId) this.drop(sessionId)
  }

  /**
   * Revokes every session belonging to a user, optionally keeping one alive
   * (the one that initiated a password change). Used to make a credential
   * change invalidate all other logged-in sessions immediately.
   */
  destroyAllForUser(userId: string, exceptSessionId?: string): number {
    let revoked = 0
    for (const [id, session] of sessions) {
      if (session.userId !== userId) continue
      if (exceptSessionId && id === exceptSessionId) continue
      this.drop(id)
      revoked += 1
    }
    return revoked
  }

  private drop(sessionId: string): void {
    const session = sessions.get(sessionId)
    if (session?.kek) secureZero(session.kek)
    sessions.delete(sessionId)
  }
}

export const httpSessions = HttpSessionStore.getInstance()
