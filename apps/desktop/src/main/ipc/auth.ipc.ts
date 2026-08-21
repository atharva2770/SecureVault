import { ipcMain } from 'electron'

import { IpcChannels } from '../../shared/ipc'
import type {
  AuthSessionDto,
  ChangePasswordPayload,
  LoginPayload,
  RegisterPayload
} from '../../shared/ipc'
import { VaultSession } from '../session/VaultSession'
import { requireDesktopUserId } from '../session/desktopActor'
import { AuthService } from '../services/AuthService'
import { toIpcError } from './ipcErrors'

function sessionDto(): AuthSessionDto {
  const session = VaultSession.getInstance()
  const info = session.getPublicInfo()
  if (!info) {
    return {
      unlocked: false,
      user: null,
      idleTimeoutMs: session.idleTimeoutMilliseconds
    }
  }

  return {
    unlocked: true,
    user: {
      userId: info.userId,
      username: info.username,
      role: info.role,
      roles: info.roles ?? [],
      createdAt: new Date(info.unlockedAt).toISOString(),
      lastLoginAt: null
    },
    idleTimeoutMs: session.idleTimeoutMilliseconds
  }
}

/**
 * Registers auth / vault-session IPC handlers.
 * Session/lock/touch intentionally avoid AuthService so they never touch the DB.
 */
export function registerAuthIpc(): void {
  ipcMain.handle(IpcChannels.auth.register, async (_event, payload: RegisterPayload) => {
    try {
      return await AuthService.getInstance().register(payload.username, payload.password)
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.auth.login, async (_event, payload: LoginPayload) => {
    try {
      return await AuthService.getInstance().login(payload.username, payload.password)
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.auth.lock, async () => {
    try {
      VaultSession.getInstance().lock({ notify: true })
      return sessionDto()
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.auth.session, async () => {
    try {
      return sessionDto()
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.auth.touch, async () => {
    try {
      VaultSession.getInstance().touch()
      return true
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(
    IpcChannels.auth.changePassword,
    async (_event, payload: ChangePasswordPayload) => {
      try {
        await AuthService.getInstance().changePassword(
          requireDesktopUserId(),
          payload.currentPassword,
          payload.newPassword
        )
        return true
      } catch (error) {
        throw toIpcError(error)
      }
    }
  )
}
