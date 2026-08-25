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
    if (Date.now() - session.lastActivityAt > apiConfig.idleTimeoutMs) {
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

  private drop(sessionId: string): void {
    const session = sessions.get(sessionId)
    if (session?.kek) secureZero(session.kek)
    sessions.delete(sessionId)
  }
}

export const httpSessions = HttpSessionStore.getInstance()
