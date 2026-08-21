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
  RoleDto
} from '../shared/ipc'

export interface ElectronBridge {
  process: {
    versions: NodeJS.ProcessVersions
    platform: NodeJS.Platform
  }
  ipcRenderer: {
    send: (channel: string, ...args: unknown[]) => void
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    on: (channel: string, listener: (...args: unknown[]) => void) => void
    once: (channel: string, listener: (...args: unknown[]) => void) => void
    removeListener: (channel: string, listener: (...args: unknown[]) => void) => void
  }
}

export interface Api {
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
  }
  auth: {
    register: (payload: RegisterPayload) => Promise<AuthResultDto>
    login: (payload: LoginPayload) => Promise<AuthResultDto>
    lockVault: () => Promise<AuthSessionDto>
    getSession: () => Promise<AuthSessionDto>
    touch: () => Promise<boolean>
    changePassword: (payload: ChangePasswordPayload) => Promise<boolean>
    onVaultLocked: (handler: () => void) => () => void
  }
  files: {
    addFile: (payload: AddFilePayload) => Promise<FileDto>
    getFile: (payload: PasswordFilePayload) => Promise<GetFileResult>
    openFile: (payload: PasswordFilePayload) => Promise<GetFileResult>
    downloadFile: (payload: PasswordFilePayload) => Promise<DownloadFileResult>
    listFiles: (filter?: ListFilesFilter) => Promise<FileDto[]>
    deleteFile: (fileId: string) => Promise<FileDto>
    moveFile: (payload: MoveFilePayload) => Promise<FileDto>
    copyFile: (payload: CopyFilePayload) => Promise<FileDto>
  }
  folders: {
    listFolders: () => Promise<FolderDto[]>
    createFolder: (payload: CreateFolderPayload) => Promise<FolderDto>
    deleteFolder: (folderId: string) => Promise<FolderDto>
  }
  categories: {
    listCategories: () => Promise<FileCategoryDto[]>
    ensureSidebar: () => Promise<{ categories: FileCategoryDto[]; folders: FolderDto[] }>
    createCategory: (payload: CreateCategoryPayload) => Promise<FileCategoryDto>
  }
  admin: {
    listUsers: () => Promise<AdminUserDto[]>
    createUser: (payload: AdminCreateUserPayload) => Promise<AdminUserDto>
    setUserRoles: (payload: AdminSetUserRolesPayload) => Promise<AdminUserDto>
    setUserDisabled: (userId: string, isDisabled: boolean) => Promise<AdminUserDto>
    listRoles: () => Promise<RoleDto[]>
    listAclFolders: () => Promise<FolderDto[]>
    listFolderAcls: (folderId: string) => Promise<FolderAclDto[]>
    setFolderAcl: (payload: AdminSetFolderAclPayload) => Promise<FolderAclDto[]>
    revokeFolderAcl: (folderAclId: string) => Promise<FolderAclDto[]>
    getMyAccess: () => Promise<
      Array<{
        folderId: string
        folderName: string
        path: string
        isCategoryRoot: boolean
        rights: { view: boolean; edit: boolean; copy: boolean; delete: boolean }
      }>
    >
  }
  listFiles: (filter?: ListFilesFilter) => Promise<FileDto[]>
  addFile: (payload: AddFilePayload) => Promise<FileDto>
  getFile: (payload: PasswordFilePayload) => Promise<GetFileResult>
  openFile: (payload: PasswordFilePayload) => Promise<GetFileResult>
  downloadFile: (payload: PasswordFilePayload) => Promise<DownloadFileResult>
  deleteFile: (fileId: string) => Promise<FileDto>
  moveFile: (payload: MoveFilePayload) => Promise<FileDto>
  copyFile: (payload: CopyFilePayload) => Promise<FileDto>
  listFolders: () => Promise<FolderDto[]>
  createFolder: (payload: CreateFolderPayload) => Promise<FolderDto>
  deleteFolder: (folderId: string) => Promise<FolderDto>
  listCategories: () => Promise<FileCategoryDto[]>
  ensureSidebar: () => Promise<{ categories: FileCategoryDto[]; folders: FolderDto[] }>
  getPathForFile: (file: File) => string
}

declare global {
  interface Window {
    electron: ElectronBridge
    api: Api
  }
}

export type {
  AddFilePayload,
  AdminCreateUserPayload,
  AdminSetFolderAclPayload,
  AdminUserDto,
  AuthResultDto,
  AuthSessionDto,
  CopyFilePayload,
  FileCategoryDto,
  FileDto,
  FolderAclDto,
  FolderDto,
  GetFileResult,
  ListFilesFilter,
  MoveFilePayload,
  PasswordFilePayload,
  RoleDto
}
