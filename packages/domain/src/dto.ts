/**
 * Transport-agnostic DTOs shared by the HTTP API and web UI.
 * Keep secrets (KEK/DEK) out of these payloads — never send key material to a client.
 */

/** Safe user profile returned to any client (no salts/keys). */
export interface AuthUserDto {
  userId: string
  username: string
  /** Primary legacy role code (admin/member/…). */
  role: string
  /** Authoritative role codes from UserRoles (ADMIN, MEMBER, …). */
  roles: string[]
  createdAt: string
  lastLoginAt: string | null
}

export interface AuthSessionDto {
  unlocked: boolean
  user: AuthUserDto | null
  idleTimeoutMs: number
}

export interface AuthResultDto {
  user: AuthUserDto
  session: AuthSessionDto
}

export interface RegisterPayload {
  username: string
  password: string
}

export interface LoginPayload {
  username: string
  password: string
}

export interface ChangePasswordPayload {
  currentPassword: string
  newPassword: string
}

export interface FileCategoryDto {
  categoryId: string
  code: string
  name: string
  sortOrder: number
  isSystem: boolean
}

export interface FileDto {
  fileId: string
  folderId: string | null
  categoryId: string | null
  displayName: string
  originalFileName: string
  mimeType: string | null
  sizeBytes: string
  checksum: string
  source: string
  version: number
  createdAt: string
  updatedAt: string
  categoryName: string | null
}

export interface FolderDto {
  folderId: string
  parentFolderId: string | null
  categoryId: string | null
  name: string
  isCategoryRoot: boolean
  createdAt: string
  /** Effective ACL rights for the current user. */
  rights: {
    view: boolean
    edit: boolean
    copy: boolean
    delete: boolean
  }
  /**
   * Shown only as a path to a granted child. No files, siblings, or write access here.
   */
  traverseOnly?: boolean
}

export interface FolderRightsDto {
  view: boolean
  edit: boolean
  copy: boolean
  delete: boolean
}

export interface AddFilePayload {
  sourcePath: string
  /** Vault display name — also becomes the per-file access password (v1). */
  displayName: string
  categoryId: string
  folderId?: string | null
}

export interface ListFilesFilter {
  folderId?: string | null
  categoryId?: string | null
}

export interface CreateFolderPayload {
  name: string
  /** Parent folder (category root or user subfolder). */
  parentFolderId: string
}

export interface CreateCategoryPayload {
  name: string
  code?: string
}

export interface MoveFilePayload {
  fileId: string
  /** Destination folder (must share the file's category). */
  targetFolderId: string
}

export interface CopyFilePayload {
  fileId: string
  /** Destination folder (must share the file's category). */
  targetFolderId: string
}

/** TEMP: rename — vault display name (also the v1 file password). */
export interface RenameFilePayload {
  fileId: string
  displayName: string
}

export interface PasswordFilePayload {
  fileId: string
  password: string
}

export interface GetFileResult {
  fileId: string
  displayName: string
  originalFileName: string
  mimeType: string | null
  checksum: string
  /** Temporary plaintext path on the API host — delete after streaming to the browser. */
  tempPath: string
}

export interface DownloadFileResult {
  fileId: string
  savedPath: string
  /** Decrypted original file with uploaded extension. */
  format: 'original'
}

export interface AdminUserDto {
  userId: string
  username: string
  role: string
  roles: string[]
  isDisabled: boolean
  createdAt: string
  lastLoginAt: string | null
}

export interface RoleDto {
  roleId: string
  code: string
  name: string
  description: string | null
  isSystem: boolean
  permissions: string[]
}

export interface FolderAclDto {
  folderAclId: string
  folderId: string
  principalType: 'USER' | 'ROLE'
  principalId: string
  principalLabel: string
  canView: boolean
  canEdit: boolean
  canCopy: boolean
  canDelete: boolean
  inherit: boolean
  grantedAt: string
}

/** One FolderAcls row for a user (CRUD + inherit). */
export interface FolderGrantDto {
  folderId: string
  canView: boolean
  canEdit: boolean
  canCopy: boolean
  canDelete: boolean
  inherit: boolean
}

export interface AdminCreateUserPayload {
  username: string
  password: string
  roleCode: string
  /** If true, grants full rights on all category roots. */
  grantAllCategoryRoots?: boolean
  /** Explicit FolderAcls rows (View/Edit/Copy/Delete/Inherit). Ignored for Admin. */
  folderGrants?: FolderGrantDto[]
  /** @deprecated Prefer folderGrants. Maps to full CRUD + inherit on each id. */
  folderIds?: string[]
}

export interface AdminSetUserRolesPayload {
  userId: string
  roleCodes: string[]
}

export interface AdminSetFolderAclPayload {
  folderId: string
  principalType: 'USER' | 'ROLE'
  principalId: string
  canView: boolean
  canEdit: boolean
  canCopy: boolean
  canDelete: boolean
  inherit?: boolean
}

/** Folder access loaded from FolderAcls for one user. */
export interface UserFolderAccessDto {
  userId: string
  isAdmin: boolean
  grants: FolderGrantDto[]
}

export interface MyAccessEntryDto {
  folderId: string
  folderName: string
  path: string
  isCategoryRoot: boolean
  rights: {
    view: boolean
    edit: boolean
    copy: boolean
    delete: boolean
  }
}

export interface FileSearchPageDto {
  items: FileDto[]
  total: number
  nextCursor: string | null
}

export interface VaultSearchResults {
  modules: FolderDto[]
  folders: FolderDto[]
  files: FileDto[]
  /** Total matching files (global FTS page). */
  fileTotal?: number
  nextCursor?: string | null
}

export interface AuditLogDto {
  logId: string
  userId: string | null
  username: string | null
  action: string
  fileId: string | null
  fileName: string | null
  folderId: string | null
  categoryId: string | null
  moduleName: string | null
  details: string | null
  ip: string | null
  userAgent: string | null
  timestamp: string
}

export interface AuditLogListDto {
  items: AuditLogDto[]
  nextCursor: string | null
}
