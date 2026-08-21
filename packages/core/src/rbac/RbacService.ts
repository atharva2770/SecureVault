import { DBService, type PrismaClient } from '@securevault/db'
import { RoleCode } from '@securevault/domain'

import { AccessControlService } from '../access/AccessControlService'

/**
 * Role assignment helpers used by AuthService and AdminService.
 */
export class RbacService {
  private static instance: RbacService | null = null

  private readonly db = DBService.getInstance()
  private readonly acl = AccessControlService.getInstance()

  private constructor() {}

  static getInstance(): RbacService {
    if (!RbacService.instance) {
      RbacService.instance = new RbacService()
    }
    return RbacService.instance
  }

  private get prisma(): PrismaClient {
    return this.db.prisma
  }

  async getRoleByCode(code: string) {
    return this.prisma.role.findUnique({ where: { code: code.toUpperCase() } })
  }

  async listRoles() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        rolePermissions: { include: { permission: true } }
      }
    })
  }

  async assignRole(userId: string, roleCode: string, assignedBy?: string | null): Promise<void> {
    const role = await this.getRoleByCode(roleCode)
    if (!role) throw new Error(`Unknown role: ${roleCode}`)

    await this.prisma.userRole.upsert({
      where: {
        userId_roleId: { userId, roleId: role.roleId }
      },
      create: {
        userId,
        roleId: role.roleId,
        assignedBy: assignedBy ?? null
      },
      update: {
        assignedBy: assignedBy ?? null,
        assignedAt: new Date()
      }
    })

    await this.prisma.user.update({
      where: { userId },
      data: { role: role.code.toLowerCase() }
    })

    this.acl.invalidateUser(userId)
  }

  async replaceRoles(
    userId: string,
    roleCodes: string[],
    assignedBy?: string | null
  ): Promise<void> {
    const uniqueCodes = [...new Set(roleCodes.map((c) => c.toUpperCase()))]
    const roles = await this.prisma.role.findMany({
      where: { code: { in: uniqueCodes } }
    })
    if (!roles.length) throw new Error('No valid roles provided.')

    await this.prisma.userRole.deleteMany({ where: { userId } })

    for (const role of roles) {
      await this.prisma.userRole.create({
        data: {
          userId,
          roleId: role.roleId,
          assignedBy: assignedBy ?? null
        }
      })
    }

    const primary =
      roles.find((r) => r.code === RoleCode.ADMIN)?.code ??
      roles.find((r) => r.code === RoleCode.MANAGER)?.code ??
      roles[0].code

    await this.prisma.user.update({
      where: { userId },
      data: { role: primary.toLowerCase() }
    })

    this.acl.invalidateUser(userId)
  }

  async getUserRoleCodes(userId: string): Promise<string[]> {
    return this.acl.getRoleCodes(userId)
  }

  /**
   * Grants full inherited rights on all category roots (bootstrap / first admin).
   */
  async grantFullAccessOnCategoryRoots(userId: string, grantedBy?: string | null): Promise<void> {
    const roots = await this.prisma.folder.findMany({
      where: { isCategoryRoot: true, isDeleted: false },
      select: { folderId: true }
    })

    for (const root of roots) {
      await this.upsertUserFolderAcl(root.folderId, userId, {
        canView: true,
        canEdit: true,
        canCopy: true,
        canDelete: true,
        inherit: true,
        grantedBy: grantedBy ?? null
      })
    }

    this.acl.invalidateUser(userId)
  }

  async upsertUserFolderAcl(
    folderId: string,
    userId: string,
    rights: {
      canView: boolean
      canEdit: boolean
      canCopy: boolean
      canDelete: boolean
      inherit: boolean
      grantedBy?: string | null
    }
  ): Promise<void> {
    await this.prisma.folderAcl.upsert({
      where: {
        folderId_principalType_principalId: {
          folderId,
          principalType: 'USER',
          principalId: userId
        }
      },
      create: {
        folderId,
        principalType: 'USER',
        principalId: userId,
        canView: rights.canView,
        canEdit: rights.canEdit,
        canCopy: rights.canCopy,
        canDelete: rights.canDelete,
        inherit: rights.inherit,
        grantedBy: rights.grantedBy ?? null
      },
      update: {
        canView: rights.canView,
        canEdit: rights.canEdit,
        canCopy: rights.canCopy,
        canDelete: rights.canDelete,
        inherit: rights.inherit,
        grantedBy: rights.grantedBy ?? null,
        grantedAt: new Date()
      }
    })
    this.acl.invalidateUser(userId)
    this.acl.invalidateFolder(folderId)
  }

  async upsertRoleFolderAcl(
    folderId: string,
    roleIdOrCode: string,
    rights: {
      canView: boolean
      canEdit: boolean
      canCopy: boolean
      canDelete: boolean
      inherit: boolean
      grantedBy?: string | null
    }
  ): Promise<void> {
    const role =
      (await this.prisma.role.findUnique({ where: { roleId: roleIdOrCode } })) ??
      (await this.getRoleByCode(roleIdOrCode))
    if (!role) throw new Error('Role not found.')

    await this.prisma.folderAcl.upsert({
      where: {
        folderId_principalType_principalId: {
          folderId,
          principalType: 'ROLE',
          principalId: role.roleId
        }
      },
      create: {
        folderId,
        principalType: 'ROLE',
        principalId: role.roleId,
        canView: rights.canView,
        canEdit: rights.canEdit,
        canCopy: rights.canCopy,
        canDelete: rights.canDelete,
        inherit: rights.inherit,
        grantedBy: rights.grantedBy ?? null
      },
      update: {
        canView: rights.canView,
        canEdit: rights.canEdit,
        canCopy: rights.canCopy,
        canDelete: rights.canDelete,
        inherit: rights.inherit,
        grantedBy: rights.grantedBy ?? null,
        grantedAt: new Date()
      }
    })

    this.acl.invalidateAll()
  }
}

export default RbacService
