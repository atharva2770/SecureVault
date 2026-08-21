import { randomUUID } from 'node:crypto'

import type {
  AdminCreateUserPayload,
  AdminSetFolderAclPayload,
  AdminSetUserRolesPayload,
  AdminUserDto,
  FolderAclDto,
  FolderDto,
  RoleDto
} from '@securevault/domain'
import { PermissionCode, RoleCode } from '@securevault/domain'
import { AccessControlService } from '../access/AccessControlService'
import { AuditAction, AuditService } from '../audit/AuditService'
import type { Argon2Params } from '../crypto/CryptoService'
import { CryptoService } from '../crypto/CryptoService'
import { DBService } from '@securevault/db'
import { RbacService } from '../rbac/RbacService'
import { secureZero, sha256Hex } from '../utils/secure'

interface StoredAuthParams extends Argon2Params {
  kekVerifier: string
}

/**
 * Admin-only user / role / folder-ACL management (Phase 2).
 */
export class AdminService {
  private static instance: AdminService | null = null

  private readonly db = DBService.getInstance()
  private readonly crypto = CryptoService.getInstance()
  private readonly acl = AccessControlService.getInstance()
  private readonly rbac = RbacService.getInstance()
  private readonly audit = AuditService.getInstance()

  private constructor() {}

  static getInstance(): AdminService {
    if (!AdminService.instance) {
      AdminService.instance = new AdminService()
    }
    return AdminService.instance
  }

  private async requireAdminOrManager(actorUserId: string, forAclOnly = false): Promise<string> {
    if (await this.acl.isAdmin(actorUserId)) return actorUserId
    if (forAclOnly && (await this.acl.hasGlobalPermission(actorUserId, PermissionCode.ADMIN_ACL))) {
      return actorUserId
    }
    throw new Error('Access denied. Admin privileges required.')
  }

  async listRoles(actorUserId: string): Promise<RoleDto[]> {
    await this.requireAdminOrManager(actorUserId, true)
    const roles = await this.db.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        rolePermissions: { include: { permission: true } }
      }
    })
    return roles.map((r) => ({
      roleId: r.roleId,
      code: r.code,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissions: r.rolePermissions.map((rp) => rp.permission.code)
    }))
  }

  async listUsers(actorUserId: string): Promise<AdminUserDto[]> {
    await this.requireAdminOrManager(actorUserId, false)
    const users = await this.db.prisma.user.findMany({
      orderBy: { username: 'asc' },
      include: {
        userRoles: { include: { role: true } }
      }
    })
    return users.map((u) => ({
      userId: u.userId,
      username: u.username,
      role: u.role,
      roles: u.userRoles.map((ur) => ur.role.code),
      isDisabled: u.isDisabled,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null
    }))
  }

  /**
   * Creates a vault user without unlocking their session (admin provision).
   */
  async createUser(actorUserId: string, payload: AdminCreateUserPayload): Promise<AdminUserDto> {
    const actorId = await this.requireAdminOrManager(actorUserId, false)
    const username = payload.username?.trim()
    const password = payload.password
    const roleCode = (payload.roleCode || RoleCode.MEMBER).toUpperCase()

    if (!username || username.length < 3 || username.length > 100) {
      throw new Error('Username must be between 3 and 100 characters.')
    }
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters.')
    }

    if (roleCode === RoleCode.ADMIN && !(await this.acl.isAdmin(actorId))) {
      throw new Error('Only an Admin can create another Admin.')
    }

    const existing = await this.db.prisma.user.findUnique({ where: { username } })
    if (existing) throw new Error('Username is already taken.')

    const salt = this.crypto.generateSalt(32)
    const params = this.crypto.getDefaultArgon2Params()
    let kek: Buffer | null = null

    try {
      kek = await this.crypto.deriveKEK(password, salt, params)
      const stored: StoredAuthParams = {
        ...params,
        kekVerifier: sha256Hex(kek)
      }

      const user = await this.db.prisma.user.create({
        data: {
          username,
          passwordSalt: new Uint8Array(salt),
          argon2Params: JSON.stringify(stored),
          role: roleCode.toLowerCase()
        }
      })

      await this.rbac.replaceRoles(user.userId, [roleCode], actorId)

      if (payload.grantAllCategoryRoots) {
        await this.rbac.grantFullAccessOnCategoryRoots(user.userId, actorId)
      }

      await this.audit.write({
        action: AuditAction.ACL_GRANT,
        userId: actorId,
        details: `createUser:${username}:role:${roleCode}`
      })

      const roles = await this.rbac.getUserRoleCodes(user.userId)
      return {
        userId: user.userId,
        username: user.username,
        role: user.role,
        roles,
        isDisabled: user.isDisabled,
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: null
      }
    } finally {
      secureZero(kek)
    }
  }

  async setUserRoles(actorUserId: string, payload: AdminSetUserRolesPayload): Promise<AdminUserDto> {
    const actorId = await this.requireAdminOrManager(actorUserId, false)
    const targetId = payload.userId?.trim()
    if (!targetId) throw new Error('userId is required.')

    if (targetId === actorId && !payload.roleCodes.map((c) => c.toUpperCase()).includes(RoleCode.ADMIN)) {
      const actorIsAdmin = await this.acl.isAdmin(actorId)
      if (actorIsAdmin) {
        throw new Error('You cannot remove your own Admin role.')
      }
    }

    if (
      payload.roleCodes.map((c) => c.toUpperCase()).includes(RoleCode.ADMIN) &&
      !(await this.acl.isAdmin(actorId))
    ) {
      throw new Error('Only an Admin can assign the Admin role.')
    }

    await this.rbac.replaceRoles(targetId, payload.roleCodes, actorId)

    await this.audit.write({
      action: AuditAction.ACL_GRANT,
      userId: actorId,
      details: `setRoles:${targetId}:${payload.roleCodes.join(',')}`
    })

    return this.getUserDto(targetId)
  }

  async setUserDisabled(
    actorUserId: string,
    userId: string,
    isDisabled: boolean
  ): Promise<AdminUserDto> {
    const actorId = await this.requireAdminOrManager(actorUserId, false)
    if (userId === actorId && isDisabled) {
      throw new Error('You cannot disable your own account.')
    }

    await this.db.prisma.user.update({
      where: { userId },
      data: { isDisabled }
    })

    this.acl.invalidateUser(userId)

    await this.audit.write({
      action: AuditAction.ACL_GRANT,
      userId: actorId,
      details: `${isDisabled ? 'disable' : 'enable'}:${userId}`
    })

    return this.getUserDto(userId)
  }

  /**
   * Lists category-root folders (for ACL matrix) with optional all folders.
   */
  async listAclFolders(actorUserId: string): Promise<FolderDto[]> {
    await this.requireAdminOrManager(actorUserId, true)
    const folders = await this.db.prisma.folder.findMany({
      where: { isDeleted: false },
      orderBy: [{ isCategoryRoot: 'desc' }, { name: 'asc' }]
    })

    // Admin sees all folders; attach full rights for DTO shape
    return folders.map((f) => ({
      folderId: f.folderId,
      parentFolderId: f.parentFolderId,
      categoryId: f.categoryId,
      name: f.name,
      isCategoryRoot: f.isCategoryRoot,
      createdAt: f.createdAt.toISOString(),
      rights: { view: true, edit: true, copy: true, delete: true }
    }))
  }

  async listFolderAcls(actorUserId: string, folderId: string): Promise<FolderAclDto[]> {
    await this.requireAdminOrManager(actorUserId, true)
    const rows = await this.db.prisma.folderAcl.findMany({
      where: { folderId },
      orderBy: { grantedAt: 'desc' }
    })

    const userIds = rows
      .filter((r) => r.principalType === 'USER')
      .map((r) => r.principalId)
    const roleIds = rows
      .filter((r) => r.principalType === 'ROLE')
      .map((r) => r.principalId)

    const [users, roles] = await Promise.all([
      userIds.length
        ? this.db.prisma.user.findMany({
            where: { userId: { in: userIds } },
            select: { userId: true, username: true }
          })
        : Promise.resolve([]),
      roleIds.length
        ? this.db.prisma.role.findMany({
            where: { roleId: { in: roleIds } },
            select: { roleId: true, code: true, name: true }
          })
        : Promise.resolve([])
    ])

    const userMap = new Map(users.map((u) => [u.userId, u.username] as const))
    const roleMap = new Map(roles.map((r) => [r.roleId, r] as const))

    return rows.map((r) => ({
      folderAclId: r.folderAclId,
      folderId: r.folderId,
      principalType: r.principalType as 'USER' | 'ROLE',
      principalId: r.principalId,
      principalLabel:
        r.principalType === 'USER'
          ? (userMap.get(r.principalId) ?? r.principalId)
          : (roleMap.get(r.principalId)?.name ?? r.principalId),
      canView: r.canView,
      canEdit: r.canEdit,
      canCopy: r.canCopy,
      canDelete: r.canDelete,
      inherit: r.inherit,
      grantedAt: r.grantedAt.toISOString()
    }))
  }

  async setFolderAcl(actorUserId: string, payload: AdminSetFolderAclPayload): Promise<FolderAclDto[]> {
    const actorId = await this.requireAdminOrManager(actorUserId, true)
    const folderId = payload.folderId?.trim()
    if (!folderId) throw new Error('folderId is required.')

    const folder = await this.db.prisma.folder.findFirst({
      where: { folderId, isDeleted: false }
    })
    if (!folder) throw new Error('Folder not found.')

    const principalType = payload.principalType === 'ROLE' ? 'ROLE' : 'USER'
    let principalId = payload.principalId?.trim()
    if (!principalId) throw new Error('principalId is required.')

    if (principalType === 'ROLE') {
      const role = await this.db.prisma.role.findFirst({
        where: {
          OR: [{ roleId: principalId }, { code: principalId.toUpperCase() }]
        }
      })
      if (!role) throw new Error('Role not found.')
      principalId = role.roleId
    } else {
      const user = await this.db.prisma.user.findUnique({ where: { userId: principalId } })
      if (!user) throw new Error('User not found.')
    }

    const canView = Boolean(payload.canView)
    const canEdit = canView && Boolean(payload.canEdit)
    const canCopy = canView && Boolean(payload.canCopy)
    const canDelete = canView && Boolean(payload.canDelete)
    const inherit = payload.inherit !== false

    if (!canView && !canEdit && !canCopy && !canDelete) {
      await this.db.prisma.folderAcl.deleteMany({
        where: { folderId, principalType, principalId }
      })
    } else {
      await this.db.prisma.folderAcl.upsert({
        where: {
          folderId_principalType_principalId: {
            folderId,
            principalType,
            principalId
          }
        },
        create: {
          folderAclId: randomUUID(),
          folderId,
          principalType,
          principalId,
          canView,
          canEdit,
          canCopy,
          canDelete,
          inherit,
          grantedBy: actorId
        },
        update: {
          canView,
          canEdit,
          canCopy,
          canDelete,
          inherit,
          grantedBy: actorId,
          grantedAt: new Date()
        }
      })
    }

    if (principalType === 'USER') {
      this.acl.invalidateUser(principalId)
    } else {
      this.acl.invalidateAll()
    }
    this.acl.invalidateFolder(folderId)

    await this.audit.write({
      action: AuditAction.ACL_GRANT,
      userId: actorId,
      details: `folderAcl:${folderId}:${principalType}:${principalId}:V${canView ? 1 : 0}E${canEdit ? 1 : 0}C${canCopy ? 1 : 0}D${canDelete ? 1 : 0}`
    })

    return this.listFolderAcls(actorId, folderId)
  }

  async revokeFolderAcl(actorUserId: string, folderAclId: string): Promise<FolderAclDto[]> {
    const actorId = await this.requireAdminOrManager(actorUserId, true)
    const row = await this.db.prisma.folderAcl.findUnique({ where: { folderAclId } })
    if (!row) throw new Error('ACL entry not found.')

    await this.db.prisma.folderAcl.delete({ where: { folderAclId } })

    if (row.principalType === 'USER') {
      this.acl.invalidateUser(row.principalId)
    } else {
      this.acl.invalidateAll()
    }
    this.acl.invalidateFolder(row.folderId)

    await this.audit.write({
      action: AuditAction.ACL_GRANT,
      userId: actorId,
      details: `revokeAcl:${folderAclId}`
    })

    return this.listFolderAcls(actorId, row.folderId)
  }

  async getMyAccess(actorUserId: string) {
    return this.acl.getMyAccess(actorUserId)
  }

  private async getUserDto(userId: string): Promise<AdminUserDto> {
    const u = await this.db.prisma.user.findUniqueOrThrow({
      where: { userId },
      include: { userRoles: { include: { role: true } } }
    })
    return {
      userId: u.userId,
      username: u.username,
      role: u.role,
      roles: u.userRoles.map((ur) => ur.role.code),
      isDisabled: u.isDisabled,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null
    }
  }
}

export default AdminService
