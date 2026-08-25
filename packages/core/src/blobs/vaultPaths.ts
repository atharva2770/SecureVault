import { existsSync } from 'node:fs'
import { access } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'

import type { BlobStore } from './BlobStore'

function workspaceRoot(): string {
  const candidates = [
    process.cwd(),
    resolve(process.cwd(), '../..'),
    resolve(process.cwd(), '..')
  ]
  for (const dir of candidates) {
    if (existsSync(resolve(dir, 'packages')) && existsSync(resolve(dir, 'package.json'))) {
      return dir
    }
  }
  return process.cwd()
}

/** Ciphertext root for the web vault. */
export function resolveVaultBlobRoot(): string {
  const raw = process.env.VAULT_BLOB_ROOT?.trim() || 'data/vault-blobs'
  return isAbsolute(raw) ? raw : resolve(workspaceRoot(), raw)
}

/**
 * Locate ciphertext for a Files.StoredBlobPath value.
 * Accepts `svblob:local/...` URIs and leftover absolute paths from older uploads.
 */
export async function resolveCiphertextPath(
  storedBlobPath: string,
  blobs: BlobStore
): Promise<string> {
  const key = blobs.parseUri(storedBlobPath)
  if (key) {
    return blobs.resolveReadPath(key)
  }

  const trimmed = storedBlobPath.trim()
  if (!trimmed) {
    throw new Error('File blob path is missing.')
  }

  const candidate = isAbsolute(trimmed) ? trimmed : resolve(trimmed)
  try {
    await access(candidate)
    return candidate
  } catch {
    throw new Error('Encrypted file data was not found on this machine.')
  }
}
