import { BrowserWindow } from 'electron'

import { IpcChannels } from '../../shared/ipc'
import { secureZero } from '../utils/secure'

export interface VaultSessionData {
  userId: string
  username: string
  role: string
  roles: string[]
  /** In-memory KEK only — never written to disk or IPC. */
  kek: Buffer
  unlockedAt: number
  lastActivityAt: number
}

/**
 * Process-lifetime vault session holding the unlocked KEK in RAM only.
 * Singleton by design so AuthService / FileService share one key state.
 */
export class VaultSession {
  private static instance: VaultSession | null = null

  private data: VaultSessionData | null = null
  private idleTimer: NodeJS.Timeout | null = null
  private idleTimeoutMs: number

  private constructor() {
    const fromEnv = Number(process.env.VAULT_IDLE_TIMEOUT_MS)
    this.idleTimeoutMs =
      Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 15 * 60 * 1000
  }

  static getInstance(): VaultSession {
    if (!VaultSession.instance) {
      VaultSession.instance = new VaultSession()
    }
    return VaultSession.instance
  }

  get idleTimeoutMilliseconds(): number {
    return this.idleTimeoutMs
  }

  get isUnlocked(): boolean {
    return this.data !== null
  }

  /**
   * Returns a copy of session metadata without exposing the KEK buffer.
   */
  getPublicInfo(): Omit<VaultSessionData, 'kek'> | null {
    if (!this.data) return null
    const { userId, username, role, roles, unlockedAt, lastActivityAt } = this.data
    return { userId, username, role, roles, unlockedAt, lastActivityAt }
  }

  /**
   * Provides the live KEK for crypto operations. Caller must not retain
   * or free the buffer — ownership stays with VaultSession.
   */
  requireKek(): Buffer {
    if (!this.data) {
      throw new Error('Vault is locked. Sign in to unlock.')
    }
    this.touch()
    return this.data.kek
  }

  requireUserId(): string {
    if (!this.data) {
      throw new Error('Vault is locked. Sign in to unlock.')
    }
    this.touch()
    return this.data.userId
  }

  /**
   * Opens an unlocked session and (re)starts the idle auto-lock timer.
   * Replaces any prior session and zeroes the previous KEK.
   */
  unlock(session: Omit<VaultSessionData, 'unlockedAt' | 'lastActivityAt'>): void {
    this.lock({ notify: false })

    const now = Date.now()
    this.data = {
      ...session,
      unlockedAt: now,
      lastActivityAt: now
    }
    this.armIdleTimer()
  }

  /**
   * Extends the idle window after authenticated activity.
   */
  touch(): void {
    if (!this.data) return
    this.data.lastActivityAt = Date.now()
    this.armIdleTimer()
  }

  /**
   * Zeroes the KEK and clears session state.
   */
  lock(options: { notify?: boolean } = { notify: true }): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }

    if (this.data) {
      secureZero(this.data.kek)
      this.data = null
    }

    if (options.notify !== false) {
      this.broadcastLocked()
    }
  }

  private armIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
    }

    this.idleTimer = setTimeout(() => {
      this.lock({ notify: true })
    }, this.idleTimeoutMs)

    // Do not keep the process alive solely for the idle timer.
    this.idleTimer.unref?.()
  }

  private broadcastLocked(): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IpcChannels.events.vaultLocked)
      }
    }
  }
}

export default VaultSession
