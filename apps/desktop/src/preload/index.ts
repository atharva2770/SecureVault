import { contextBridge, ipcRenderer, webUtils } from 'electron'

import { IpcChannels } from '../shared/ipc'
import type {
  AddFilePayload,
  AdminCreateUserPayload,
  AdminSetFolderAclPayload,
  AdminSetUserRolesPayload,
  AdminUserDto,
  AuthResultDto,
  AuthSessionDto,
  ChangePasswordPayload,
  CopyFilePayload,
  CreateCategoryPayload,
  CreateFolderPayload,
  DownloadFileResult,
  FileCategoryDto,
  FileDto,
  FolderAclDto,
  FolderDto,
  GetFileResult,
  ListFilesFilter,
  LoginPayload,
  MoveFilePayload,
  PasswordFilePayload,
  RegisterPayload,
  RenameFilePayload,
  RoleDto
} from '../shared/ipc'

const electronBridge = {
  process: {
    versions: process.versions,
    platform: process.platform
  },
  ipcRenderer: {
    send: (channel: string, ...args: unknown[]): void => {
      ipcRenderer.send(channel, ...args)
    },
    invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
      return ipcRenderer.invoke(channel, ...args)
    },
    on: (channel: string, listener: (...args: unknown[]) => void): void => {
      ipcRenderer.on(channel, (_event, ...args) => listener(...args))
    },
    once: (channel: string, listener: (...args: unknown[]) => void): void => {
      ipcRenderer.once(channel, (_event, ...args) => listener(...args))
    },
    removeListener: (channel: string, listener: (...args: unknown[]) => void): void => {
      ipcRenderer.removeListener(channel, listener as never)
    }
  }
}

const api = {
  window: {
    minimize: (): void => {
      ipcRenderer.send('window:minimize')
    },
    maximize: (): void => {
      ipcRenderer.send('window:maximize')
    },
    close: (): void => {
      ipcRenderer.send('window:close')
    },
    isMaximized: (): Promise<boolean> => {
      return ipcRenderer.invoke('window:isMaximized')
    }
  },

  auth: {
    register: (payload: RegisterPayload): Promise<AuthResultDto> => {
      return ipcRenderer.invoke(IpcChannels.auth.register, payload)
    },
    login: (payload: LoginPayload): Promise<AuthResultDto> => {
      return ipcRenderer.invoke(IpcChannels.auth.login, payload)
    },
    lockVault: (): Promise<AuthSessionDto> => {
      return ipcRenderer.invoke(IpcChannels.auth.lock)
    },
    getSession: (): Promise<AuthSessionDto> => {
      return ipcRenderer.invoke(IpcChannels.auth.session)
    },
    touch: (): Promise<boolean> => {
      return ipcRenderer.invoke(IpcChannels.auth.touch)
    },
    changePassword: (payload: ChangePasswordPayload): Promise<boolean> => {
      return ipcRenderer.invoke(IpcChannels.auth.changePassword, payload)
    },
    onVaultLocked: (handler: () => void): (() => void) => {
      const listener = (): void => handler()
      ipcRenderer.on(IpcChannels.events.vaultLocked, listener)
      return () => {
        ipcRenderer.removeListener(IpcChannels.events.vaultLocked, listener)
      }
    }
  },

  files: {
    addFile: (payload: AddFilePayload): Promise<FileDto> => {
      return ipcRenderer.invoke(IpcChannels.files.add, payload)
    },
    getFile: (payload: PasswordFilePayload): Promise<GetFileResult> => {
      return ipcRenderer.invoke(IpcChannels.files.get, payload)
    },
    openFile: (payload: PasswordFilePayload): Promise<GetFileResult> => {
      return ipcRenderer.invoke(IpcChannels.files.open, payload)
    },
    downloadFile: (payload: PasswordFilePayload): Promise<DownloadFileResult> => {
      return ipcRenderer.invoke(IpcChannels.files.download, payload)
    },
    listFiles: (filter: ListFilesFilter = {}): Promise<FileDto[]> => {
      return ipcRenderer.invoke(IpcChannels.files.list, filter)
    },
    deleteFile: (fileId: string): Promise<FileDto> => {
      return ipcRenderer.invoke(IpcChannels.files.delete, fileId)
    },
    moveFile: (payload: MoveFilePayload): Promise<FileDto> => {
      return ipcRenderer.invoke(IpcChannels.files.move, payload)
    },
    copyFile: (payload: CopyFilePayload): Promise<FileDto> => {
      return ipcRenderer.invoke(IpcChannels.files.copy, payload)
    },
    renameFile: (payload: RenameFilePayload): Promise<FileDto> => {
      return ipcRenderer.invoke(IpcChannels.files.rename, payload)
    }
  },

  folders: {
    listFolders: (): Promise<FolderDto[]> => {
      return ipcRenderer.invoke(IpcChannels.folders.list)
    },
    createFolder: (payload: CreateFolderPayload): Promise<FolderDto> => {
      return ipcRenderer.invoke(IpcChannels.folders.create, payload)
    },
    deleteFolder: (folderId: string): Promise<FolderDto> => {
      return ipcRenderer.invoke(IpcChannels.folders.delete, folderId)
    }
  },

  categories: {
    listCategories: (): Promise<FileCategoryDto[]> => {
      return ipcRenderer.invoke(IpcChannels.categories.list)
    },
    ensureSidebar: (): Promise<{ categories: FileCategoryDto[]; folders: FolderDto[] }> => {
      return ipcRenderer.invoke(IpcChannels.categories.ensure)
    },
    createCategory: (payload: CreateCategoryPayload): Promise<FileCategoryDto> => {
      return ipcRenderer.invoke(IpcChannels.categories.create, payload)
    }
  },

  listFiles: (filter: ListFilesFilter = {}): Promise<FileDto[]> => {
    return ipcRenderer.invoke(IpcChannels.files.list, filter)
  },
  addFile: (payload: AddFilePayload): Promise<FileDto> => {
    return ipcRenderer.invoke(IpcChannels.files.add, payload)
  },
  getFile: (payload: PasswordFilePayload): Promise<GetFileResult> => {
    return ipcRenderer.invoke(IpcChannels.files.get, payload)
  },
  openFile: (payload: PasswordFilePayload): Promise<GetFileResult> => {
    return ipcRenderer.invoke(IpcChannels.files.open, payload)
  },
  downloadFile: (payload: PasswordFilePayload): Promise<DownloadFileResult> => {
    return ipcRenderer.invoke(IpcChannels.files.download, payload)
  },
  deleteFile: (fileId: string): Promise<FileDto> => {
    return ipcRenderer.invoke(IpcChannels.files.delete, fileId)
  },
  moveFile: (payload: MoveFilePayload): Promise<FileDto> => {
    return ipcRenderer.invoke(IpcChannels.files.move, payload)
  },
  copyFile: (payload: CopyFilePayload): Promise<FileDto> => {
    return ipcRenderer.invoke(IpcChannels.files.copy, payload)
  },
  renameFile: (payload: RenameFilePayload): Promise<FileDto> => {
    return ipcRenderer.invoke(IpcChannels.files.rename, payload)
  },
  listFolders: (): Promise<FolderDto[]> => {
    return ipcRenderer.invoke(IpcChannels.folders.list)
  },
  createFolder: (payload: CreateFolderPayload): Promise<FolderDto> => {
    return ipcRenderer.invoke(IpcChannels.folders.create, payload)
  },
  deleteFolder: (folderId: string): Promise<FolderDto> => {
    return ipcRenderer.invoke(IpcChannels.folders.delete, folderId)
  },
  listCategories: (): Promise<FileCategoryDto[]> => {
    return ipcRenderer.invoke(IpcChannels.categories.list)
  },
  ensureSidebar: (): Promise<{ categories: FileCategoryDto[]; folders: FolderDto[] }> => {
    return ipcRenderer.invoke(IpcChannels.categories.ensure)
  },

  admin: {
    listUsers: (): Promise<AdminUserDto[]> => {
      return ipcRenderer.invoke(IpcChannels.admin.listUsers)
    },
    createUser: (payload: AdminCreateUserPayload): Promise<AdminUserDto> => {
      return ipcRenderer.invoke(IpcChannels.admin.createUser, payload)
    },
    setUserRoles: (payload: AdminSetUserRolesPayload): Promise<AdminUserDto> => {
      return ipcRenderer.invoke(IpcChannels.admin.setUserRoles, payload)
    },
    setUserDisabled: (userId: string, isDisabled: boolean): Promise<AdminUserDto> => {
      return ipcRenderer.invoke(IpcChannels.admin.setUserDisabled, { userId, isDisabled })
    },
    listRoles: (): Promise<RoleDto[]> => {
      return ipcRenderer.invoke(IpcChannels.admin.listRoles)
    },
    listAclFolders: (): Promise<FolderDto[]> => {
      return ipcRenderer.invoke(IpcChannels.admin.listAclFolders)
    },
    listFolderAcls: (folderId: string): Promise<FolderAclDto[]> => {
      return ipcRenderer.invoke(IpcChannels.admin.listFolderAcls, folderId)
    },
    setFolderAcl: (payload: AdminSetFolderAclPayload): Promise<FolderAclDto[]> => {
      return ipcRenderer.invoke(IpcChannels.admin.setFolderAcl, payload)
    },
    revokeFolderAcl: (folderAclId: string): Promise<FolderAclDto[]> => {
      return ipcRenderer.invoke(IpcChannels.admin.revokeFolderAcl, folderAclId)
    },
    getMyAccess: (): Promise<
      Array<{
        folderId: string
        folderName: string
        path: string
        isCategoryRoot: boolean
        rights: { view: boolean; edit: boolean; copy: boolean; delete: boolean }
      }>
    > => {
      return ipcRenderer.invoke(IpcChannels.admin.getMyAccess)
    }
  },

  getPathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file)
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Unable to resolve file path from dropped file.'
      )
    }
  }
}

contextBridge.exposeInMainWorld('electron', electronBridge)
contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
export type ElectronBridge = typeof electronBridge
