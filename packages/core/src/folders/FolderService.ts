import type { FileCategoryDto, FolderDto, FolderRights } from '@securevault/domain'
import { DEFAULT_VAULT_FOLDER_TREE, EMPTY_RIGHTS, traverseAncestorIds } from '@securevault/domain'
import { AccessControlService } from '../access/AccessControlService'
import { DBService } from '@securevault/db'

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
        isCategoryRoot: true
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
      orderBy: [{ isCategoryRoot: 'desc' }, { name: 'asc' }]
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

    const result: FolderDto[] = []
    for (const folder of folders) {
      if (grantedIdSet.has(folder.folderId)) {
        result.push(toFolderDto(folder, rightsById.get(folder.folderId) ?? EMPTY_RIGHTS, false))
      } else if (traverseIds.has(folder.folderId)) {
        result.push(toFolderDto(folder, traverseRights, true))
      }
    }
    return result
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

    const folder = await this.db.prisma.folder.create({
      data: {
        userId,
        categoryId: parent.categoryId,
        parentFolderId,
        name: trimmed,
        isCategoryRoot: false
      }
    })

    const rights = await this.acl.getEffectiveRights(folder.folderId, userId)
    return toFolderDto(folder, rights, false)
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

    return toFolderDto(record, EMPTY_RIGHTS, false)
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
            isCategoryRoot: true
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
      } else if (root.name !== category.name) {
        await this.db.prisma.folder.update({
          where: { folderId: root.folderId },
          data: { name: category.name }
        })
      }
    }

    await this.ensureDefaultDepartmentSubfolders()
  }

  /** Upserts HR, Engg, QA, and Accounts categories used as main vault folders. */
  private async ensureDefaultDepartmentCategories(): Promise<void> {
    for (const dept of DEFAULT_VAULT_FOLDER_TREE) {
      const existing = await this.db.prisma.fileCategory.findUnique({
        where: { code: dept.code }
      })
      if (!existing) {
        await this.db.prisma.fileCategory.create({
          data: {
            code: dept.code,
            name: dept.name,
            sortOrder: dept.sortOrder,
            isSystem: true
          }
        })
        continue
      }
      if (existing.name !== dept.name) {
        await this.db.prisma.fileCategory.update({
          where: { categoryId: existing.categoryId },
          data: { name: dept.name }
        })
      }
    }
  }

  /** Creates the standard subfolders under each department root if they are missing. */
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

      const children = await this.db.prisma.folder.findMany({
        where: {
          parentFolderId: root.folderId,
          isDeleted: false
        },
        select: { name: true }
      })
      const existingNames = new Set(children.map((child) => child.name.toLowerCase()))

      for (const childName of dept.children) {
        if (existingNames.has(childName.toLowerCase())) continue
        await this.db.prisma.folder.create({
          data: {
            userId: root.userId,
            categoryId: category.categoryId,
            parentFolderId: root.folderId,
            name: childName,
            isCategoryRoot: false
          }
        })
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
  },
  rights: FolderRights,
  traverseOnly: boolean
): FolderDto {
  return {
    folderId: folder.folderId,
    parentFolderId: folder.parentFolderId,
    categoryId: folder.categoryId,
    name: folder.name,
    isCategoryRoot: folder.isCategoryRoot,
    createdAt: folder.createdAt.toISOString(),
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
