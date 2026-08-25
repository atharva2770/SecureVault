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
  /** In-memory KEK for this session. Never sent to the browser. */
  kek?: Buffer
}

const sessions = new Map<string, HttpSession>()

export class HttpSessionStore {
  private static instance: HttpSessionStore | null = null

  static getInstance(): HttpSessionStore {
    if (!HttpSessionStore.instance) {
      HttpSessionStore.instance = new HttpSessionStore()
    }
    return HttpSessionStore.instance
  }

  create(
    input: Omit<HttpSession, 'sessionId' | 'createdAt' | 'lastActivityAt'>
  ): HttpSession {
    const now = Date.now()
    const session: HttpSession = {
      ...input,
      sessionId: randomBytes(32).toString('hex'),
      createdAt: now,
      lastActivityAt: now,
      kek: input.kek ? Buffer.from(input.kek) : undefined
    }
    sessions.set(session.sessionId, session)
    return session
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
