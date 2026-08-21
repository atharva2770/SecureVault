import { ipcMain } from 'electron'

import { IpcChannels } from '../../shared/ipc'
import type { CreateCategoryPayload, CreateFolderPayload } from '../../shared/ipc'
import { FolderService } from '../services/FolderService'
import { VaultSession } from '../session/VaultSession'
import { toIpcError } from './ipcErrors'

export function registerFoldersIpc(): void {
  ipcMain.handle(IpcChannels.folders.list, async () => {
    try {
      VaultSession.getInstance().touch()
      return await FolderService.getInstance().listFolders()
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.folders.create, async (_event, payload: CreateFolderPayload) => {
    try {
      VaultSession.getInstance().touch()
      return await FolderService.getInstance().createSubfolder(
        payload.name,
        payload.parentFolderId
      )
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.folders.delete, async (_event, folderId: string) => {
    try {
      VaultSession.getInstance().touch()
      return await FolderService.getInstance().deleteFolder(folderId)
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.categories.list, async () => {
    try {
      VaultSession.getInstance().touch()
      return await FolderService.getInstance().listCategories()
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.categories.ensure, async () => {
    try {
      VaultSession.getInstance().touch()
      return await FolderService.getInstance().ensureSidebarStructure()
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.categories.create, async (_event, payload: CreateCategoryPayload) => {
    try {
      VaultSession.getInstance().touch()
      return await FolderService.getInstance().createCategory(payload.name, payload.code)
    } catch (error) {
      throw toIpcError(error)
    }
  })
}
