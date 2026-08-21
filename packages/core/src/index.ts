export { secureZero, sha256Hex, safeEqualHex } from './utils/secure'

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

export { AuditService, AuditAction } from './audit/AuditService'
export type { AuditActionName, WriteAuditInput } from './audit/AuditService'

export { AccessControlService } from './access/AccessControlService'
export type { MyAccessEntry } from './access/AccessControlService'

export { RbacService } from './rbac/RbacService'
export { FolderService } from './folders/FolderService'
export { AdminService } from './admin/AdminService'
export { FileQueryService } from './files/FileQueryService'
export { AuthCredentials } from './auth/AuthCredentials'
export type { AuthCredentialResult, VerifiedUser, AuthAuditMeta } from './auth/AuthCredentials'
