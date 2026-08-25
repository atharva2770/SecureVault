import type { FileDto, ListFilesFilter } from '@securevault/domain'
import { DBService } from '@securevault/db'

import { AccessControlService } from '../access/AccessControlService'

/**
 * JSON file listing (no blob encrypt/decrypt) for the web API.
 */
export class FileQueryService {
  private static instance: FileQueryService | null = null

  private readonly db = DBService.getInstance()
  private readonly acl = AccessControlService.getInstance()

  private constructor() {}

  static getInstance(): FileQueryService {
    if (!FileQueryService.instance) {
      FileQueryService.instance = new FileQueryService()
    }
    return FileQueryService.instance
  }

  async listFiles(userId: string, filter: ListFilesFilter = {}): Promise<FileDto[]> {
    if (filter.folderId) {
      const rights = await this.acl.getEffectiveRights(filter.folderId, userId)
      if (!rights.view) {
        const pathOnly = await this.acl.isAncestorOfGrantedFolder(filter.folderId, userId)
        if (pathOnly) return []
        await this.acl.require(filter.folderId, 'view', userId)
      }
    }

    const where: {
      isDeleted: boolean
      folderId?: string | null
      categoryId?: string
    } = {
      isDeleted: false
    }

    if (filter.folderId !== undefined && filter.folderId !== null) {
      where.folderId = filter.folderId
    } else if (filter.categoryId) {
      where.categoryId = filter.categoryId
    }

    const files = await this.db.prisma.file.findMany({
      where,
      include: { category: true },
      orderBy: { createdAt: 'desc' }
    })

    const result: FileDto[] = []
    for (const file of files) {
      if (!file.folderId) continue
      const rights = await this.acl.getEffectiveRights(file.folderId, userId)
      if (!rights.view) continue
      result.push({
        fileId: file.fileId,
        folderId: file.folderId,
        categoryId: file.categoryId,
        displayName: file.displayName,
        originalFileName: file.originalFileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes.toString(),
        checksum: file.checksum,
        source: file.source,
        version: file.version,
        createdAt: file.createdAt.toISOString(),
        updatedAt: file.updatedAt.toISOString(),
        categoryName: file.category?.name ?? null
      })
    }
    return result
  }
}

export default FileQueryService
