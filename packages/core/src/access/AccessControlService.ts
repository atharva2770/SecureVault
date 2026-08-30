import { DBService, type PrismaClient } from '@securevault/db'
import {
  EMPTY_RIGHTS,
  FULL_RIGHTS,
  FolderRight,
  FolderRights,
  PermissionCode,
  PrincipalType,
  RoleCode,
  intersectRights,
  resolveFolderRightsPure,
  rightToFlag
} from '@securevault/domain'
import type { AccessGrant } from '@securevault/domain'

import { AuditAction, recordAudit } from '../audit/AuditService'
import { getSearchCache } from '../files/searchCache'

interface CacheEntry {
  rights: FolderRights
  expiresAt: number
}

interface IdentityCacheEntry {
  roleCodes: string[]
  roleIds: string[]
  permissionCodes: Set<string>
  expiresAt: number
}

export interface MyAccessEntry {
  folderId: string
  folderName: string
  path: string
  isCategoryRoot: boolean
  rights: FolderRights
}

const CACHE_TTL_MS = 30_000

type AclRow = {
  folderId: string
  principalType: string
  principalId: string
  canView: boolean
  canEdit: boolean
  canCopy: boolean
  canDelete: boolean
  inherit: boolean
}

/**
 * Single authz engine for the web API.
 * Deny-by-default. Admin bypasses folder ACL. Viewer role caps at VIEW.
 * Effective rights are computed by {@link resolveFolderRightsPure} — do not re-implement.
 */
export class AccessControlService {
  private static instance: AccessControlService | null = null

  private readonly db = DBService.getInstance()

  private readonly rightsCache = new Map<string, CacheEntry>()
  private readonly identityCache = new Map<string, IdentityCacheEntry>()

  private constructor() {}

  static getInstance(): AccessControlService {
    if (!AccessControlService.instance) {
      AccessControlService.instance = new AccessControlService()
    }
    return AccessControlService.instance
  }

  private get prisma(): PrismaClient {
    return this.db.prisma
  }

  invalidateUser(userId: string): void {
    this.identityCache.delete(userId)
    const prefix = `${userId}:`
    for (const key of [...this.rightsCache.keys()]) {
      if (key.startsWith(prefix)) this.rightsCache.delete(key)
    }
    getSearchCache().invalidateUser(userId)
  }

  invalidateFolder(_folderId: string): void {
    this.rightsCache.clear()
    getSearchCache().invalidateOnFileMutation(_folderId)
  }

  invalidateAll(): void {
    this.rightsCache.clear()
    this.identityCache.clear()
    getSearchCache().invalidateAll()
  }

  async getRoleCodes(userId: string): Promise<string[]> {
    const identity = await this.loadIdentity(userId)
    return identity.roleCodes
  }

  async hasGlobalPermission(userId: string, code: string): Promise<boolean> {
    const identity = await this.loadIdentity(userId)
    return identity.permissionCodes.has(code)
  }

  async isAdmin(userId: string): Promise<boolean> {
    const roles = await this.getRoleCodes(userId)
    return roles.includes(RoleCode.ADMIN)
  }

  async getEffectiveRights(folderId: string, userId: string): Promise<FolderRights> {
    return this.resolveEffectiveRights(userId, folderId)
  }

  async require(folderId: string, right: FolderRight, userId: string): Promise<FolderRights> {
    const rights = await this.resolveEffectiveRights(userId, folderId)
    if (!rightToFlag(rights, right)) {
      recordAudit({
        action: AuditAction.AUTH_DENY,
        userId,
        folderId,
        details: `deny:${right}:folder:${folderId}`
      })
      throw new Error('Access denied.')
    }
    return rights
  }

  async requireFile(fileId: string, right: FolderRight, userId: string): Promise<FolderRights> {
    const file = await this.prisma.file.findFirst({
      where: { fileId, isDeleted: false },
      select: { folderId: true, fileId: true }
    })
    if (!file?.folderId) {
      throw new Error('File not found.')
    }

    let rights = await this.require(file.folderId, right, userId)

    const fileAcl = await this.prisma.filePermission.findUnique({
      where: { fileId_userId: { fileId, userId } }
    })
    if (fileAcl) {
      const fileRights = this.fileAccessLevelToRights(fileAcl.accessLevel)
      rights = intersectRights(rights, fileRights)
      if (!rightToFlag(rights, right)) {
        recordAudit({
          action: AuditAction.AUTH_DENY,
          userId,
          fileId,
          folderId: file.folderId,
          details: `deny:${right}:file:${fileId}`
        })
        throw new Error('Access denied.')
      }
    }

    return rights
  }

  async filterViewableFolderIds(folderIds: string[], userId: string): Promise<Set<string>> {
    const allowed = new Set<string>()
    for (const id of folderIds) {
      const rights = await this.resolveEffectiveRights(userId, id)
      if (rights.view) allowed.add(id)
    }
    return allowed
  }

  /**
   * True when this folder has no content grant, but a descendant does.
   * Used so the user can open the parent as a path without seeing its files or siblings.
   */
  async isAncestorOfGrantedFolder(folderId: string, userId: string): Promise<boolean> {
    const identity = await this.loadIdentity(userId)
    if (identity.roleCodes.includes(RoleCode.ADMIN)) return false

    const folders = await this.prisma.folder.findMany({
      where: { isDeleted: false },
      select: { folderId: true, parentFolderId: true }
    })
    const childrenByParent = new Map<string, string[]>()
    for (const folder of folders) {
      if (!folder.parentFolderId) continue
      const list = childrenByParent.get(folder.parentFolderId) ?? []
      list.push(folder.folderId)
      childrenByParent.set(folder.parentFolderId, list)
    }

    const stack = [...(childrenByParent.get(folderId) ?? [])]
    while (stack.length) {
      const id = stack.pop()!
      const rights = await this.resolveEffectiveRights(userId, id)
      if (rights.view) return true
      const kids = childrenByParent.get(id)
      if (kids) stack.push(...kids)
    }
    return false
  }

  async getMyAccess(userId: string): Promise<MyAccessEntry[]> {
    const folders = await this.prisma.folder.findMany({
      where: { isDeleted: false },
      orderBy: [{ isCategoryRoot: 'desc' }, { name: 'asc' }]
    })

    const byId = new Map(folders.map((f) => [f.folderId, f]))
    const result: MyAccessEntry[] = []

    for (const folder of folders) {
      const rights = await this.resolveEffectiveRights(userId, folder.folderId)
      if (!rights.view) continue

      const parts: string[] = []
      let cur: (typeof folder) | undefined = folder
      const seen = new Set<string>()
      while (cur && !seen.has(cur.folderId)) {
        seen.add(cur.folderId)
        parts.unshift(cur.name)
        cur = cur.parentFolderId ? byId.get(cur.parentFolderId) : undefined
      }

      result.push({
        folderId: folder.folderId,
        folderName: folder.name,
        path: parts.join(' / '),
        isCategoryRoot: folder.isCategoryRoot,
        rights
      })
    }

    return result
  }

  private fileAccessLevelToRights(level: string): FolderRights {
    const normalized = level.trim().toLowerCase()
    switch (normalized) {
      case 'full':
      case 'owner':
        return FULL_RIGHTS
      case 'delete':
        return { view: true, edit: true, copy: true, delete: true }
      case 'edit':
      case 'write':
        return { view: true, edit: true, copy: true, delete: false }
      case 'copy':
      case 'download':
        return { view: true, edit: false, copy: true, delete: false }
      case 'view':
      case 'read':
      default:
        return { view: true, edit: false, copy: false, delete: false }
    }
  }

  private async resolveEffectiveRights(userId: string, folderId: string): Promise<FolderRights> {
    const cacheKey = `${userId}:${folderId}`
    const cached = this.rightsCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.rights
    }

    const identity = await this.loadIdentity(userId)
    const isAdmin = identity.roleCodes.includes(RoleCode.ADMIN)

    if (isAdmin) {
      this.rightsCache.set(cacheKey, {
        rights: FULL_RIGHTS,
        expiresAt: Date.now() + CACHE_TTL_MS
      })
      return FULL_RIGHTS
    }

    const folder = await this.prisma.folder.findFirst({
      where: { folderId, isDeleted: false },
      select: { folderId: true, parentFolderId: true }
    })
    if (!folder) {
      return EMPTY_RIGHTS
    }

    const chain = await this.buildAncestorChain(folderId)
    const chainIds = chain.map((n) => n.folderId)
    if (!chainIds.length) return EMPTY_RIGHTS

    const principalFilters: Array<{
      principalType: string
      principalId: string | { in: string[] }
    }> = [{ principalType: PrincipalType.USER, principalId: userId }]
    if (identity.roleIds.length) {
      principalFilters.push({
        principalType: PrincipalType.ROLE,
        principalId: { in: identity.roleIds }
      })
    }

    const rows: AclRow[] = await this.prisma.folderAcl.findMany({
      where: {
        folderId: { in: chainIds },
        OR: principalFilters
      },
      select: {
        folderId: true,
        principalType: true,
        principalId: true,
        canView: true,
        canEdit: true,
        canCopy: true,
        canDelete: true,
        inherit: true
      }
    })

    const grants: AccessGrant[] = rows.map((row) => ({
      principalType: row.principalType === PrincipalType.ROLE ? 'ROLE' : 'USER',
      principalId: row.principalId,
      rights: {
        view: row.canView,
        edit: row.canEdit,
        copy: row.canCopy,
        delete: row.canDelete
      },
      inherit: row.inherit,
      folderId: row.folderId
    }))

    const effective = resolveFolderRightsPure({
      isAdmin,
      roleCapability: this.roleCapabilityCap(identity.permissionCodes),
      userId,
      roleIds: identity.roleIds,
      chainFolderIds: chainIds,
      grants
    })

    this.rightsCache.set(cacheKey, {
      rights: effective,
      expiresAt: Date.now() + CACHE_TTL_MS
    })

    return effective
  }

  private roleCapabilityCap(permissionCodes: Set<string>): FolderRights {
    return {
      view: permissionCodes.has(PermissionCode.VIEW),
      edit: permissionCodes.has(PermissionCode.EDIT),
      copy: permissionCodes.has(PermissionCode.COPY),
      delete: permissionCodes.has(PermissionCode.DELETE)
    }
  }

  private async buildAncestorChain(
    folderId: string
  ): Promise<{ folderId: string; parentFolderId: string | null }[]> {
    const chain: { folderId: string; parentFolderId: string | null }[] = []
    let currentId: string | null = folderId
    const seen = new Set<string>()

    while (currentId && !seen.has(currentId)) {
      seen.add(currentId)
      const node: { folderId: string; parentFolderId: string | null } | null =
        await this.prisma.folder.findFirst({
          where: { folderId: currentId, isDeleted: false },
          select: { folderId: true, parentFolderId: true }
        })
      if (!node) break
      chain.unshift(node)
      currentId = node.parentFolderId
    }
    return chain
  }

  private async loadIdentity(userId: string): Promise<IdentityCacheEntry> {
    const cached = this.identityCache.get(userId)
    if (cached && cached.expiresAt > Date.now()) {
      return cached
    }

    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true }
            }
          }
        }
      }
    })

    const roleCodes = userRoles.map((ur) => ur.role.code.toUpperCase())
    const roleIds = userRoles.map((ur) => ur.role.roleId)
    const permissionCodes = new Set<string>()
    for (const ur of userRoles) {
      for (const rp of ur.role.rolePermissions) {
        permissionCodes.add(rp.permission.code.toUpperCase())
      }
    }

    const entry: IdentityCacheEntry = {
      roleCodes,
      roleIds,
      permissionCodes,
      expiresAt: Date.now() + CACHE_TTL_MS
    }
    this.identityCache.set(userId, entry)
    return entry
  }
}

export default AccessControlService
