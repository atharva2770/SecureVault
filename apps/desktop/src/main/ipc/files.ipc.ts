import { ipcMain } from 'electron'

import { IpcChannels } from '../../shared/ipc'
import type {
  AddFilePayload,
  CopyFilePayload,
  ListFilesFilter,
  MoveFilePayload,
  PasswordFilePayload
} from '../../shared/ipc'
import { FileService } from '../services/FileService'
import { requireDesktopActor, requireDesktopUserId } from '../session/desktopActor'
import { toIpcError } from './ipcErrors'

/**
 * Desktop IPC adapter: VaultSession → explicit actor/userId for FileService.
 */
export function registerFilesIpc(): void {
  ipcMain.handle(IpcChannels.files.add, async (_event, payload: AddFilePayload) => {
    try {
      return await FileService.getInstance().addFile(requireDesktopActor(), payload)
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.files.get, async (_event, payload: PasswordFilePayload) => {
    try {
      return await FileService.getInstance().getFile(
        requireDesktopActor(),
        payload.fileId,
        payload.password
      )
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.files.open, async (_event, payload: PasswordFilePayload) => {
    try {
      return await FileService.getInstance().openFile(
        requireDesktopActor(),
        payload.fileId,
        payload.password
      )
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.files.download, async (_event, payload: PasswordFilePayload) => {
    try {
      return await FileService.getInstance().downloadFile(
        requireDesktopActor(),
        payload.fileId,
        payload.password
      )
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.files.list, async (_event, filter: ListFilesFilter | string | null) => {
    try {
      const userId = requireDesktopUserId()
      const normalized: ListFilesFilter =
        filter === null || typeof filter === 'string'
          ? { folderId: filter }
          : (filter ?? {})
      return await FileService.getInstance().listFiles(userId, normalized)
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.files.delete, async (_event, fileId: string) => {
    try {
      return await FileService.getInstance().deleteFile(requireDesktopUserId(), fileId)
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.files.move, async (_event, payload: MoveFilePayload) => {
    try {
      return await FileService.getInstance().moveFile(requireDesktopUserId(), payload)
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.files.copy, async (_event, payload: CopyFilePayload) => {
    try {
      return await FileService.getInstance().copyFile(requireDesktopUserId(), payload)
    } catch (error) {
      throw toIpcError(error)
    }
  })
}
