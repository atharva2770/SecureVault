import { loadWorkspaceEnv } from '@securevault/db'
import { resolveVaultBlobRoot } from '@securevault/core'

loadWorkspaceEnv()

function envInt(name: string, fallback: number): number {
  const raw = Number(process.env[name])
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}

export const apiConfig = {
  port: envInt('API_PORT', 4000),
  host: process.env.API_HOST?.trim() || '127.0.0.1',
  cookieName: process.env.API_COOKIE_NAME?.trim() || 'sv_session',
  cookieSecret:
    process.env.API_COOKIE_SECRET?.trim() ||
    'dev-only-change-me-securevault-cookie-secret',
  idleTimeoutMs: envInt('VAULT_IDLE_TIMEOUT_MS', 15 * 60 * 1000),
  // Absolute session lifetime regardless of activity (default 12h).
  sessionAbsoluteMaxMs: envInt('VAULT_SESSION_MAX_MS', 12 * 60 * 60 * 1000),
  webOrigin: process.env.WEB_ORIGIN?.trim() || 'http://localhost:5173',
  cookieSecure: process.env.API_COOKIE_SECURE === 'true',
  blobRoot: resolveVaultBlobRoot(),
  kmsWrapKeyHex: process.env.VAULT_KMS_WRAP_KEY?.trim() || '',
  maxUploadBytes: envInt('API_MAX_UPLOAD_BYTES', 100 * 1024 * 1024),
  // Opt-in HaveIBeenPwned k-anonymity breach check on password set (fail-open).
  passwordBreachCheck: process.env.PASSWORD_BREACH_CHECK === 'true'
}
