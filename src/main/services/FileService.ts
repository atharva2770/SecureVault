import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, stat, unlink } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { app, dialog, shell } from 'electron'
import { tmpdir } from 'node:os'

import type {
  AddFilePayload,
  CopyFilePayload,
  DownloadFileResult,
  FileDto,
  GetFileResult,
  ListFilesFilter,
  MoveFilePayload
} from '../../shared/ipc'
import { VaultSession } from '../session/VaultSession'
import { secureZero } from '../utils/secure'
import { AccessControlService } from './AccessControlService'
import { AuditAction, AuditService } from './AuditService'
import { CryptoService } from './CryptoService'
import { DBService } from './DBService'
import { FolderService } from './FolderService'

const MIME_BY_EXT: Record<string, string> = {
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.zip': 'application/zip',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}

/**
 * Encrypted file lifecycle with per-file access passwords and category placement.
 *
 * Layers:
 * 1. Vault KEK (session) wraps the DEK for at-rest ciphertext in userData.
 * 2. Per-file Argon2id password hash gates view/open/download.
 * 3. Download saves the decrypted original file (same extension as uploaded).
 */
export class FileService {
  private static instance: FileService | null = null

  private readonly db = DBService.getInstance()
  private readonly crypto = CryptoService.getInstance()
  private readonly session = VaultSession.getInstance()
  private readonly audit = AuditService.getInstance()
  private readonly folders = FolderService.getInstance()
  private readonly acl = AccessControlService.getInstance()

  private constructor() {}

  static getInstance(): FileService {
    if (!FileService.instance) {
      FileService.instance = new FileService()
    }
    return FileService.instance
  }

  /**
   * Encrypts a source file into the vault.
   * Password policy (v1): access password === trimmed displayName.
   */
  async addFile(payload: AddFilePayload): Promise<FileDto> {
    const userId = this.session.requireUserId()
    const kek = this.session.requireKek()

    const sourcePath = payload.sourcePath?.trim()
    const displayName = payload.displayName?.trim()
    const categoryId = payload.categoryId?.trim()

    if (!sourcePath) throw new Error('sourcePath is required.')
    if (!displayName) throw new Error('File name is required.')
    if (displayName.length > 500) throw new Error('File name is too long.')
    if (!categoryId) throw new Error('File type (category) is required.')

    const sourceStats = await stat(sourcePath)
    if (!sourceStats.isFile()) {
      throw new Error('sourcePath must be a regular file.')
    }

    const category = await this.db.prisma.fileCategory.findUnique({
      where: { categoryId }
    })
    if (!category) {
      throw new Error('Invalid file type.')
    }

    let folderId = payload.folderId ?? null
    if (folderId) {
      const folder = await this.db.prisma.folder.findFirst({
        where: { folderId, categoryId, isDeleted: false }
      })
      if (!folder) {
        throw new Error('Folder not found for this file type.')
      }
      await this.acl.require(folderId, 'edit', userId)
    } else {
      folderId = await this.folders.getCategoryRootFolderId(categoryId)
      await this.acl.require(folderId, 'edit', userId)
    }

    const fileId = randomUUID()
    const originalFileName = basename(sourcePath)
    const mimeType = guessMime(originalFileName)
    const blobPath = await this.resolveBlobPath(userId, fileId)
    const accessPasswordHash = await this.crypto.hashAccessPassword(displayName)

    let dek: Buffer | null = null
    let blobWritten = false

    try {
      dek = this.crypto.generateDEK()
      const encrypted = await this.crypto.encryptFile(sourcePath, dek, blobPath)
      blobWritten = true

      const wrappedDEK = this.crypto.wrapKey(dek, kek)
      secureZero(dek)
      dek = null

      const record = await this.db.prisma.file.create({
        data: {
          fileId,
          userId,
          folderId,
          categoryId,
          displayName,
          originalFileName,
          storedBlobPath: encrypted.encPath,
          mimeType,
          sizeBytes: BigInt(sourceStats.size),
          checksum: encrypted.checksum,
          wrappedDEK: new Uint8Array(wrappedDEK),
          iv: new Uint8Array(encrypted.iv),
          authTag: new Uint8Array(encrypted.authTag),
          accessPasswordHash,
          source: 'upload',
          version: 1
        },
        include: { category: true }
      })

      await this.audit.write({
        action: AuditAction.FILE_ADD,
        userId,
        fileId: record.fileId,
        details: `${displayName} [${category.name}]`
      })

      return toFileDto(record)
    } catch (error) {
      if (blobWritten) {
        await unlink(blobPath).catch(() => undefined)
      }
      throw error
    } finally {
      secureZero(dek)
    }
  }

  /**
   * Views/opens a file after password check (OS default app via shell).
   */
  async openFile(fileId: string, password: string): Promise<GetFileResult> {
    await this.acl.requireFile(fileId, 'view')
    const result = await this.decryptWithPassword(fileId, password)
    const openError = await shell.openPath(result.tempPath)
    if (openError) {
      await unlink(result.tempPath).catch(() => undefined)
      throw new Error(openError || 'Could not open file for viewing.')
    }
    return result
  }

  /**
   * Decrypts to temp after password check (does not auto-open).
   */
  async getFile(fileId: string, password: string): Promise<GetFileResult> {
    await this.acl.requireFile(fileId, 'view')
    return this.decryptWithPassword(fileId, password)
  }

  /**
   * Decrypts and saves the original file (keeps uploaded extension, e.g. .pdf).
   */
  async downloadFile(fileId: string, password: string): Promise<DownloadFileResult> {
    const userId = this.session.requireUserId()
    await this.acl.requireFile(fileId, 'copy', userId)
    const record = await this.requireAccessibleFile(fileId)
    await this.assertFilePassword(record.accessPasswordHash, password)

    const decrypted = await this.decryptWithPassword(fileId, password)

    const originalExt = extname(record.originalFileName).replace(/^\./, '').toLowerCase()
    const baseName = safeFileName(
      basename(record.displayName, extname(record.displayName)) || record.displayName
    )
    const defaultName = originalExt ? `${baseName}.${originalExt}` : baseName

    const filters = originalExt
      ? [
          {
            name: originalExt.toUpperCase(),
            extensions: [originalExt]
          },
          { name: 'All files', extensions: ['*'] }
        ]
      : [{ name: 'All files', extensions: ['*'] }]

    const save = await dialog.showSaveDialog({
      title: 'Save original file',
      defaultPath: join(app.getPath('downloads'), defaultName),
      filters
    })

    if (save.canceled || !save.filePath) {
      await unlink(decrypted.tempPath).catch(() => undefined)
      throw new Error('Download cancelled.')
    }

    let outPath = save.filePath
    if (originalExt && extname(outPath).toLowerCase() !== `.${originalExt}`) {
      outPath = `${outPath}.${originalExt}`
    }

    try {
      await copyFile(decrypted.tempPath, outPath)

      await this.audit.write({
        action: AuditAction.FILE_OPEN,
        userId,
        fileId: record.fileId,
        details: `download:${outPath}`
      })

      return { fileId: record.fileId, savedPath: outPath, format: 'original' }
    } finally {
      await unlink(decrypted.tempPath).catch(() => undefined)
    }
  }

  async listFiles(filter: ListFilesFilter = {}): Promise<FileDto[]> {
    const userId = this.session.requireUserId()

    if (filter.folderId) {
      await this.acl.require(filter.folderId, 'view', userId)
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
      result.push(toFileDto(file))
    }
    return result
  }

  async deleteFile(fileId: string): Promise<FileDto> {
    const userId = this.session.requireUserId()
    await this.acl.requireFile(fileId, 'delete', userId)

    const existing = await this.requireAccessibleFile(fileId)

    const record = await this.db.prisma.file.update({
      where: { fileId: existing.fileId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        updatedAt: new Date()
      },
      include: { category: true }
    })

    await this.audit.write({
      action: AuditAction.FILE_DELETE,
      userId,
      fileId: record.fileId,
      details: record.displayName
    })

    return toFileDto(record)
  }

  /**
   * Moves a file into another folder within the same category (Explorer / Drive style).
   */
  async moveFile(payload: MoveFilePayload): Promise<FileDto> {
    const userId = this.session.requireUserId()
    const fileId = payload.fileId?.trim()
    const targetFolderId = payload.targetFolderId?.trim()

    if (!fileId) throw new Error('fileId is required.')
    if (!targetFolderId) throw new Error('Target folder is required.')

    const existing = await this.requireAccessibleFile(fileId)
    if (!existing.folderId) {
      throw new Error('File has no folder; cannot move.')
    }
    if (!existing.categoryId) {
      throw new Error('File has no category; cannot move.')
    }

    await this.acl.require(existing.folderId, 'delete', userId)
    await this.acl.require(targetFolderId, 'edit', userId)

    const target = await this.db.prisma.folder.findFirst({
      where: {
        folderId: targetFolderId,
        isDeleted: false,
        categoryId: existing.categoryId
      }
    })
    if (!target) {
      throw new Error('Destination folder not found in this category.')
    }

    if (existing.folderId === target.folderId) {
      return toFileDto(existing)
    }

    const record = await this.db.prisma.file.update({
      where: { fileId: existing.fileId },
      data: {
        folderId: target.folderId,
        categoryId: target.categoryId,
        updatedAt: new Date()
      },
      include: { category: true }
    })

    await this.audit.write({
      action: AuditAction.FILE_OPEN,
      userId,
      fileId: record.fileId,
      details: `move:${target.name}`
    })

    return toFileDto(record)
  }

  /**
   * Duplicates an encrypted vault file into another folder (same category).
   * Copies ciphertext + crypto metadata — no plaintext re-wrap needed.
   */
  async copyFile(payload: CopyFilePayload): Promise<FileDto> {
    const userId = this.session.requireUserId()
    const fileId = payload.fileId?.trim()
    const targetFolderId = payload.targetFolderId?.trim()

    if (!fileId) throw new Error('fileId is required.')
    if (!targetFolderId) throw new Error('Target folder is required.')

    const existing = await this.requireAccessibleFile(fileId)
    if (!existing.folderId) {
      throw new Error('File has no folder; cannot copy.')
    }
    if (!existing.categoryId) {
      throw new Error('File has no category; cannot copy.')
    }

    await this.acl.require(existing.folderId, 'copy', userId)
    await this.acl.require(targetFolderId, 'edit', userId)

    const target = await this.db.prisma.folder.findFirst({
      where: {
        folderId: targetFolderId,
        isDeleted: false,
        categoryId: existing.categoryId
      }
    })
    if (!target) {
      throw new Error('Destination folder not found in this category.')
    }

    const newFileId = randomUUID()
    const blobPath = await this.resolveBlobPath(userId, newFileId)
    let blobWritten = false

    try {
      await copyFile(existing.storedBlobPath, blobPath)
      blobWritten = true

      const displayName = await this.uniqueCopyName(
        userId,
        target.folderId,
        existing.displayName
      )

      const record = await this.db.prisma.file.create({
        data: {
          fileId: newFileId,
          userId,
          folderId: target.folderId,
          categoryId: target.categoryId,
          displayName,
          originalFileName: existing.originalFileName,
          storedBlobPath: blobPath,
          mimeType: existing.mimeType,
          sizeBytes: existing.sizeBytes,
          checksum: existing.checksum,
          wrappedDEK: existing.wrappedDEK,
          iv: existing.iv,
          authTag: existing.authTag,
          accessPasswordHash: existing.accessPasswordHash,
          source: 'copy',
          version: 1
        },
        include: { category: true }
      })

      await this.audit.write({
        action: AuditAction.FILE_ADD,
        userId,
        fileId: record.fileId,
        details: `copy:${existing.displayName}->${target.name}`
      })

      return toFileDto(record)
    } catch (error) {
      if (blobWritten) {
        await unlink(blobPath).catch(() => undefined)
      }
      throw error
    }
  }

  private async uniqueCopyName(
    _userId: string,
    folderId: string,
    baseName: string
  ): Promise<string> {
    const existing = await this.db.prisma.file.findMany({
      where: { folderId, isDeleted: false },
      select: { displayName: true }
    })
    const names = new Set(existing.map((f) => f.displayName.toLowerCase()))
    if (!names.has(baseName.toLowerCase())) return baseName

    for (let i = 1; i < 1000; i++) {
      const candidate = `${baseName} (${i})`
      if (!names.has(candidate.toLowerCase())) return candidate
    }
    return `${baseName} (${randomUUID().slice(0, 8)})`
  }

  private async decryptWithPassword(
    fileId: string,
    password: string
  ): Promise<GetFileResult> {
    const userId = this.session.requireUserId()
    const kek = this.session.requireKek()
    const record = await this.requireAccessibleFile(fileId)
    await this.assertFilePassword(record.accessPasswordHash, password)

    let dek: Buffer | null = null
    try {
      dek = this.crypto.unwrapKey(Buffer.from(record.wrappedDEK), kek)

      const tempDir = join(tmpdir(), 'securevault-decrypt', userId)
      await mkdir(tempDir, { recursive: true })
      const ext = extname(record.originalFileName) || ''
      const tempPath = join(
        tempDir,
        `${record.fileId}-${safeFileName(record.displayName)}${ext}`
      )

      const decryptedPath = await this.crypto.decryptFile(
        record.storedBlobPath,
        dek,
        Buffer.from(record.iv),
        Buffer.from(record.authTag),
        record.checksum,
        tempPath
      )

      await this.audit.write({
        action: AuditAction.FILE_OPEN,
        userId,
        fileId: record.fileId,
        details: record.displayName
      })

      return {
        fileId: record.fileId,
        displayName: record.displayName,
        originalFileName: record.originalFileName,
        mimeType: record.mimeType,
        checksum: record.checksum,
        tempPath: decryptedPath
      }
    } finally {
      secureZero(dek)
    }
  }

  /** Loads a non-deleted file (authorization must be checked by caller / requireFile). */
  private async requireAccessibleFile(fileId: string) {
    const record = await this.db.prisma.file.findFirst({
      where: { fileId, isDeleted: false },
      include: { category: true }
    })
    if (!record) {
      throw new Error('File not found.')
    }
    return record
  }

  private async assertFilePassword(
    accessPasswordHash: string,
    password: string
  ): Promise<void> {
    const ok = await this.crypto.verifyAccessPassword(password, accessPasswordHash)
    if (!ok) {
      throw new Error('Incorrect file password.')
    }
  }

  private async resolveBlobPath(userId: string, fileId: string): Promise<string> {
    const root = join(app.getPath('userData'), 'vault-blobs', userId)
    await mkdir(root, { recursive: true })
    return join(root, `${fileId}.enc`)
  }
}

function toFileDto(record: {
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
    fileId: record.fileId,
    folderId: record.folderId,
    categoryId: record.categoryId,
    displayName: record.displayName,
    originalFileName: record.originalFileName,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes.toString(),
    checksum: record.checksum,
    source: record.source,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    categoryName: record.category?.name ?? null
  }
}

function guessMime(fileName: string): string | null {
  const ext = extname(fileName).toLowerCase()
  return MIME_BY_EXT[ext] ?? null
}

function safeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 180) || 'file'
}

export default FileService
