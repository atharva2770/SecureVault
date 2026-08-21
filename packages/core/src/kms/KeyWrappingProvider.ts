/**
 * Wraps per-file DEKs. Desktop uses the user password KEK; the web API uses this
 * provider so the API never keeps a user KEK in process memory.
 *
 * Local provider: AES-256-GCM with VAULT_KMS_WRAP_KEY.
 * Later: Azure Key Vault / AWS KMS with the same wrapDek / unwrapDek surface.
 */
export interface KeyWrappingProvider {
  readonly kind: string
  wrapDek(dek: Buffer): Buffer | Promise<Buffer>
  unwrapDek(wrappedDek: Buffer): Buffer | Promise<Buffer>
}
