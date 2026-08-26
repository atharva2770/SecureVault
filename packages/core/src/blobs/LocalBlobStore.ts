import { createReadStream } from 'node:fs'
import { copyFile, mkdir, unlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { Readable } from 'node:stream'

import { assertPathInsideRoot } from '../utils/pathContainment'
import type { BlobStore } from './BlobStore'
import {
  LOCAL_BLOB_ADAPTER,
  blobObjectKey,
  folderBlobObjectKey,
  formatBlobUri,
  parseBlobUri
} from './blobUri'

/**
 * Encrypted blobs on local disk. DEKs are wrapped with VAULT_KMS_WRAP_KEY.
 */
export class LocalBlobStore implements BlobStore {
  readonly adapter = LOCAL_BLOB_ADAPTER

  constructor(private readonly rootDir: string) {}

  objectKey(userId: string, fileId: string, folderRelPath?: string): string {
    if (folderRelPath) return folderBlobObjectKey(folderRelPath, fileId)
    return blobObjectKey(userId, fileId)
  }

  toUri(key: string): string {
    return formatBlobUri(this.adapter, key)
  }

  parseUri(uri: string): string | null {
    const parsed = parseBlobUri(uri)
    if (!parsed || parsed.adapter !== this.adapter) return null
    return parsed.key
  }

  async prepareWrite(key: string): Promise<string> {
    const abs = this.resolvePath(key)
    await mkdir(dirname(abs), { recursive: true })
    return abs
  }

  async createReadStream(key: string): Promise<Readable> {
    return createReadStream(this.resolvePath(key))
  }

  async resolveReadPath(key: string): Promise<string> {
    return this.resolvePath(key)
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    const dest = this.resolvePath(toKey)
    await mkdir(dirname(dest), { recursive: true })
    await copyFile(this.resolvePath(fromKey), dest)
  }

  async remove(key: string): Promise<void> {
    await unlink(this.resolvePath(key)).catch(() => undefined)
  }

  private resolvePath(key: string): string {
    const normalized = key.replaceAll('\\', '/').replace(/^\/+/, '')
    if (normalized.includes('..') || normalized.includes('\0')) {
      throw new Error('Invalid blob key.')
    }
    const root = resolve(this.rootDir)
    const abs = resolve(root, ...normalized.split('/'))
    try {
      return assertPathInsideRoot(root, abs)
    } catch {
      throw new Error('Invalid blob key.')
    }
  }
}
