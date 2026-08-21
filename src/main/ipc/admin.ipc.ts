import { ipcMain } from 'electron'

import { IpcChannels } from '../../shared/ipc'
import type {
  AdminCreateUserPayload,
  AdminSetFolderAclPayload,
  AdminSetUserRolesPayload
} from '../../shared/ipc'
import { AdminService } from '../services/AdminService'
import { VaultSession } from '../session/VaultSession'
import { toIpcError } from './ipcErrors'

export function registerAdminIpc(): void {
  const touch = (): void => {
    VaultSession.getInstance().touch()
  }

  ipcMain.handle(IpcChannels.admin.listUsers, async () => {
    try {
      touch()
      return await AdminService.getInstance().listUsers()
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.admin.createUser, async (_e, payload: AdminCreateUserPayload) => {
    try {
      touch()
      return await AdminService.getInstance().createUser(payload)
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(
    IpcChannels.admin.setUserRoles,
    async (_e, payload: AdminSetUserRolesPayload) => {
      try {
        touch()
        return await AdminService.getInstance().setUserRoles(payload)
      } catch (error) {
        throw toIpcError(error)
      }
    }
  )

  ipcMain.handle(
    IpcChannels.admin.setUserDisabled,
    async (_e, payload: { userId: string; isDisabled: boolean }) => {
      try {
        touch()
        return await AdminService.getInstance().setUserDisabled(
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
      touch()
      return await AdminService.getInstance().listRoles()
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.admin.listAclFolders, async () => {
    try {
      touch()
      return await AdminService.getInstance().listAclFolders()
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.admin.listFolderAcls, async (_e, folderId: string) => {
    try {
      touch()
      return await AdminService.getInstance().listFolderAcls(folderId)
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(
    IpcChannels.admin.setFolderAcl,
    async (_e, payload: AdminSetFolderAclPayload) => {
      try {
        touch()
        return await AdminService.getInstance().setFolderAcl(payload)
      } catch (error) {
        throw toIpcError(error)
      }
    }
  )

  ipcMain.handle(IpcChannels.admin.revokeFolderAcl, async (_e, folderAclId: string) => {
    try {
      touch()
      return await AdminService.getInstance().revokeFolderAcl(folderAclId)
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.admin.getMyAccess, async () => {
    try {
      touch()
      return await AdminService.getInstance().getMyAccess()
    } catch (error) {
      throw toIpcError(error)
    }
  })
}
