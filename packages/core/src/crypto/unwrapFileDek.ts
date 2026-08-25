import { CryptoService } from '../crypto/CryptoService'
import type { KeyWrappingProvider } from '../kms/KeyWrappingProvider'

/**
 * Unwrap a file DEK with the shared vault wrap key, then the signed-in user's KEK
 * (only useful for files that user originally encrypted).
 */
export async function unwrapFileDek(
  wrappedDek: Buffer,
  kms: KeyWrappingProvider,
  kek?: Buffer | null,
  legacyBlob = false
): Promise<Buffer> {
  try {
    return Buffer.from(await kms.unwrapDek(wrappedDek))
  } catch {
    // Not wrapped with VAULT_KMS_WRAP_KEY.
  }

  if (kek && kek.length > 0) {
    try {
      return CryptoService.getInstance().unwrapKey(Buffer.from(wrappedDek), kek)
    } catch {
      // Not wrapped with this user's key.
    }
  }

  if (legacyBlob) {
    throw new Error(
      'This file was encrypted by the old desktop app and cannot be opened in the web vault. Upload it again from the web app.'
    )
  }

  throw new Error(
    'Could not decrypt this file. Confirm VAULT_KMS_WRAP_KEY in .env, then sign out and sign in again.'
  )
}
