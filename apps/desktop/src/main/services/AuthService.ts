import {
  AuthCredentials,
  secureZero
} from '@securevault/core'
import type { AuthResultDto, AuthSessionDto } from '../../shared/ipc'
import { VaultSession } from '../session/VaultSession'

export type AuthResult = AuthResultDto

/**
 * Desktop auth adapter: verifies credentials via {@link AuthCredentials},
 * then stores the KEK only in {@link VaultSession}.
 */
export class AuthService {
  private static instance: AuthService | null = null

  private readonly credentials = AuthCredentials.getInstance()
  private readonly session = VaultSession.getInstance()

  private constructor() {}

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService()
    }
    return AuthService.instance
  }

  async register(username: string, password: string): Promise<AuthResult> {
    const result = await this.credentials.register(username, password)
    try {
      this.session.unlock({
        userId: result.user.userId,
        username: result.user.username,
        role: result.user.role,
        roles: result.roles,
        kek: result.kek
      })
      return this.buildAuthResult(result)
    } finally {
      secureZero(result.kek)
    }
  }

  async login(username: string, password: string): Promise<AuthResult> {
    const result = await this.credentials.login(username, password)
    try {
      this.session.unlock({
        userId: result.user.userId,
        username: result.user.username,
        role: result.user.role,
        roles: result.roles,
        kek: result.kek
      })
      return this.buildAuthResult(result)
    } finally {
      secureZero(result.kek)
    }
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const result = await this.credentials.changePassword(
      userId,
      currentPassword,
      newPassword
    )
    try {
      const current = this.session.getPublicInfo()
      if (current?.userId === result.user.userId) {
        this.session.unlock({
          userId: result.user.userId,
          username: result.user.username,
          role: result.user.role,
          roles: result.roles,
          kek: result.kek
        })
      }
    } finally {
      secureZero(result.kek)
    }
  }

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

  touch(): void {
    this.session.touch()
  }

  private buildAuthResult(result: {
    user: {
      userId: string
      username: string
      role: string
      createdAt: Date
      lastLoginAt: Date | null
    }
    roles: string[]
  }): AuthResult {
    const dto = this.credentials.toUserDto(result.user, result.roles)
    return {
      user: dto,
      session: {
        unlocked: true,
        user: dto,
        idleTimeoutMs: this.session.idleTimeoutMilliseconds
      }
    }
  }
}

export default AuthService
