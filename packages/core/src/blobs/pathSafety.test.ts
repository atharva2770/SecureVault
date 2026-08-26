import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { blobObjectKey } from './blobUri'
import type { BlobStore } from './BlobStore'
import { resolveCiphertextPath, resolveVaultBlobRoot } from './vaultPaths'

function stubStore(readPath: string): BlobStore {
  return {
    adapter: 'local',
    objectKey: () => '',
    toUri: () => '',
    parseUri: (uri) => (uri.startsWith('svblob:') ? 'parsed-key' : null),
    prepareWrite: async () => '',
    createReadStream: async () => {
      throw new Error('unused')
    },
    resolveReadPath: async () => readPath,
    copy: async () => undefined,
    remove: async () => undefined
  }
}

describe('blobObjectKey', () => {
  it('rejects non-uuid ids so they cannot become path segments', () => {
    expect(() => blobObjectKey('../etc', '11111111-1111-4111-8111-111111111111')).toThrow(
      'Invalid userId.'
    )
    expect(() => blobObjectKey('11111111-1111-4111-8111-111111111111', '..\\windows')).toThrow(
      'Invalid fileId.'
    )
  })
})

describe('resolveCiphertextPath', () => {
  const root = resolve('/tmp/securevault-blobs')

  it('rejects a stored absolute path that escapes the blob root', async () => {
    const store = stubStore(resolve(root, 'unused'))
    const escaped = resolve(root, '..', 'passwd')
    await expect(resolveCiphertextPath(escaped, store, root)).rejects.toThrow('Invalid blob path.')
  })

  it('rejects a blob-store key that resolves outside the root', async () => {
    const store = stubStore(resolve(root, '..', 'outside.enc'))
    await expect(resolveCiphertextPath('svblob:local/x/y.enc', store, root)).rejects.toThrow(
      'Invalid blob path.'
    )
  })
})

describe('resolveVaultBlobRoot', () => {
  it('refuses a blob root under the web app', () => {
    expect(() => resolveVaultBlobRoot('apps/web/public/uploads')).toThrow(
      'VAULT_BLOB_ROOT must not be inside the web app directory.'
    )
  })

  it('allows the default data/vault-blobs location', () => {
    expect(resolveVaultBlobRoot('data/vault-blobs')).toMatch(/vault-blobs/)
  })
})
