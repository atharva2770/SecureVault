import { existsSync } from 'node:fs'
import { access } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

import { assertPathInsideRoot } from '../utils/pathContainment'
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

/** Ciphertext root for the web vault. Must not sit under a directory Vite/the SPA can serve. */
export function resolveVaultBlobRoot(rawOverride?: string): string {
  const raw = (rawOverride ?? process.env.VAULT_BLOB_ROOT)?.trim() || 'data/vault-blobs'
  const resolved = isAbsolute(raw) ? raw : resolve(workspaceRoot(), raw)
  return assertBlobRootNotWebServed(resolved)
}

function assertBlobRootNotWebServed(root: string): string {
  const workspace = workspaceRoot()
  const forbidden = [
    resolve(workspace, 'apps/web'),
    resolve(workspace, 'apps/web/public'),
    resolve(workspace, 'apps/web/dist'),
    resolve(workspace, 'apps/web/out')
  ]
  for (const dir of forbidden) {
    const rel = relative(dir, root)
    const escapes = rel.split(/[/\\]/)[0] === '..' || isAbsolute(rel)
    if (!escapes) {
      throw new Error('VAULT_BLOB_ROOT must not be inside the web app directory.')
    }
  }
  return root
}

/**
 * Locate ciphertext for a Files.StoredBlobPath value.
 * Accepts `svblob:local/...` URIs and leftover absolute paths from older uploads.
 * The resolved path is always constrained to `root` (defaults to VAULT_BLOB_ROOT)
 * so a stored value can never be used as a path-traversal vector.
 */
export async function resolveCiphertextPath(
  storedBlobPath: string,
  blobs: BlobStore,
  root: string = resolveVaultBlobRoot()
): Promise<string> {
  const key = blobs.parseUri(storedBlobPath)
  if (key) {
    const abs = await blobs.resolveReadPath(key)
    return assertPathInsideRoot(root, abs)
  }

  const trimmed = storedBlobPath.trim()
  if (!trimmed) {
    throw new Error('File blob path is missing.')
  }

  const candidate = isAbsolute(trimmed) ? trimmed : resolve(trimmed)
  const contained = assertPathInsideRoot(root, candidate)
  try {
    await access(contained)
    return contained
  } catch {
    throw new Error('Encrypted file data was not found on this machine.')
  }
}
