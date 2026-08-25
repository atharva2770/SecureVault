import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { copyFile, mkdir, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import type { Readable } from 'node:stream'

import type { CopyFilePayload, FileDto, MoveFilePayload, RenameFilePayload } from '@securevault/domain'
import { DBService } from '@securevault/db'

import { AccessControlService } from '../access/AccessControlService'
import { AuditAction, AuditService } from '../audit/AuditService'
import type { BlobStore } from '../blobs/BlobStore'
import { isWebBlobUri, WEB_FILE_SOURCE } from '../blobs/blobUri'
import { resolveCiphertextPath } from '../blobs/vaultPaths'
import { CryptoService } from '../crypto/CryptoService'
import { unwrapFileDek } from '../crypto/unwrapFileDek'
import { FolderService } from '../folders/FolderService'
import type { KeyWrappingProvider } from '../kms/KeyWrappingProvider'
import { secureZero } from '../utils/secure'
import { guessMime, safeFileName, toFileDto } from './fileDto'

export interface VaultUploadInput {
  userId: string
  displayName: string
  categoryId: string
  folderId?: string | null
  originalFileName: string
  mimeType?: string | null
  body: Readable
}

export interface VaultDownloadResult {
  fileId: string
  displayName: string
  originalFileName: string
  mimeType: string | null
  checksum: string
  tempPath: string
}

/**
 * Web-vault file lifecycle: stream encrypt into BlobStore, wrap DEKs with KMS.
 */
export class VaultFileService {
  private readonly db = DBService.getInstance()
  private readonly crypto = CryptoService.getInstance()
  private readonly audit = AuditService.getInstance()
  private readonly folders = FolderService.getInstance()
  private readonly acl = AccessControlService.getInstance()

  constructor(
    private readonly blobs: BlobStore,
    private readonly kms: KeyWrappingProvider
  ) {}

  async addFile(input: VaultUploadInput): Promise<FileDto> {
    const userId = input.userId
    const displayName = input.displayName?.trim()
    const categoryId = input.categoryId?.trim()
    const originalFileName = input.originalFileName?.trim() || 'upload.bin'

    if (!displayName) throw new Error('File name is required.')
    if (displayName.length > 500) throw new Error('File name is too long.')
    if (!categoryId) throw new Error('File type (category) is required.')

    const category = await this.db.prisma.fileCategory.findUnique({
      where: { categoryId }
    })
    if (!category) {
      throw new Error('Invalid file type.')
    }

    let folderId = input.folderId?.trim() || null
    if (folderId) {
      const folder = await this.db.prisma.folder.findFirst({
        where: { folderId, categoryId, isDeleted: false }
      })
      if (!folder) {
        throw new Error('Folder not found for this file type.')
      }
      await this.acl.require(folderId, 'edit', userId)
    } else {
      folderId = await this.folders.getCategoryRootFolderId(userId, categoryId)
      await this.acl.require(folderId, 'edit', userId)
    }

    const fileId = randomUUID()
    const mimeType = input.mimeType?.trim() || guessMime(originalFileName)
    const accessPasswordHash = await this.crypto.hashAccessPassword(displayName)
    const key = this.blobs.objectKey(userId, fileId)
    const destPath = await this.blobs.prepareWrite(key)
    const uri = this.blobs.toUri(key)

    let dek: Buffer | null = null
    let blobWritten = false

    try {
      dek = this.crypto.generateDEK()
      const encrypted = await this.crypto.encryptReadable(input.body, dek, destPath)
      blobWritten = true

      const wrappedDEK = Buffer.from(await this.kms.wrapDek(dek))
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
          storedBlobPath: uri,
          mimeType,
          sizeBytes: BigInt(encrypted.plaintextBytes),
          checksum: encrypted.checksum,
          wrappedDEK: new Uint8Array(wrappedDEK),
          iv: new Uint8Array(encrypted.iv),
          authTag: new Uint8Array(encrypted.authTag),
          accessPasswordHash,
          source: WEB_FILE_SOURCE,
          version: 1
        },
        include: { category: true }
      })

      await this.audit.write({
        action: AuditAction.FILE_ADD,
        userId,
        fileId: record.fileId,
        details: `web:${displayName} [${category.name}]`
      })

      return toFileDto(record)
    } catch (error) {
      if (blobWritten) {
        await this.blobs.remove(key).catch(() => undefined)
      }
      throw error
    } finally {
      secureZero(dek)
    }
  }

  async downloadToTemp(
    userId: string,
    fileId: string,
    password: string,
    options?: { kek?: Buffer | null; intent?: 'view' | 'copy' }
  ): Promise<VaultDownloadResult> {
    const right = options?.intent === 'copy' ? 'copy' : 'view'
    await this.acl.requireFile(fileId, right, userId)
    const record = await this.requireAccessibleFile(fileId)
    await this.assertFilePassword(record.accessPasswordHash, password)

    const encPath = await resolveCiphertextPath(record.storedBlobPath, this.blobs)

    let dek: Buffer | null = null
    const tempDir = join(tmpdir(), 'securevault-web-decrypt', userId)
    await mkdir(tempDir, { recursive: true })
    const ext = extname(record.originalFileName) || ''
    const tempPath = join(
      tempDir,
      `${record.fileId}-${safeFileName(record.displayName)}${ext}`
    )

    try {
      dek = await unwrapFileDek(
        Buffer.from(record.wrappedDEK),
        this.kms,
        options?.kek,
        record.source !== WEB_FILE_SOURCE || !isWebBlobUri(record.storedBlobPath)
      )
      await this.crypto.decryptToWritable(
        encPath,
        dek,
        Buffer.from(record.iv),
        Buffer.from(record.authTag),
        record.checksum,
        createWriteStream(tempPath)
      )

      await this.promoteToSharedStore(record, encPath, dek).catch(() => undefined)

      await this.audit.write({
        action: AuditAction.FILE_OPEN,
        userId,
        fileId: record.fileId,
        details: `web-download:${record.displayName}`
      })

      return {
        fileId: record.fileId,
        displayName: record.displayName,
        originalFileName: record.originalFileName,
        mimeType: record.mimeType,
        checksum: record.checksum,
        tempPath
      }
    } catch (error) {
      await unlink(tempPath).catch(() => undefined)
      throw error
    } finally {
      secureZero(dek)
    }
  }

  async deleteFile(userId: string, fileId: string): Promise<FileDto> {
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
      details: `web:${record.displayName}`
    })

    return toFileDto(record)
  }

  async moveFile(userId: string, payload: MoveFilePayload): Promise<FileDto> {
    const fileId = payload.fileId?.trim()
    const targetFolderId = payload.targetFolderId?.trim()

    if (!fileId) throw new Error('fileId is required.')
    if (!targetFolderId) throw new Error('Target folder is required.')

    const existing = await this.requireAccessibleFile(fileId)
    if (!existing.folderId) throw new Error('File has no folder; cannot move.')
    if (!existing.categoryId) throw new Error('File has no category; cannot move.')

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
      details: `web-move:${target.name}`
    })

    return toFileDto(record)
  }

  async copyFile(userId: string, payload: CopyFilePayload): Promise<FileDto> {
    const fileId = payload.fileId?.trim()
    const targetFolderId = payload.targetFolderId?.trim()

    if (!fileId) throw new Error('fileId is required.')
    if (!targetFolderId) throw new Error('Target folder is required.')

    const existing = await this.requireAccessibleFile(fileId)
    if (!existing.folderId) throw new Error('File has no folder; cannot copy.')
    if (!existing.categoryId) throw new Error('File has no category; cannot copy.')

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

    const fromPath = await resolveCiphertextPath(existing.storedBlobPath, this.blobs)
    const newFileId = randomUUID()
    const toKey = this.blobs.objectKey(userId, newFileId)
    const toPath = await this.blobs.prepareWrite(toKey)
    let blobWritten = false

    try {
      await copyFile(fromPath, toPath)
      blobWritten = true

      const displayName = await this.uniqueCopyName(target.folderId, existing.displayName)

      const record = await this.db.prisma.file.create({
        data: {
          fileId: newFileId,
          userId,
          folderId: target.folderId,
          categoryId: target.categoryId,
          displayName,
          originalFileName: existing.originalFileName,
          storedBlobPath: this.blobs.toUri(toKey),
          mimeType: existing.mimeType,
          sizeBytes: existing.sizeBytes,
          checksum: existing.checksum,
          wrappedDEK: existing.wrappedDEK,
          iv: existing.iv,
          authTag: existing.authTag,
          accessPasswordHash: existing.accessPasswordHash,
          source: WEB_FILE_SOURCE,
          version: 1
        },
        include: { category: true }
      })

      await this.audit.write({
        action: AuditAction.FILE_ADD,
        userId,
        fileId: record.fileId,
        details: `web-copy:${existing.displayName}->${target.name}`
      })

      return toFileDto(record)
    } catch (error) {
      if (blobWritten) {
        await this.blobs.remove(toKey).catch(() => undefined)
      }
      throw error
    }
  }

  async renameFile(userId: string, payload: RenameFilePayload): Promise<FileDto> {
    const fileId = payload.fileId?.trim()
    const displayName = payload.displayName?.trim()

    if (!fileId) throw new Error('fileId is required.')
    if (!displayName) throw new Error('File name is required.')
    if (displayName.length > 500) throw new Error('File name is too long.')

    await this.acl.requireFile(fileId, 'edit', userId)
    const existing = await this.requireAccessibleFile(fileId)

    if (existing.displayName === displayName) {
      return toFileDto(existing)
    }

    if (existing.folderId) {
      const siblings = await this.db.prisma.file.findMany({
        where: {
          folderId: existing.folderId,
          isDeleted: false,
          fileId: { not: existing.fileId }
        },
        select: { displayName: true }
      })
      if (siblings.some((f) => f.displayName.toLowerCase() === displayName.toLowerCase())) {
        throw new Error('A file with that name already exists in this folder.')
      }
    }

    const accessPasswordHash = await this.crypto.hashAccessPassword(displayName)

    const record = await this.db.prisma.file.update({
      where: { fileId: existing.fileId },
      data: {
        displayName,
        accessPasswordHash,
        updatedAt: new Date()
      },
      include: { category: true }
    })

    await this.audit.write({
      action: AuditAction.FILE_OPEN,
      userId,
      fileId: record.fileId,
      details: `web-rename:${existing.displayName}->${displayName}`
    })

    return toFileDto(record)
  }

  private async uniqueCopyName(folderId: string, baseName: string): Promise<string> {
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

  /**
   * If this file is not yet in the shared blob store, copy it in and re-wrap the DEK with KMS.
   */
  private async promoteToSharedStore(
    record: { fileId: string; userId: string; storedBlobPath: string },
    encPath: string,
    dek: Buffer
  ): Promise<void> {
    if (isWebBlobUri(record.storedBlobPath)) return

    const key = this.blobs.objectKey(record.userId, record.fileId)
    const dest = await this.blobs.prepareWrite(key)
    if (dest !== encPath) {
      await copyFile(encPath, dest)
    }

    const wrappedDEK = Buffer.from(await this.kms.wrapDek(dek))
    await this.db.prisma.file.update({
      where: { fileId: record.fileId },
      data: {
        storedBlobPath: this.blobs.toUri(key),
        wrappedDEK: new Uint8Array(wrappedDEK),
        source: WEB_FILE_SOURCE,
        updatedAt: new Date()
      }
    })
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
}
