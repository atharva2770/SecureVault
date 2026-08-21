/**
 * Pure access-policy helpers for Electron main today and the future web API.
 * Keep enforcement in AccessControlService (desktop) / API middleware (web);
 * do not re-implement in any renderer or browser UI.
 *
 * Effective rights (summary):
 * - Deny by default
 * - Admin role → full rights
 * - Walk folder ancestors; Inherit ACLs apply to descendants
 * - Exact USER ACL on a folder overrides inherited USER rights
 * - ROLE principal grants union with user grants
 * - Intersect with role capability cap (Viewer → VIEW only)
 * - Optional FilePermission intersects further per file
 */

import type { FolderRights } from './rbac'
import { EMPTY_RIGHTS, intersectRights, unionRights } from './rbac'

export type AccessPrincipalType = 'USER' | 'ROLE'

export interface AccessGrant {
  principalType: AccessPrincipalType
  /** UserId or RoleId */
  principalId: string
  rights: FolderRights
  inherit: boolean
  /** Folder this grant is attached to */
  folderId: string
}

/**
 * Pure resolver for unit tests / future web service.
 * `chain` is ordered root → leaf; last id is the target folder.
 */
export function resolveFolderRightsPure(input: {
  isAdmin: boolean
  roleCapability: FolderRights
  userId: string
  roleIds: string[]
  chainFolderIds: string[]
  grants: AccessGrant[]
}): FolderRights {
  if (input.isAdmin) {
    return { view: true, edit: true, copy: true, delete: true }
  }

  const targetId = input.chainFolderIds[input.chainFolderIds.length - 1]
  if (!targetId) return EMPTY_RIGHTS

  let inherited = EMPTY_RIGHTS
  let exactUser = EMPTY_RIGHTS
  let hasExactUser = false
  let exactRole = EMPTY_RIGHTS
  let inheritedRoleOnly = EMPTY_RIGHTS

  for (const folderId of input.chainFolderIds) {
    const isExact = folderId === targetId
    const nodeGrants = input.grants.filter((g) => g.folderId === folderId)

    for (const g of nodeGrants) {
      const matchesUser = g.principalType === 'USER' && g.principalId === input.userId
      const matchesRole = g.principalType === 'ROLE' && input.roleIds.includes(g.principalId)
      if (!matchesUser && !matchesRole) continue

      if (isExact) {
        if (matchesUser) {
          exactUser = unionRights(exactUser, g.rights)
          hasExactUser = true
        } else {
          exactRole = unionRights(exactRole, g.rights)
        }
      } else if (g.inherit) {
        inherited = unionRights(inherited, g.rights)
        if (matchesRole) {
          inheritedRoleOnly = unionRights(inheritedRoleOnly, g.rights)
        }
      }
    }
  }

  let acl = hasExactUser
    ? unionRights(exactUser, unionRights(inheritedRoleOnly, exactRole))
    : unionRights(inherited, exactRole)

  acl = intersectRights(acl, input.roleCapability)
  if (!acl.view) return EMPTY_RIGHTS
  return acl
}
