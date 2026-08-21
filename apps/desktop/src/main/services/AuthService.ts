import type { Argon2Params } from './CryptoService'
import { AuditAction, AuditService } from './AuditService'
import { CryptoService } from './CryptoService'
import { DBService } from '@securevault/db'
import { RbacService } from './RbacService'
import { VaultSession } from '../session/VaultSession'
import { safeEqualHex, secureZero, sha256Hex } from '../utils/secure'
import type { AuthResultDto, AuthSessionDto, AuthUserDto } from '../../shared/ipc'
import { RoleCode } from '@securevault/domain'

/** Persisted alongside Argon2 params — verifies password without storing the KEK. */
interface StoredAuthParams extends Argon2Params {
  kekVerifier: string
}

export type AuthResult = AuthResultDto

/**
 * Registration / login that derives a KEK into {@link VaultSession} only.
 * The KEK is never written to disk, the DB, or IPC.
 *
 * Unlock / lock / session are desktop adapters. Domain methods such as
 * {@link AuthService.changePassword} take an explicit userId so a future API
 * can call them without a process-wide session.
 */
export class AuthService {
  private static instance: AuthService | null = null

  private readonly db = DBService.getInstance()
  private readonly crypto = CryptoService.getInstance()
  private readonly session = VaultSession.getInstance()
  private readonly audit = AuditService.getInstance()
  private readonly rbac = RbacService.getInstance()

  private constructor() {}

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService()
    }
    return AuthService.instance
  }

  /**
   * Creates a user, derives the KEK into the in-memory vault session, and unlocks.
   */
  async register(username: string, password: string): Promise<AuthResult> {
    const normalized = this.normalizeUsername(username)
    this.assertPassword(password)

    const existing = await this.db.prisma.user.findUnique({
      where: { username: normalized }
    })
    if (existing) {
      throw new Error('Username is already taken.')
    }

    const salt = this.crypto.generateSalt(32)
    const params = this.crypto.getDefaultArgon2Params()
    let kek: Buffer | null = null

    try {
      kek = await this.crypto.deriveKEK(password, salt, params)
      const stored: StoredAuthParams = {
        ...params,
        kekVerifier: sha256Hex(kek)
      }

      const userCount = await this.db.prisma.user.count()
      const isFirstUser = userCount === 0

      const user = await this.db.prisma.user.create({
        data: {
          username: normalized,
          passwordSalt: new Uint8Array(salt),
          argon2Params: JSON.stringify(stored),
          role: isFirstUser ? 'admin' : 'member'
        }
      })

      await this.rbac.assignRole(
        user.userId,
        isFirstUser ? RoleCode.ADMIN : RoleCode.MEMBER
      )

      if (isFirstUser) {
        await this.rbac.grantFullAccessOnCategoryRoots(user.userId, user.userId)
      }

      const roles = await this.rbac.getUserRoleCodes(user.userId)

      this.session.unlock({
        userId: user.userId,
        username: user.username,
        role: user.role,
        roles,
        kek
      })
      kek = null

      await this.audit.write({
        action: AuditAction.UNLOCK,
        userId: user.userId,
        details: 'register'
      })

      return this.buildAuthResult(user, roles)
    } catch (error) {
      secureZero(kek)
      throw error
    }
  }

  /**
   * Verifies credentials, derives KEK into {@link VaultSession}, and unlocks.
   */
  async login(username: string, password: string): Promise<AuthResult> {
    const normalized = this.normalizeUsername(username)
    this.assertPassword(password)

    const user = await this.db.prisma.user.findUnique({
      where: { username: normalized }
    })
    if (!user) {
      throw new Error('Invalid username or password.')
    }
    if (user.isDisabled) {
      throw new Error('This account is disabled.')
    }

    const stored = this.parseStoredParams(user.argon2Params)
    let kek: Buffer | null = null

    try {
      kek = await this.crypto.deriveKEK(password, Buffer.from(user.passwordSalt), stored)

      if (!safeEqualHex(sha256Hex(kek), stored.kekVerifier)) {
        throw new Error('Invalid username or password.')
      }

      await this.db.prisma.user.update({
        where: { userId: user.userId },
        data: { lastLoginAt: new Date() }
      })

      // Ensure legacy users have at least one role row
      let roles = await this.rbac.getUserRoleCodes(user.userId)
      if (!roles.length) {
        await this.rbac.assignRole(user.userId, RoleCode.MEMBER)
        roles = await this.rbac.getUserRoleCodes(user.userId)
      }

      this.session.unlock({
        userId: user.userId,
        username: user.username,
        role: user.role,
        roles,
        kek
      })
      kek = null

      await this.audit.write({
        action: AuditAction.LOGIN,
        userId: user.userId
      })
      await this.audit.write({
        action: AuditAction.UNLOCK,
        userId: user.userId
      })

      const refreshed = await this.db.prisma.user.findUniqueOrThrow({
        where: { userId: user.userId }
      })

      return this.buildAuthResult(refreshed, roles)
    } catch (error) {
      secureZero(kek)
      if (error instanceof Error && error.message === 'Invalid username or password.') {
        throw error
      }
      throw new Error('Invalid username or password.')
    }
  }

  /**
   * Re-derives and stores a new KEK verifier after a password change.
   * The vault must already be unlocked with the current password.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    this.assertPassword(currentPassword)
    this.assertPassword(newPassword)

    const user = await this.db.prisma.user.findUniqueOrThrow({ where: { userId } })
    const stored = this.parseStoredParams(user.argon2Params)

    let currentKek: Buffer | null = null
    let nextKek: Buffer | null = null

    try {
      currentKek = await this.crypto.deriveKEK(
        currentPassword,
        Buffer.from(user.passwordSalt),
        stored
      )
      if (!safeEqualHex(sha256Hex(currentKek), stored.kekVerifier)) {
        throw new Error('Current password is incorrect.')
      }

      const nextSalt = this.crypto.generateSalt(32)
      const params = this.crypto.getDefaultArgon2Params()
      nextKek = await this.crypto.deriveKEK(newPassword, nextSalt, params)

      const nextStored: StoredAuthParams = {
        ...params,
        kekVerifier: sha256Hex(nextKek)
      }

      await this.db.prisma.user.update({
        where: { userId },
        data: {
          passwordSalt: new Uint8Array(nextSalt),
          argon2Params: JSON.stringify(nextStored)
        }
      })

      const roles = await this.rbac.getUserRoleCodes(user.userId)
      const current = this.session.getPublicInfo()
      if (current?.userId === user.userId) {
        this.session.unlock({
          userId: user.userId,
          username: user.username,
          role: user.role,
          roles,
          kek: nextKek
        })
      }
      nextKek = null

      await this.audit.write({
        action: AuditAction.PASSWORD_CHANGE,
        userId
      })
    } catch (error) {
      secureZero(nextKek)
      throw error
    } finally {
      secureZero(currentKek)
    }
  }

  /**
   * Zeroes the in-memory KEK and locks the vault (also used by idle timeout).
   */
  lockVault(): AuthSessionDto {
    this.session.lock({ notify: true })
    return this.getSession()
  }

  getSession(): AuthSessionDto {
    const info = this.session.getPublicInfo()
    if (!info) {
      return {
        unlocked: false,
        user: null,
        idleTimeoutMs: this.session.idleTimeoutMilliseconds
      }
    }

    return {
      unlocked: true,
      user: {
        userId: info.userId,
        username: info.username,
        role: info.role,
        roles: info.roles,
        createdAt: new Date(info.unlockedAt).toISOString(),
        lastLoginAt: null
      },
      idleTimeoutMs: this.session.idleTimeoutMilliseconds
    }
  }

  /** Resets the idle auto-lock timer after renderer activity. */
  touch(): void {
    this.session.touch()
  }

  private buildAuthResult(
    user: {
      userId: string
      username: string
      role: string
      createdAt: Date
      lastLoginAt: Date | null
    },
    roles: string[]
  ): AuthResult {
    const dto = this.toUserDto(user, roles)
    return {
      user: dto,
      session: {
        unlocked: true,
        user: dto,
        idleTimeoutMs: this.session.idleTimeoutMilliseconds
      }
    }
  }

  private toUserDto(
    user: {
      userId: string
      username: string
      role: string
      createdAt: Date
      lastLoginAt: Date | null
    },
    roles: string[]
  ): AuthUserDto {
    return {
      userId: user.userId,
      username: user.username,
      role: user.role,
      roles,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null
    }
  }

  private normalizeUsername(username: string): string {
    const value = username?.trim()
    if (!value || value.length < 3 || value.length > 100) {
      throw new Error('Username must be between 3 and 100 characters.')
    }
    return value
  }

  private assertPassword(password: string): void {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters.')
    }
  }

  private parseStoredParams(json: string): StoredAuthParams {
    const parsed = JSON.parse(json) as Partial<StoredAuthParams>
    const base = this.crypto.parseArgon2Params(json)
    if (!parsed.kekVerifier || typeof parsed.kekVerifier !== 'string') {
      throw new Error('Corrupt auth parameters for user.')
    }
    return { ...base, kekVerifier: parsed.kekVerifier }
  }
}

export default AuthService
