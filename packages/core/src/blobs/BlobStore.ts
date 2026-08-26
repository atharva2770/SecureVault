import type { Readable } from 'node:stream'

/**
 * Ciphertext object store. Phase 3 ships a local-disk adapter.
 * Azure Blob / S3 can implement the same methods without changing VaultFileService.
 */
export interface BlobStore {
  readonly adapter: string

  objectKey(userId: string, fileId: string, folderRelPath?: string): string
  toUri(key: string): string
  parseUri(uri: string): string | null

  /**
   * Allocates a destination path for streaming ciphertext.
   * Local adapter returns an absolute file path; cloud adapters may use a staging file.
   */
  prepareWrite(key: string): Promise<string>

  createReadStream(key: string): Promise<Readable>

  /** Absolute path for local streaming decrypt. Cloud adapters stage to a temp file. */
  resolveReadPath(key: string): Promise<string>

  copy(fromKey: string, toKey: string): Promise<void>
  remove(key: string): Promise<void>
}
