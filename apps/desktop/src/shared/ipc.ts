/**
 * Electron IPC barrel: channel names (desktop-only) + shared DTOs from `@securevault/domain`.
 * Keep secrets (KEK/DEK) out of these payloads — never send key material to the renderer.
 */
export { IpcChannels } from './channels'

export type {
  AuthUserDto,
  AuthSessionDto,
  AuthResultDto,
  RegisterPayload,
  LoginPayload,
  ChangePasswordPayload,
  FileCategoryDto,
  FileDto,
  FolderDto,
  FolderRightsDto,
  AddFilePayload,
  ListFilesFilter,
  CreateFolderPayload,
  CreateCategoryPayload,
  MoveFilePayload,
  CopyFilePayload,
  RenameFilePayload,
  PasswordFilePayload,
  GetFileResult,
  DownloadFileResult,
  AdminUserDto,
  RoleDto,
  FolderAclDto,
  AdminCreateUserPayload,
  AdminSetUserRolesPayload,
  AdminSetFolderAclPayload,
  MyAccessEntryDto
} from '@securevault/domain'
