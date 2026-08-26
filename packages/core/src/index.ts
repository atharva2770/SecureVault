export { secureZero, sha256Hex, safeEqualHex } from './utils/secure'
export { assertPathInsideRoot } from './utils/pathContainment'
export { escapeLikePattern } from './utils/likeEscape'

export {
  CryptoService,
  ARGON2_MEMORY_COST_KIB,
  ARGON2_TIME_COST,
  ARGON2_PARALLELISM,
  AES_256_KEY_BYTES,
  GCM_IV_BYTES,
  GCM_AUTH_TAG_BYTES
} from './crypto/CryptoService'
export type { Argon2Params, EncryptFileResult, WrappedKey } from './crypto/CryptoService'

export {
  AuditService,
  AuditAction,
  recordAudit,
  bindAuditUser,
  runWithAuditContext,
  enterAuditContext,
  auditAlreadyRecorded
} from './audit/AuditService'
export type {
  AuditActionName,
  WriteAuditInput,
  AuditAlsStore,
  AuditLogListFilter,
  AuditLogListItem,
  AuditLogListResult
} from './audit/AuditService'

export { AccessControlService } from './access/AccessControlService'
export type { MyAccessEntry } from './access/AccessControlService'

export { RbacService } from './rbac/RbacService'
export { FolderService } from './folders/FolderService'
export { AdminService } from './admin/AdminService'
export { FileQueryService } from './files/FileQueryService'
export { VaultFileService } from './files/VaultFileService'
export { toFileDto, guessMime, safeFileName } from './files/fileDto'
export {
  sniffUploadMime,
  inspectUpload,
  limitReadable,
  UnsupportedUploadTypeError,
  UploadTooLargeError
} from './files/sniffUpload'
export { AuthCredentials } from './auth/AuthCredentials'
export type { AuthCredentialResult, VerifiedUser, AuthAuditMeta } from './auth/AuthCredentials'
export {
  enforcePasswordPolicy,
  assertPasswordComplexity,
  breachCount,
  PasswordPolicyError,
  MIN_PASSWORD_LENGTH
} from './auth/PasswordPolicy'
export type { PasswordPolicyOptions } from './auth/PasswordPolicy'

export {
  BLOB_URI_SCHEME,
  LOCAL_BLOB_ADAPTER,
  WEB_FILE_SOURCE,
  formatBlobUri,
  parseBlobUri,
  isWebBlobUri
} from './blobs/blobUri'
export type { BlobStore } from './blobs/BlobStore'
export { LocalBlobStore } from './blobs/LocalBlobStore'
export { resolveVaultBlobRoot, resolveCiphertextPath } from './blobs/vaultPaths'
export { unwrapFileDek } from './crypto/unwrapFileDek'

export type { KeyWrappingProvider } from './kms/KeyWrappingProvider'
export { LocalKmsProvider } from './kms/LocalKmsProvider'
