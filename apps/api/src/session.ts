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

/**
 * Deliberately a constant and not config: this module is imported by unit tests
 * that never load the environment, and reading apiConfig at construction time
 * would make importing it throw.
 */
const SWEEP_INTERVAL_MS = 60_000

/** Concurrent sessions one user may hold before the oldest is revoked. */
const MAX_SESSIONS_PER_USER = 5

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

  private sweeper: ReturnType<typeof setInterval> | null = null

  private constructor() {
    this.startSweeper()
  }

  static getInstance(): HttpSessionStore {
    if (!HttpSessionStore.instance) {
      HttpSessionStore.instance = new HttpSessionStore()
    }
    return HttpSessionStore.instance
  }

  /**
   * Starts the periodic sweep. Idempotent, and `unref`'d so it never holds the
   * event loop open or delays process exit.
   */
  startSweeper(): void {
    if (this.sweeper) return
    this.sweeper = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS)
    this.sweeper.unref()
  }

  /**
   * Stops the periodic sweep. This is the method the graceful-shutdown handler
   * (P0-06) should call. Always clears the handle, so a stop under swapped
   * timers cannot leave the store believing it still has a live sweeper.
   */
  stopSweeper(): void {
    if (this.sweeper) clearInterval(this.sweeper)
    this.sweeper = null
  }

  /** Live session count — for tests and the readiness endpoint. */
  size(): number {
    return sessions.size
  }

  /**
   * Expiry used to be evaluated only inside `get()`, so a session whose owner
   * simply closed their browser was never revisited: the entry and its KEK
   * stayed resident until the process restarted. Sweeping makes `drop()` — and
   * with it `secureZero` — reachable without a request.
   */
  private sweep(now = Date.now()): number {
    let dropped = 0
    try {
      const idleMs = apiConfig.idleTimeoutMs
      const absoluteMs = apiConfig.sessionAbsoluteMaxMs
      for (const [id, session] of sessions) {
        if (now - session.lastActivityAt > idleMs || now - session.createdAt > absoluteMs) {
          this.drop(id)
          dropped += 1
        }
      }
    } catch {
      // A background timer must never take the process down. `get()` still
      // enforces both deadlines on the next request either way.
    }
    return dropped
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
    this.enforceUserSessionCap(session.userId)
    return session
  }

  /**
   * Bounds the map against a scripted login loop: past the cap, this user's
   * oldest session is revoked (and its KEK zeroed) to make room.
   */
  private enforceUserSessionCap(userId: string): void {
    const mine: HttpSession[] = []
    for (const session of sessions.values()) {
      if (session.userId === userId) mine.push(session)
    }
    if (mine.length <= MAX_SESSIONS_PER_USER) return

    // Map iteration is insertion-ordered and the sort is stable, so sessions
    // created in the same millisecond still fall out in creation order.
    mine.sort((a, b) => a.createdAt - b.createdAt)
    for (const stale of mine.slice(0, mine.length - MAX_SESSIONS_PER_USER)) {
      this.drop(stale.sessionId)
    }
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

  /** Revokes every session and zeroes every KEK. */
  destroyAll(): number {
    const revoked = sessions.size
    for (const id of [...sessions.keys()]) {
      this.drop(id)
    }
    return revoked
  }

  private drop(sessionId: string): void {
    const session = sessions.get(sessionId)
    if (session?.kek) {
      secureZero(session.kek)
      // Anything still holding this record sees no key rather than a spent one.
      session.kek = undefined
    }
    sessions.delete(sessionId)
  }
}

export const httpSessions = HttpSessionStore.getInstance()
