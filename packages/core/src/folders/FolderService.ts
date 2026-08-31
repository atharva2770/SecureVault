import type { FileCategoryDto, FolderDto, FolderRights } from '@securevault/domain'
import { DEFAULT_VAULT_FOLDER_TREE, EMPTY_RIGHTS, traverseAncestorIds } from '@securevault/domain'
import { AccessControlService } from '../access/AccessControlService'
import { DBService } from '@securevault/db'
import { ensureVaultFolderDirForId, removeVaultFolderDirIfEmpty } from '../blobs/vaultDiskLayout'

/**
 * Category catalog + shared sidebar folder trees.
 * Visibility is ACL-driven (AccessControlService), not folder UserId.
 * Caller (the HTTP API) must pass the acting userId.
 */
export class FolderService {
  private static instance: FolderService | null = null

  private readonly db = DBService.getInstance()
  private readonly acl = AccessControlService.getInstance()

  private constructor() {}

  static getInstance(): FolderService {
    if (!FolderService.instance) {
      FolderService.instance = new FolderService()
    }
    return FolderService.instance
  }

  async ensureSidebarStructure(userId: string): Promise<{
    categories: FileCategoryDto[]
    folders: FolderDto[]
  }> {
    await this.ensureSharedCategoryRoots(userId)
    const [categories, folders] = await Promise.all([
      this.listCategories(userId),
      this.listFolders(userId)
    ])
    return { categories, folders }
  }

  async listCategories(userId: string): Promise<FileCategoryDto[]> {
    if (!userId) {
      throw new Error('Vault is locked. Sign in to unlock.')
    }

    const rows = await this.db.prisma.fileCategory.findMany({
      orderBy: { sortOrder: 'asc' }
    })

    return rows.map((row) => ({
      categoryId: row.categoryId,
      code: row.code,
      name: row.name,
      sortOrder: row.sortOrder,
      isSystem: row.isSystem
    }))
  }

  async createCategory(userId: string, name: string, code?: string): Promise<FileCategoryDto> {
    const isAdmin = await this.acl.isAdmin(userId)
    if (!isAdmin) {
      throw new Error('Access denied. Only admins can create categories.')
    }

    const trimmedName = name.trim()
    if (!trimmedName || trimmedName.length > 100) {
      throw new Error('Category name must be between 1 and 100 characters.')
    }

    const normalizedCode =
      code?.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_') ||
      trimmedName.toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 50)

    if (!normalizedCode) {
      throw new Error('Category code is invalid.')
    }

    const existing = await this.db.prisma.fileCategory.findUnique({
      where: { code: normalizedCode }
    })
    if (existing) {
      throw new Error('A category with this code already exists.')
    }

    const maxSort = await this.db.prisma.fileCategory.aggregate({
      _max: { sortOrder: true }
    })

    const row = await this.db.prisma.fileCategory.create({
      data: {
        code: normalizedCode,
        name: trimmedName,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 10,
        isSystem: false
      }
    })

    const root = await this.db.prisma.folder.create({
      data: {
        userId,
        categoryId: row.categoryId,
        parentFolderId: null,
        name: row.name,
        isCategoryRoot: true,
        sortOrder: row.sortOrder
      }
    })

    // Grant creator full ACL on new category root
    await this.db.prisma.folderAcl.create({
      data: {
        folderId: root.folderId,
        principalType: 'USER',
        principalId: userId,
        canView: true,
        canEdit: true,
        canCopy: true,
        canDelete: true,
        inherit: true,
        grantedBy: userId
      }
    })
    this.acl.invalidateUser(userId)

    await ensureVaultFolderDirForId(root.folderId).catch(() => undefined)

    return {
      categoryId: row.categoryId,
      code: row.code,
      name: row.name,
      sortOrder: row.sortOrder,
      isSystem: row.isSystem
    }
  }

  /**
   * Lists folders the current user can see in the tree.
   * Granted folders keep full rights. Ancestors of a grant appear as a path only
   * (no sibling folders, no files in the ancestor).
   */
  async listFolders(userId: string): Promise<FolderDto[]> {
    await this.ensureSharedCategoryRoots(userId)

    const folders = await this.db.prisma.folder.findMany({
      where: { isDeleted: false },
      orderBy: [{ isCategoryRoot: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }]
    })

    const parentById = new Map(folders.map((f) => [f.folderId, f.parentFolderId]))
    const grantedIds: string[] = []
    const rightsById = new Map<string, FolderRights>()

    for (const folder of folders) {
      const rights = await this.acl.getEffectiveRights(folder.folderId, userId)
      rightsById.set(folder.folderId, rights)
      if (rights.view) grantedIds.push(folder.folderId)
    }

    const grantedIdSet = new Set(grantedIds)
    const traverseIds = traverseAncestorIds(grantedIds, parentById)
    const traverseRights: FolderRights = {
      view: true,
      edit: false,
      copy: false,
      delete: false
    }

    const visible = folders.filter(
      (folder) => grantedIdSet.has(folder.folderId) || traverseIds.has(folder.folderId)
    )
    const visibleSet = new Set(visible.map((f) => f.folderId))

    const childFolderCountById = new Map<string, number>()
    for (const folder of folders) {
      if (!folder.parentFolderId || !visibleSet.has(folder.folderId)) continue
      childFolderCountById.set(
        folder.parentFolderId,
        (childFolderCountById.get(folder.parentFolderId) ?? 0) + 1
      )
    }

    const fileFolderIds = visible
      .filter((folder) => grantedIdSet.has(folder.folderId))
      .map((folder) => folder.folderId)
    const fileGroups = fileFolderIds.length
      ? await this.db.prisma.file.groupBy({
          by: ['folderId'],
          where: { isDeleted: false, folderId: { in: fileFolderIds } },
          _count: { _all: true }
        })
      : []
    const fileCountById = new Map(
      fileGroups.map((row) => [row.folderId ?? '', row._count._all])
    )

    return visible.map((folder) => {
      const traverseOnly = !grantedIdSet.has(folder.folderId)
      return toFolderDto(
        folder,
        traverseOnly ? traverseRights : (rightsById.get(folder.folderId) ?? EMPTY_RIGHTS),
        traverseOnly,
        childFolderCountById.get(folder.folderId) ?? 0,
        fileCountById.get(folder.folderId) ?? 0
      )
    })
  }

  async createSubfolder(userId: string, name: string, parentFolderId: string): Promise<FolderDto> {
    await this.acl.require(parentFolderId, 'edit', userId)

    const trimmed = name.trim()
    if (!trimmed || trimmed.length > 255) {
      throw new Error('Folder name must be between 1 and 255 characters.')
    }

    const parent = await this.db.prisma.folder.findFirst({
      where: { folderId: parentFolderId, isDeleted: false }
    })
    if (!parent) {
      throw new Error('Parent folder not found.')
    }
    if (!parent.categoryId) {
      throw new Error('Subfolders must be created under a file category.')
    }

    const duplicate = await this.db.prisma.folder.findFirst({
      where: {
        parentFolderId,
        name: trimmed,
        isDeleted: false
      }
    })
    if (duplicate) {
      throw new Error('A folder with that name already exists here.')
    }

    const maxSort = await this.db.prisma.folder.aggregate({
      _max: { sortOrder: true },
      where: { parentFolderId, isDeleted: false }
    })

    const folder = await this.db.prisma.folder.create({
      data: {
        userId,
        categoryId: parent.categoryId,
        parentFolderId,
        name: trimmed,
        isCategoryRoot: false,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 10
      }
    })

    const rights = await this.acl.getEffectiveRights(folder.folderId, userId)
    await ensureVaultFolderDirForId(folder.folderId).catch(() => undefined)
    return toFolderDto(folder, rights, false, 0, 0)
  }

  async deleteFolder(userId: string, folderId: string): Promise<FolderDto> {
    await this.acl.require(folderId, 'delete', userId)

    const folder = await this.db.prisma.folder.findFirst({
      where: { folderId, isDeleted: false }
    })
    if (!folder) {
      throw new Error('Folder not found.')
    }
    if (folder.isCategoryRoot) {
      throw new Error('Category folders cannot be deleted.')
    }

    const childCount = await this.db.prisma.folder.count({
      where: { parentFolderId: folderId, isDeleted: false }
    })
    if (childCount > 0) {
      throw new Error('Folder is not empty. Delete or move subfolders first.')
    }

    const fileCount = await this.db.prisma.file.count({
      where: { folderId, isDeleted: false }
    })
    if (fileCount > 0) {
      throw new Error('Folder is not empty. Delete or move files first.')
    }

    const record = await this.db.prisma.folder.update({
      where: { folderId: folder.folderId },
      data: { isDeleted: true }
    })

    await removeVaultFolderDirIfEmpty(folder.folderId).catch(() => undefined)

    return toFolderDto(record, EMPTY_RIGHTS, false, 0, 0)
  }

  async getCategoryRootFolderId(userId: string, categoryId: string): Promise<string> {
    await this.ensureSharedCategoryRoots(userId)

    const root = await this.db.prisma.folder.findFirst({
      where: {
        categoryId,
        isCategoryRoot: true,
        isDeleted: false
      },
      orderBy: { createdAt: 'asc' }
    })
    if (!root) {
      throw new Error('Category folder not found.')
    }

    await this.acl.require(root.folderId, 'view', userId)
    return root.folderId
  }

  /**
   * Ensures one shared category root per FileCategory (not per-user).
   * Creator recorded on userId; access via FolderAcls.
   */
  private async ensureSharedCategoryRoots(userId: string): Promise<void> {
    await this.ensureDefaultDepartmentCategories()

    const categories = await this.db.prisma.fileCategory.findMany({
      orderBy: { sortOrder: 'asc' }
    })

    for (const category of categories) {
      let root = await this.db.prisma.folder.findFirst({
        where: {
          categoryId: category.categoryId,
          isCategoryRoot: true,
          isDeleted: false
        },
        orderBy: { createdAt: 'asc' }
      })

      if (!root) {
        root = await this.db.prisma.folder.create({
          data: {
            userId,
            categoryId: category.categoryId,
            parentFolderId: null,
            name: category.name,
            isCategoryRoot: true,
            sortOrder: category.sortOrder
          }
        })

        await this.db.prisma.folderAcl.upsert({
          where: {
            folderId_principalType_principalId: {
              folderId: root.folderId,
              principalType: 'USER',
              principalId: userId
            }
          },
          create: {
            folderId: root.folderId,
            principalType: 'USER',
            principalId: userId,
            canView: true,
            canEdit: true,
            canCopy: true,
            canDelete: true,
            inherit: true,
            grantedBy: userId
          },
          update: {
            canView: true,
            canEdit: true,
            canCopy: true,
            canDelete: true,
            inherit: true
          }
        })
        this.acl.invalidateUser(userId)
      } else if (root.sortOrder !== category.sortOrder) {
        await this.db.prisma.folder.update({
          where: { folderId: root.folderId },
          data: { sortOrder: category.sortOrder }
        })
      }
    }

    await this.ensureDefaultDepartmentSubfolders()
  }

  /** Creates missing department categories. Existing names are never overwritten. */
  private async ensureDefaultDepartmentCategories(): Promise<void> {
    for (const dept of DEFAULT_VAULT_FOLDER_TREE) {
      const existing = await this.db.prisma.fileCategory.findUnique({
        where: { code: dept.code }
      })
      if (existing) continue
      await this.db.prisma.fileCategory.create({
        data: {
          code: dept.code,
          name: dept.name,
          sortOrder: dept.sortOrder,
          isSystem: true
        }
      })
    }
  }

  /**
   * Ensures the standard subfolders under each department root.
   * Matches aliases (case-insensitive), renames to the canonical name,
   * creates missing rows, and always applies sortOrder.
   */
  private async ensureDefaultDepartmentSubfolders(): Promise<void> {
    for (const dept of DEFAULT_VAULT_FOLDER_TREE) {
      const category = await this.db.prisma.fileCategory.findUnique({
        where: { code: dept.code }
      })
      if (!category) continue

      const root = await this.db.prisma.folder.findFirst({
        where: {
          categoryId: category.categoryId,
          isCategoryRoot: true,
          isDeleted: false
        },
        orderBy: { createdAt: 'asc' }
      })
      if (!root) continue
      await ensureVaultFolderDirForId(root.folderId).catch(() => undefined)

      const children = await this.db.prisma.folder.findMany({
        where: {
          parentFolderId: root.folderId,
          isDeleted: false
        },
        select: { folderId: true, name: true, sortOrder: true }
      })

      for (const spec of dept.children) {
        const names = new Set(
          [spec.name, ...(spec.aliases ?? [])].map((n) => n.toLowerCase())
        )
        const canonical = children.find((c) => c.name.toLowerCase() === spec.name.toLowerCase())
        const aliasMatch = children.find((c) => names.has(c.name.toLowerCase()))
        const match = canonical ?? aliasMatch

        if (match) {
          if (match.name !== spec.name || match.sortOrder !== spec.sortOrder) {
            await this.db.prisma.folder.update({
              where: { folderId: match.folderId },
              data: { name: spec.name, sortOrder: spec.sortOrder }
            })
            match.name = spec.name
            match.sortOrder = spec.sortOrder
          }
          continue
        }

        const created = await this.db.prisma.folder.create({
          data: {
            userId: root.userId,
            categoryId: category.categoryId,
            parentFolderId: root.folderId,
            name: spec.name,
            isCategoryRoot: false,
            sortOrder: spec.sortOrder
          }
        })
        children.push({
          folderId: created.folderId,
          name: created.name,
          sortOrder: created.sortOrder
        })
        await ensureVaultFolderDirForId(created.folderId).catch(() => undefined)
      }
    }
  }
}

function toFolderDto(
  folder: {
    folderId: string
    parentFolderId: string | null
    categoryId: string | null
    name: string
    isCategoryRoot: boolean
    createdAt: Date
    sortOrder: number
  },
  rights: FolderRights,
  traverseOnly: boolean,
  childFolderCount: number,
  fileCount: number
): FolderDto {
  return {
    folderId: folder.folderId,
    parentFolderId: folder.parentFolderId,
    categoryId: folder.categoryId,
    name: folder.name,
    isCategoryRoot: folder.isCategoryRoot,
    createdAt: folder.createdAt.toISOString(),
    sortOrder: folder.sortOrder,
    childFolderCount,
    fileCount,
    rights: {
      view: rights.view,
      edit: rights.edit,
      copy: rights.copy,
      delete: rights.delete
    },
    traverseOnly
  }
}

export default FolderService
