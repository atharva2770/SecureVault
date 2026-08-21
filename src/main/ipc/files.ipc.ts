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
import { VaultSession } from '../session/VaultSession'
import { toIpcError } from './ipcErrors'

/**
 * Registers file vault IPC handlers.
 * Services are resolved inside handlers so SQL Server is not touched at startup.
 */
export function registerFilesIpc(): void {
  ipcMain.handle(IpcChannels.files.add, async (_event, payload: AddFilePayload) => {
    try {
      VaultSession.getInstance().touch()
      return await FileService.getInstance().addFile(payload)
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.files.get, async (_event, payload: PasswordFilePayload) => {
    try {
      VaultSession.getInstance().touch()
      return await FileService.getInstance().getFile(payload.fileId, payload.password)
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.files.open, async (_event, payload: PasswordFilePayload) => {
    try {
      VaultSession.getInstance().touch()
      return await FileService.getInstance().openFile(payload.fileId, payload.password)
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.files.download, async (_event, payload: PasswordFilePayload) => {
    try {
      VaultSession.getInstance().touch()
      return await FileService.getInstance().downloadFile(payload.fileId, payload.password)
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.files.list, async (_event, filter: ListFilesFilter | string | null) => {
    try {
      VaultSession.getInstance().touch()
      // Backward-compatible: older callers passed folderId string | null
      const normalized: ListFilesFilter =
        filter === null || typeof filter === 'string'
          ? { folderId: filter }
          : (filter ?? {})
      return await FileService.getInstance().listFiles(normalized)
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.files.delete, async (_event, fileId: string) => {
    try {
      VaultSession.getInstance().touch()
      return await FileService.getInstance().deleteFile(fileId)
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.files.move, async (_event, payload: MoveFilePayload) => {
    try {
      VaultSession.getInstance().touch()
      return await FileService.getInstance().moveFile(payload)
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IpcChannels.files.copy, async (_event, payload: CopyFilePayload) => {
    try {
      VaultSession.getInstance().touch()
      return await FileService.getInstance().copyFile(payload)
    } catch (error) {
      throw toIpcError(error)
    }
  })
}
