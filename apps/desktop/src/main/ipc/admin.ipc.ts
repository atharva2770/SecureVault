import { ipcMain } from 'electron'

import { IpcChannels } from '../../shared/ipc'
import type {
  AdminCreateUserPayload,
  AdminSetFolderAclPayload,
  AdminSetUserRolesPayload
} from '../../shared/ipc'
import { AdminService } from '../services/AdminService'
import { requireDesktopUserId } from '../session/desktopActor'
import { toIpcError } from './ipcErrors'

/**
 * Desktop IPC adapter: VaultSession → explicit actorUserId for AdminService.
 */
export function registerAdminIpc(): void {
  ipcMain.handle(IpcChannels.admin.listUsers, async () => {
    try {
      return await AdminService.getInstance().listUsers(requireDesktopUserId())
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.admin.createUser, async (_e, payload: AdminCreateUserPayload) => {
    try {
      return await AdminService.getInstance().createUser(requireDesktopUserId(), payload)
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(
    IpcChannels.admin.setUserRoles,
    async (_e, payload: AdminSetUserRolesPayload) => {
      try {
        return await AdminService.getInstance().setUserRoles(requireDesktopUserId(), payload)
      } catch (error) {
        throw toIpcError(error)
      }
    }
  )

  ipcMain.handle(
    IpcChannels.admin.setUserDisabled,
    async (_e, payload: { userId: string; isDisabled: boolean }) => {
      try {
        return await AdminService.getInstance().setUserDisabled(
          requireDesktopUserId(),
          payload.userId,
          payload.isDisabled
        )
      } catch (error) {
        throw toIpcError(error)
      }
    }
  )

  ipcMain.handle(IpcChannels.admin.listRoles, async () => {
    try {
      return await AdminService.getInstance().listRoles(requireDesktopUserId())
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.admin.listAclFolders, async () => {
    try {
      return await AdminService.getInstance().listAclFolders(requireDesktopUserId())
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.admin.listFolderAcls, async (_e, folderId: string) => {
    try {
      return await AdminService.getInstance().listFolderAcls(requireDesktopUserId(), folderId)
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(
    IpcChannels.admin.setFolderAcl,
    async (_e, payload: AdminSetFolderAclPayload) => {
      try {
        return await AdminService.getInstance().setFolderAcl(requireDesktopUserId(), payload)
      } catch (error) {
        throw toIpcError(error)
      }
    }
  )

  ipcMain.handle(IpcChannels.admin.revokeFolderAcl, async (_e, folderAclId: string) => {
    try {
      return await AdminService.getInstance().revokeFolderAcl(
        requireDesktopUserId(),
        folderAclId
      )
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.admin.getMyAccess, async () => {
    try {
      return await AdminService.getInstance().getMyAccess(requireDesktopUserId())
    } catch (error) {
      throw toIpcError(error)
    }
  })
}
