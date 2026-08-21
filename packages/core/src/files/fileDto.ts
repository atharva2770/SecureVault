import { extname } from 'node:path'

import type { FileDto } from '@securevault/domain'

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

export function toFileDto(record: {
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

export function guessMime(fileName: string): string | null {
  const ext = extname(fileName).toLowerCase()
  return MIME_BY_EXT[ext] ?? null
}

export function safeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 180) || 'file'
}
