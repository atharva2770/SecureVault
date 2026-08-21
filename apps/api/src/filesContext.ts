import { LocalBlobStore, LocalKmsProvider, VaultFileService } from '@securevault/core'

import { apiConfig } from './config'

let files: VaultFileService | null = null

export function getVaultFileService(): VaultFileService {
  if (files) return files
  const kms = LocalKmsProvider.fromHex(apiConfig.kmsWrapKeyHex)
  const blobs = new LocalBlobStore(apiConfig.blobRoot)
  files = new VaultFileService(blobs, kms)
  return files
}
