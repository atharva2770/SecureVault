import type { AuthUserDto } from '@securevault/domain'
import { DBService } from '@securevault/db'
import { RoleCode } from '@securevault/domain'

import { AuditAction, AuditService } from '../audit/AuditService'
import type { Argon2Params } from '../crypto/CryptoService'
import { CryptoService } from '../crypto/CryptoService'
import { RbacService } from '../rbac/RbacService'
import { safeEqualHex, secureZero, sha256Hex } from '../utils/secure'

interface StoredAuthParams extends Argon2Params {
  kekVerifier: string
}

export interface VerifiedUser {
  userId: string
  username: string
  role: string
  createdAt: Date
  lastLoginAt: Date | null
}

export interface AuthAuditMeta {
  ipOrDevice?: string | null
}

export interface AuthCredentialResult {
  user: VerifiedUser
  roles: string[]
  /** Caller must zero this buffer after wrapping or discarding. Never persist. */
  kek: Buffer
}

/**
 * Credential verification shared by desktop (VaultSession) and the web API (HTTP session).
 * Does not hold a process-wide unlocked vault.
 */
export class AuthCredentials {
  private static instance: AuthCredentials | null = null

  private readonly db = DBService.getInstance()
  private readonly crypto = CryptoService.getInstance()
  private readonly audit = AuditService.getInstance()
  private readonly rbac = RbacService.getInstance()

  private constructor() {}

  static getInstance(): AuthCredentials {
    if (!AuthCredentials.instance) {
      AuthCredentials.instance = new AuthCredentials()
    }
    return AuthCredentials.instance
  }

  async register(
    username: string,
    password: string,
    meta?: AuthAuditMeta
  ): Promise<AuthCredentialResult> {
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

      await this.audit.write({
        action: AuditAction.UNLOCK,
        userId: user.userId,
        details: 'register',
        ipOrDevice: meta?.ipOrDevice
      })

      const resultKek = kek
      kek = null
      return { user, roles, kek: resultKek }
    } catch (error) {
      secureZero(kek)
      throw error
    }
  }

  async login(
    username: string,
    password: string,
    meta?: AuthAuditMeta
  ): Promise<AuthCredentialResult> {
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

      let roles = await this.rbac.getUserRoleCodes(user.userId)
      if (!roles.length) {
        await this.rbac.assignRole(user.userId, RoleCode.MEMBER)
        roles = await this.rbac.getUserRoleCodes(user.userId)
      }

      await this.audit.write({
        action: AuditAction.LOGIN,
        userId: user.userId,
        ipOrDevice: meta?.ipOrDevice
      })
      await this.audit.write({
        action: AuditAction.UNLOCK,
        userId: user.userId,
        ipOrDevice: meta?.ipOrDevice
      })

      const refreshed = await this.db.prisma.user.findUniqueOrThrow({
        where: { userId: user.userId }
      })

      const resultKek = kek
      kek = null
      return { user: refreshed, roles, kek: resultKek }
    } catch (error) {
      secureZero(kek)
      if (error instanceof Error && error.message === 'Invalid username or password.') {
        throw error
      }
      if (error instanceof Error && error.message === 'This account is disabled.') {
        throw error
      }
      throw new Error('Invalid username or password.')
    }
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<AuthCredentialResult> {
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

      await this.audit.write({
        action: AuditAction.PASSWORD_CHANGE,
        userId
      })

      const resultKek = nextKek
      nextKek = null
      return { user, roles, kek: resultKek }
    } catch (error) {
      secureZero(nextKek)
      throw error
    } finally {
      secureZero(currentKek)
    }
  }

  toUserDto(user: VerifiedUser, roles: string[]): AuthUserDto {
    return {
      userId: user.userId,
      username: user.username,
      role: user.role,
      roles,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null
    }
  }

  normalizeUsername(username: string): string {
    const value = username?.trim()
    if (!value || value.length < 3 || value.length > 100) {
      throw new Error('Username must be between 3 and 100 characters.')
    }
    return value
  }

  assertPassword(password: string): void {
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

export default AuthCredentials
