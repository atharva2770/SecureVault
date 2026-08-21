/**
 * RBAC / ACL constants — keep stable; seeded in SQL with fixed UUIDs.
 */
export const PermissionCode = {
  VIEW: 'VIEW',
  EDIT: 'EDIT',
  COPY: 'COPY',
  DELETE: 'DELETE',
  ADMIN_USERS: 'ADMIN_USERS',
  ADMIN_ACL: 'ADMIN_ACL'
} as const

export type PermissionCodeName = (typeof PermissionCode)[keyof typeof PermissionCode]

export const RoleCode = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  MEMBER: 'MEMBER',
  VIEWER: 'VIEWER'
} as const

export type RoleCodeName = (typeof RoleCode)[keyof typeof RoleCode]

export const PrincipalType = {
  USER: 'USER',
  ROLE: 'ROLE'
} as const

export type FolderRight = 'view' | 'edit' | 'copy' | 'delete'

export interface FolderRights {
  view: boolean
  edit: boolean
  copy: boolean
  delete: boolean
}

export const EMPTY_RIGHTS: FolderRights = {
  view: false,
  edit: false,
  copy: false,
  delete: false
}

export const FULL_RIGHTS: FolderRights = {
  view: true,
  edit: true,
  copy: true,
  delete: true
}

export function unionRights(a: FolderRights, b: FolderRights): FolderRights {
  return {
    view: a.view || b.view,
    edit: a.edit || b.edit,
    copy: a.copy || b.copy,
    delete: a.delete || b.delete
  }
}

export function intersectRights(a: FolderRights, b: FolderRights): FolderRights {
  return {
    view: a.view && b.view,
    edit: a.edit && b.edit,
    copy: a.copy && b.copy,
    delete: a.delete && b.delete
  }
}

export function rightToFlag(rights: FolderRights, right: FolderRight): boolean {
  return rights[right]
}
