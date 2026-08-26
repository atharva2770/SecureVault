import type { FileDto, FileSearchPageDto, ListFilesFilter, VaultSearchResults } from '@securevault/domain'
import { DBService, Prisma } from '@securevault/db'

import { AccessControlService } from '../access/AccessControlService'
import { AuditAction, recordAudit } from '../audit/AuditService'
import { FolderService } from '../folders/FolderService'
import { escapeLikePattern } from '../utils/likeEscape'
import {
  decodeNameCursor,
  encodeNameCursor,
  parseOffsetCursor,
  toContainsQuery
} from './searchCursors'

/**
 * JSON file listing (no blob encrypt/decrypt) for the web API.
 */
export class FileQueryService {
  private static instance: FileQueryService | null = null

  private readonly db = DBService.getInstance()
  private readonly acl = AccessControlService.getInstance()
  private readonly folders = FolderService.getInstance()

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

  /**
   * Folder-scoped search. Requires folderId. Never scans the whole Files table.
   *
   * Query plan (expected):
   *   Index Seek on IX_Files_FolderId_DisplayName
   *     Seek Keys: FolderId = @folderId, DisplayName >= @prefix
   *     Predicate: DisplayName LIKE @prefix + '%'  (trailing wildcard only)
   *   Nested loop / IN-list seek when includeSubfolders expands to child FolderIds.
   *   Module scope adds CategoryId to the seek on IX_Files_CategoryId_FolderId_DisplayName.
   *   SET STATISTICS XML ON — look for Seek, not Clustered Index Scan on PK__Files.
   *   Do NOT use LIKE '%term%' here; that cannot seek this B-tree.
   */
  async searchInFolder(
    userId: string,
    input: {
      folderId: string
      q: string
      includeSubfolders?: boolean
      cursor?: string
      limit?: number
    }
  ): Promise<FileSearchPageDto> {
    const folderId = input.folderId.trim()
    const prefix = input.q.trim().slice(0, 200)
    if (!folderId) throw new Error('folderId is required.')
    if (prefix.length < 2) return { items: [], total: 0, nextCursor: null }

    const rights = await this.acl.getEffectiveRights(folderId, userId)
    if (!rights.view) {
      await this.acl.require(folderId, 'view', userId)
    }

    const folder = await this.db.prisma.folder.findFirst({
      where: { folderId, isDeleted: false },
      select: { folderId: true, categoryId: true }
    })
    if (!folder) throw new Error('Folder not found.')

    const scopeIds = await this.resolveFolderScope(userId, folderId, Boolean(input.includeSubfolders))
    if (!scopeIds.length) return { items: [], total: 0, nextCursor: null }

    const take = Math.min(Math.max(input.limit ?? 25, 1), 100)
    const likePrefix = escapeLikePattern(prefix)
    const cursor = input.cursor ? decodeNameCursor(input.cursor) : null

    recordAudit({
      action: AuditAction.SEARCH,
      userId,
      folderId,
      categoryId: folder.categoryId,
      details: `scoped:${prefix}`
    })

    const where = {
      isDeleted: false,
      folderId: { in: scopeIds },
      ...(folder.categoryId && input.includeSubfolders ? { categoryId: folder.categoryId } : {}),
      displayName: { startsWith: likePrefix },
      ...(cursor
        ? {
            OR: [
              { displayName: { gt: cursor.displayName } },
              { displayName: cursor.displayName, fileId: { gt: cursor.fileId } }
            ]
          }
        : {})
    }

    const [total, rows] = await Promise.all([
      this.db.prisma.file.count({
        where: {
          isDeleted: false,
          folderId: { in: scopeIds },
          ...(folder.categoryId && input.includeSubfolders ? { categoryId: folder.categoryId } : {}),
          displayName: { startsWith: likePrefix }
        }
      }),
      this.db.prisma.file.findMany({
        where,
        include: { category: true },
        orderBy: [{ displayName: 'asc' }, { fileId: 'asc' }],
        take: take + 1
      })
    ])

    const page = rows.slice(0, take)
    const last = page[page.length - 1]
    return {
      items: page.map((file) => this.toSearchFileDto(file)),
      total,
      nextCursor:
        rows.length > take && last ? encodeNameCursor(last.displayName, last.fileId) : null
    }
  }

  /**
   * Global vault search via SQL Server full-text (CONTAINSTABLE).
   *
   * Query plan (expected):
   *   FulltextMatch / Remote Scan on FTC_SecureVault producing RANK
   *   Inner join to Files on FileId = [KEY]
   *   Residual: IsDeleted = 0 AND FolderId IN (@viewable)  — rights applied in SQL
   *   Sort: RANK DESC, UpdatedAt DESC
   *   SET STATISTICS XML ON — FulltextMatch should appear; Clustered Index Scan of
   *   all Files with a LIKE '%term%' predicate is a regression.
   *   FREETEXT/CONTAINS cannot be expressed in Prisma's query API; this uses a
   *   parameterized tagged template (not the Unsafe raw APIs).
   */
  async searchGlobal(
    userId: string,
    input: { q: string; cursor?: string; limit?: number }
  ): Promise<VaultSearchResults> {
    const q = input.q.trim().slice(0, 200)
    const fts = toContainsQuery(q)
    if (!fts || q.length < 2) {
      return { modules: [], folders: [], files: [], fileTotal: 0, nextCursor: null }
    }

    recordAudit({
      action: AuditAction.SEARCH,
      userId,
      details: `global:${q}`
    })

    const take = Math.min(Math.max(input.limit ?? 25, 1), 100)
    const skip = parseOffsetCursor(input.cursor)
    const isAdmin = await this.acl.isAdmin(userId)

    const folderRows = await this.folders.listFolders(userId)
    const viewable = folderRows.filter((f) => f.rights.view && !f.traverseOnly)
    const viewableIds = viewable.map((f) => f.folderId)
    const qLower = q.toLowerCase()
    const matchingFolders = viewable.filter((f) => f.name.toLowerCase().startsWith(qLower))

    if (!isAdmin && viewableIds.length === 0) {
      return {
        modules: matchingFolders.filter((f) => f.isCategoryRoot),
        folders: matchingFolders.filter((f) => !f.isCategoryRoot),
        files: [],
        fileTotal: 0,
        nextCursor: null
      }
    }

    try {
      const { items, total } = await this.runFullTextSearch({
        fts,
        folderIds: isAdmin ? null : viewableIds,
        skip,
        take
      })
      return {
        modules: matchingFolders.filter((f) => f.isCategoryRoot),
        folders: matchingFolders.filter((f) => !f.isCategoryRoot),
        files: items,
        fileTotal: total,
        nextCursor: skip + items.length < total ? String(skip + take) : null
      }
    } catch (error) {
      if (isFtsUnavailable(error)) {
        throw new Error('Search is unavailable.')
      }
      throw error
    }
  }

  /** @deprecated Use searchGlobal. Kept so existing /api/search callers stay stable. */
  async search(userId: string, term: string): Promise<VaultSearchResults> {
    return this.searchGlobal(userId, { q: term })
  }

  private async resolveFolderScope(
    userId: string,
    rootId: string,
    includeSubfolders: boolean
  ): Promise<string[]> {
    if (!includeSubfolders) return [rootId]

    const rows = await this.db.prisma.folder.findMany({
      where: { isDeleted: false },
      select: { folderId: true, parentFolderId: true }
    })
    const children = new Map<string, string[]>()
    for (const row of rows) {
      if (!row.parentFolderId) continue
      const list = children.get(row.parentFolderId) ?? []
      list.push(row.folderId)
      children.set(row.parentFolderId, list)
    }

    const collected = [rootId]
    const stack = [...(children.get(rootId) ?? [])]
    while (stack.length) {
      const id = stack.pop()!
      collected.push(id)
      const kids = children.get(id)
      if (kids) stack.push(...kids)
    }

    if (await this.acl.isAdmin(userId)) return collected

    const allowed: string[] = []
    for (const id of collected) {
      const rights = await this.acl.getEffectiveRights(id, userId)
      if (rights.view) allowed.push(id)
    }
    return allowed
  }

  private async runFullTextSearch(input: {
    fts: string
    folderIds: string[] | null
    skip: number
    take: number
  }): Promise<{ items: FileDto[]; total: number }> {
    const fts = input.fts
    const skip = input.skip
    const take = input.take

    type Hit = {
      fileId: string
      folderId: string | null
      categoryId: string | null
      displayName: string
      originalFileName: string
      mimeType: string | null
      sizeBytes: bigint | number | string
      checksum: string
      source: string
      version: number
      createdAt: Date
      updatedAt: Date
      categoryName: string | null
    }

    const rightsPredicate =
      input.folderIds && input.folderIds.length
        ? Prisma.sql`AND f.[FolderId] IN (${Prisma.join(input.folderIds)})`
        : Prisma.sql``

    // Plan: FulltextMatch on FTC_SecureVault → join Files on KEY → residual
    // IsDeleted + FolderId IN (viewable). SET STATISTICS XML ON: FulltextMatch
    // must appear. Clustered Index Scan + LIKE '%term%' is a regression.
    const totalRows = await this.db.prisma.$queryRaw<Array<{ n: number | bigint }>>`
      SELECT COUNT_BIG(*) AS n
      FROM [dbo].[Files] AS f
      INNER JOIN CONTAINSTABLE([dbo].[Files], ([DisplayName], [OriginalFileName]), ${fts}) AS k
        ON f.[FileId] = k.[KEY]
      WHERE f.[IsDeleted] = 0
        ${rightsPredicate}`

    const rows = await this.db.prisma.$queryRaw<Hit[]>`
      SELECT
        f.[FileId] AS [fileId],
        f.[FolderId] AS [folderId],
        f.[CategoryId] AS [categoryId],
        f.[DisplayName] AS [displayName],
        f.[OriginalFileName] AS [originalFileName],
        f.[MimeType] AS [mimeType],
        f.[SizeBytes] AS [sizeBytes],
        f.[Checksum] AS [checksum],
        f.[Source] AS [source],
        f.[Version] AS [version],
        f.[CreatedAt] AS [createdAt],
        f.[UpdatedAt] AS [updatedAt],
        c.[Name] AS [categoryName]
      FROM [dbo].[Files] AS f
      INNER JOIN CONTAINSTABLE([dbo].[Files], ([DisplayName], [OriginalFileName]), ${fts}) AS k
        ON f.[FileId] = k.[KEY]
      LEFT JOIN [dbo].[FileCategories] AS c ON c.[CategoryId] = f.[CategoryId]
      WHERE f.[IsDeleted] = 0
        ${rightsPredicate}
      ORDER BY k.[RANK] DESC, f.[UpdatedAt] DESC, f.[FileId] ASC
      OFFSET ${skip} ROWS FETCH NEXT ${take} ROWS ONLY`

    const total = Number(totalRows[0]?.n ?? 0)
    return {
      items: rows.map((row) => ({
        fileId: row.fileId,
        folderId: row.folderId,
        categoryId: row.categoryId,
        displayName: row.displayName,
        originalFileName: row.originalFileName,
        mimeType: row.mimeType,
        sizeBytes: String(row.sizeBytes),
        checksum: row.checksum,
        source: row.source,
        version: row.version,
        createdAt: new Date(row.createdAt).toISOString(),
        updatedAt: new Date(row.updatedAt).toISOString(),
        categoryName: row.categoryName
      })),
      total
    }
  }

  private toSearchFileDto(file: {
    fileId: string
    folderId: string | null
    categoryId: string | null
    displayName: string
    originalFileName: string
    mimeType: string | null
    sizeBytes: bigint
    checksum: string
    source: string
    version: number
    createdAt: Date
    updatedAt: Date
    category?: { name: string } | null
  }): FileDto {
    return {
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
    }
  }
}

function isFtsUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /full[- ]?text|fulltext|containstable|0xA960|Fulltext/i.test(message)
}

export default FileQueryService
