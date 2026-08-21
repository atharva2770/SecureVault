import { randomBytes } from 'node:crypto'

import { apiConfig } from './config'

export interface HttpSession {
  sessionId: string
  userId: string
  username: string
  role: string
  roles: string[]
  createdAt: number
  lastActivityAt: number
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

  create(input: Omit<HttpSession, 'sessionId' | 'createdAt' | 'lastActivityAt'>): HttpSession {
    const now = Date.now()
    const session: HttpSession = {
      ...input,
      sessionId: randomBytes(32).toString('hex'),
      createdAt: now,
      lastActivityAt: now
    }
    sessions.set(session.sessionId, session)
    return session
  }

  get(sessionId: string | undefined): HttpSession | null {
    if (!sessionId) return null
    const session = sessions.get(sessionId)
    if (!session) return null
    if (Date.now() - session.lastActivityAt > apiConfig.idleTimeoutMs) {
      sessions.delete(sessionId)
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

  destroy(sessionId: string | undefined): void {
    if (sessionId) sessions.delete(sessionId)
  }
}

export const httpSessions = HttpSessionStore.getInstance()
