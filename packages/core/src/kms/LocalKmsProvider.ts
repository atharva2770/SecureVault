import { AES_256_KEY_BYTES, CryptoService } from '../crypto/CryptoService'
import type { KeyWrappingProvider } from './KeyWrappingProvider'

/**
 * Local stand-in for a cloud KMS: one 32-byte wrapping key from env.
 * DEKs are wrapped with AES-256-GCM (same wire format as desktop wrapKey).
 */
export class LocalKmsProvider implements KeyWrappingProvider {
  readonly kind = 'local-kms'

  private readonly wrappingKey: Buffer
  private readonly crypto = CryptoService.getInstance()

  constructor(wrappingKey: Buffer) {
    if (!Buffer.isBuffer(wrappingKey) || wrappingKey.length !== AES_256_KEY_BYTES) {
      throw new Error(`VAULT_KMS_WRAP_KEY must decode to ${AES_256_KEY_BYTES} bytes.`)
    }
    this.wrappingKey = wrappingKey
  }

  static fromHex(hex: string): LocalKmsProvider {
    const normalized = hex.trim().replace(/^["']|["']$/g, '')
    if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
      throw new Error('VAULT_KMS_WRAP_KEY must be 64 hex characters (32 bytes).')
    }
    return new LocalKmsProvider(Buffer.from(normalized, 'hex'))
  }

  wrapDek(dek: Buffer): Buffer {
    return this.crypto.wrapKey(dek, this.wrappingKey)
  }

  unwrapDek(wrappedDek: Buffer): Buffer {
    return this.crypto.unwrapKey(Buffer.from(wrappedDek), this.wrappingKey)
  }
}
