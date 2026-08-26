/** Logical URI prefix for web-vault ciphertext objects. */
export const BLOB_URI_SCHEME = 'svblob'

/** Local disk adapter id (swap for `azure` / `s3` later without changing callers). */
export const LOCAL_BLOB_ADAPTER = 'local'

/** Source value stored on Files uploaded through the web API. */
export const WEB_FILE_SOURCE = 'web'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface ParsedBlobUri {
  adapter: string
  key: string
}

/**
 * `svblob:local/{userId}/{fileId}.enc`
 */
export function formatBlobUri(adapter: string, key: string): string {
  return `${BLOB_URI_SCHEME}:${adapter}/${key.replaceAll('\\', '/')}`
}

export function parseBlobUri(uri: string): ParsedBlobUri | null {
  const trimmed = uri.trim()
  const prefix = `${BLOB_URI_SCHEME}:`
  if (!trimmed.startsWith(prefix)) return null
  const rest = trimmed.slice(prefix.length)
  const slash = rest.indexOf('/')
  if (slash <= 0) return null
  const adapter = rest.slice(0, slash)
  const key = rest.slice(slash + 1)
  if (!adapter || !key) return null
  return { adapter, key }
}

export function isWebBlobUri(uri: string | null | undefined): boolean {
  return typeof uri === 'string' && uri.startsWith(`${BLOB_URI_SCHEME}:`)
}

export function assertSafeObjectId(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`Invalid ${label}.`)
  }
}

export function blobObjectKey(userId: string, fileId: string): string {
  assertSafeObjectId(userId, 'userId')
  assertSafeObjectId(fileId, 'fileId')
  return `${userId}/${fileId}.enc`
}

/**
 * Ciphertext lives under the mirrored vault folder, named only by file id.
 * Original document names never appear on disk.
 */
export function folderBlobObjectKey(relativeFolderPath: string, fileId: string): string {
  assertSafeObjectId(fileId, 'fileId')
  const parts = relativeFolderPath
    .replaceAll('\\', '/')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
  if (!parts.length || parts.some((p) => p === '..' || p.includes('\0'))) {
    throw new Error('Invalid blob key.')
  }
  return `${parts.join('/')}/${fileId}.enc`
}
