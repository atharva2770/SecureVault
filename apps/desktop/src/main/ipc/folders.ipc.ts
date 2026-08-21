import { ipcMain } from 'electron'

import { IpcChannels } from '../../shared/ipc'
import type { CreateCategoryPayload, CreateFolderPayload } from '../../shared/ipc'
import { FolderService } from '../services/FolderService'
import { requireDesktopUserId } from '../session/desktopActor'
import { toIpcError } from './ipcErrors'

/**
 * Desktop IPC adapter: VaultSession → explicit userId for FolderService.
 */
export function registerFoldersIpc(): void {
  ipcMain.handle(IpcChannels.folders.list, async () => {
    try {
      return await FolderService.getInstance().listFolders(requireDesktopUserId())
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.folders.create, async (_event, payload: CreateFolderPayload) => {
    try {
      return await FolderService.getInstance().createSubfolder(
        requireDesktopUserId(),
        payload.name,
        payload.parentFolderId
      )
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.folders.delete, async (_event, folderId: string) => {
    try {
      return await FolderService.getInstance().deleteFolder(requireDesktopUserId(), folderId)
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.categories.list, async () => {
    try {
      return await FolderService.getInstance().listCategories(requireDesktopUserId())
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.categories.ensure, async () => {
    try {
      return await FolderService.getInstance().ensureSidebarStructure(requireDesktopUserId())
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.categories.create, async (_event, payload: CreateCategoryPayload) => {
    try {
      return await FolderService.getInstance().createCategory(
        requireDesktopUserId(),
        payload.name,
        payload.code
      )
    } catch (error) {
      throw toIpcError(error)
    }
  })
}
