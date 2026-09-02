import type {
  AdminCreateUserPayload,
  AdminSetFolderAclPayload,
  AdminSetUserRolesPayload,
  AdminUserDto,
  AuthResultDto,
  AuthSessionDto,
  CopyFilePayload,
  CreateCategoryPayload,
  CreateFolderPayload,
  FileCategoryDto,
  FileDto,
  FolderAclDto,
  FolderDto,
  FolderGrantDto,
  ListFilesFilter,
  LoginPayload,
  MoveFilePayload,
  PasswordFilePayload,
  RegisterPayload,
  RenameFilePayload,
  RoleDto,
  UserFolderAccessDto,
  VaultSearchResults,
  FileSearchPageDto,
  AuditLogListDto
} from '@securevault/domain'

export class SessionLockedError extends Error {
  constructor(message = 'Vault is locked. Sign in to continue.') {
    super(message)
    this.name = 'SessionLockedError'
  }
}

function emitLocked(): void {
  window.dispatchEvent(new Event('sv:locked'))
}

const CSRF_COOKIE_NAME = 'sv_csrf'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Reads the double-submit CSRF token the API set as a readable cookie. */
function readCsrfToken(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${CSRF_COOKIE_NAME}=`))
  return match ? decodeURIComponent(match.slice(CSRF_COOKIE_NAME.length + 1)) : null
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string }
    if (body.error) return body.error
  } catch {
    /* not json */
  }
  return `Request failed (${res.status}).`
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData
  if (init.body && !isForm && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const method = (init.method ?? 'GET').toUpperCase()
  if (!SAFE_METHODS.has(method) && !headers.has('x-csrf-token')) {
    const token = readCsrfToken()
    if (token) headers.set('x-csrf-token', token)
  }

  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers
  })

  if (res.status === 401) {
    emitLocked()
    throw new SessionLockedError(await readError(res))
  }

  return res
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init)
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

function jsonBody(body: unknown): RequestInit {
  return { body: JSON.stringify(body) }
}

function parseDownloadName(header: string | null, fallback: string): string {
  if (!header) return fallback
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (utf?.[1]) {
    try {
      return decodeURIComponent(utf[1])
    } catch {
      return utf[1]
    }
  }
  const ascii = /filename="([^"]+)"/i.exec(header)
  return ascii?.[1] || fallback
}

async function fetchViewBlob(
  fileId: string,
  password: string | null | undefined,
  fallbackName: string
): Promise<OpenedFileView> {
  // Categories that do not require a per-file password send no password at all.
  const body = password ? { password, intent: 'view' } : { intent: 'view' }
  const res = await apiFetch(`/api/files/${fileId}/download`, {
    method: 'POST',
    ...jsonBody(body)
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const blob = await res.blob()
  const fileName = parseDownloadName(res.headers.get('Content-Disposition'), fallbackName)
  const mimeType = res.headers.get('Content-Type')
  return { fileId, displayName: fileName, mimeType, blob }
}

export interface OpenedFileView {
  fileId: string
  displayName: string
  mimeType: string | null
  blob: Blob
}

export const api = {
  auth: {
    register: (payload: RegisterPayload) =>
      json<AuthResultDto>('/api/auth/register', { method: 'POST', ...jsonBody(payload) }),
    login: (payload: LoginPayload) =>
      json<AuthResultDto>('/api/auth/login', { method: 'POST', ...jsonBody(payload) }),
    lockVault: () => json<AuthSessionDto>('/api/auth/logout', { method: 'POST' }),
    getSession: () => json<AuthSessionDto>('/api/auth/session'),
    touch: () =>
      json<{ ok: boolean }>('/api/auth/touch', { method: 'POST' }).then((r) => r.ok),
    changePassword: (payload: { currentPassword: string; newPassword: string }) =>
      json<{ ok: boolean }>('/api/auth/change-password', {
        method: 'POST',
        ...jsonBody(payload)
      }).then((r) => r.ok)
  },
  files: {
    addFile: async (payload: {
      file: File
      displayName: string
      categoryId: string
      folderId?: string | null
      accessPassword?: string | null
    }): Promise<FileDto> => {
      const form = new FormData()
      // Text fields must come before the file. Fastify only exposes fields parsed
      // before the file stream starts, and folderId is required.
      form.append('displayName', payload.displayName)
      if (payload.folderId) form.append('folderId', payload.folderId)
      if (payload.categoryId) form.append('categoryId', payload.categoryId)
      if (payload.accessPassword) form.append('accessPassword', payload.accessPassword)
      form.append('file', payload.file)
      return json<FileDto>('/api/files', { method: 'POST', body: form })
    },
    listFiles: (filter: ListFilesFilter = {}) => {
      const params = new URLSearchParams()
      if (filter.folderId) params.set('folderId', filter.folderId)
      if (filter.categoryId) params.set('categoryId', filter.categoryId)
      const qs = params.toString()
      return json<FileDto[]>(`/api/files${qs ? `?${qs}` : ''}`)
    },
    deleteFile: (fileId: string) =>
      json<FileDto>(`/api/files/${fileId}`, { method: 'DELETE' }),
    moveFile: (payload: MoveFilePayload) =>
      json<FileDto>(`/api/files/${payload.fileId}/move`, {
        method: 'POST',
        ...jsonBody({ targetFolderId: payload.targetFolderId })
      }),
    copyFile: (payload: CopyFilePayload) =>
      json<FileDto>(`/api/files/${payload.fileId}/copy`, {
        method: 'POST',
        ...jsonBody({ targetFolderId: payload.targetFolderId })
      }),
    renameFile: (payload: RenameFilePayload) =>
      json<FileDto>(`/api/files/${payload.fileId}/rename`, {
        method: 'POST',
        ...jsonBody({ displayName: payload.displayName })
      }),
    openFile: async (payload: PasswordFilePayload): Promise<OpenedFileView> => {
      return fetchViewBlob(payload.fileId, payload.password, 'file')
    }
  },
  folders: {
    listFolders: () => json<FolderDto[]>('/api/folders'),
    createFolder: (payload: CreateFolderPayload) =>
      json<FolderDto>('/api/folders', { method: 'POST', ...jsonBody(payload) }),
    deleteFolder: (folderId: string) =>
      json<FolderDto>(`/api/folders/${folderId}`, { method: 'DELETE' })
  },
  categories: {
    listCategories: () => json<FileCategoryDto[]>('/api/categories'),
    createCategory: (payload: CreateCategoryPayload) =>
      json<FileCategoryDto>('/api/categories', { method: 'POST', ...jsonBody(payload) }),
    ensureSidebar: () =>
      json<{ categories: FileCategoryDto[]; folders: FolderDto[] }>('/api/sidebar/ensure', {
        method: 'POST'
      })
  },
  admin: {
    listUsers: () => json<AdminUserDto[]>('/api/admin/users'),
    createUser: (payload: AdminCreateUserPayload) =>
      json<AdminUserDto>('/api/admin/users', { method: 'POST', ...jsonBody(payload) }),
    setUserRoles: (payload: AdminSetUserRolesPayload) =>
      json<AdminUserDto>(`/api/admin/users/${payload.userId}/roles`, {
        method: 'PATCH',
        ...jsonBody({ roleCodes: payload.roleCodes })
      }),
    setUserDisabled: (userId: string, isDisabled: boolean) =>
      json<AdminUserDto>(`/api/admin/users/${userId}/disabled`, {
        method: 'PATCH',
        ...jsonBody({ isDisabled })
      }),
    listRoles: () => json<RoleDto[]>('/api/admin/roles'),
    listAclFolders: () => json<FolderDto[]>('/api/admin/folders'),
    listFolderAcls: (folderId: string) =>
      json<FolderAclDto[]>(`/api/admin/folders/${folderId}/acls`),
    getUserFolderAccess: (userId: string) =>
      json<UserFolderAccessDto>(`/api/admin/users/${userId}/folder-access`),
    setUserFolderAccess: (userId: string, grants: FolderGrantDto[]) =>
      json<UserFolderAccessDto>(`/api/admin/users/${userId}/folder-access`, {
        method: 'PUT',
        ...jsonBody({ grants })
      }),
    setFolderAcl: (payload: AdminSetFolderAclPayload) =>
      json<FolderAclDto[]>(`/api/admin/folders/${payload.folderId}/acls`, {
        method: 'PUT',
        ...jsonBody(payload)
      }),
    revokeFolderAcl: (folderAclId: string) =>
      json<FolderAclDto[]>(`/api/admin/acls/${folderAclId}`, { method: 'DELETE' }),
    getMyAccess: () => json<import('@securevault/domain').MyAccessEntryDto[]>('/api/admin/my-access'),
    getStorage: () =>
      json<{ blobRoot: string; layout: string; note: string }>('/api/admin/storage'),
    listAuditLogs: (filter: {
      userId?: string
      categoryId?: string
      action?: string
      from?: string
      to?: string
      cursor?: string
      limit?: number
    } = {}) => {
      const params = new URLSearchParams()
      if (filter.userId) params.set('userId', filter.userId)
      if (filter.categoryId) params.set('categoryId', filter.categoryId)
      if (filter.action) params.set('action', filter.action)
      if (filter.from) params.set('from', filter.from)
      if (filter.to) params.set('to', filter.to)
      if (filter.cursor) params.set('cursor', filter.cursor)
      if (filter.limit) params.set('limit', String(filter.limit))
      const qs = params.toString()
      return json<AuditLogListDto>(`/api/admin/audit-logs${qs ? `?${qs}` : ''}`)
    }
  },
  search: (q: string, opts?: { cursor?: string; limit?: number; signal?: AbortSignal }) => {
    const params = new URLSearchParams({ q })
    if (opts?.cursor) params.set('cursor', opts.cursor)
    if (opts?.limit) params.set('limit', String(opts.limit))
    return json<VaultSearchResults>(`/api/search?${params}`, { signal: opts?.signal })
  },
  searchFolder: (input: {
    folderId: string
    q: string
    includeSubfolders?: boolean
    cursor?: string
    limit?: number
    signal?: AbortSignal
  }) => {
    const params = new URLSearchParams({ folderId: input.folderId, q: input.q })
    if (input.includeSubfolders) params.set('includeSubfolders', 'true')
    if (input.cursor) params.set('cursor', input.cursor)
    if (input.limit) params.set('limit', String(input.limit))
    return json<FileSearchPageDto>(`/api/search/folder?${params}`, { signal: input.signal })
  },
  ensureSidebar: () =>
    json<{ categories: FileCategoryDto[]; folders: FolderDto[] }>('/api/sidebar/ensure', {
      method: 'POST'
    }),
  listFiles: (filter?: ListFilesFilter) => api.files.listFiles(filter),
  addFile: (payload: {
    file: File
    displayName: string
    categoryId: string
    folderId?: string | null
    accessPassword?: string | null
  }) => api.files.addFile(payload),
  deleteFile: (fileId: string) => api.files.deleteFile(fileId),
  moveFile: (payload: MoveFilePayload) => api.files.moveFile(payload),
  copyFile: (payload: CopyFilePayload) => api.files.copyFile(payload),
  renameFile: (payload: RenameFilePayload) => api.files.renameFile(payload),
  openFile: (payload: PasswordFilePayload) => api.files.openFile(payload),
  createFolder: (payload: CreateFolderPayload) => api.folders.createFolder(payload),
  deleteFolder: (folderId: string) => api.folders.deleteFolder(folderId)
}
