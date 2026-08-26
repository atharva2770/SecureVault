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
  csrfCookieName: process.env.API_CSRF_COOKIE_NAME?.trim() || 'sv_csrf',
  cookieSecret:
    process.env.API_COOKIE_SECRET?.trim() ||
    'dev-only-change-me-securevault-cookie-secret',
  idleTimeoutMs: envInt('VAULT_IDLE_TIMEOUT_MS', 15 * 60 * 1000),
  // Absolute session lifetime regardless of activity (default 12h).
  sessionAbsoluteMaxMs: envInt('VAULT_SESSION_MAX_MS', 12 * 60 * 60 * 1000),
  webOrigin: process.env.WEB_ORIGIN?.trim() || 'http://localhost:5173',
  // Strict CORS allowlist (comma-separated). No wildcard in production.
  webOrigins: (process.env.WEB_ORIGIN?.trim() || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  cookieSecure: process.env.API_COOKIE_SECURE === 'true',
  // Enables HSTS + treats the deployment as HTTPS-terminated.
  httpsEnabled: process.env.HTTPS_ENABLED === 'true',
  // Trust X-Forwarded-* from a front proxy so request.ip is the real client.
  trustProxy: process.env.API_TRUST_PROXY === 'true',
  blobRoot: resolveVaultBlobRoot(),
  kmsWrapKeyHex: process.env.VAULT_KMS_WRAP_KEY?.trim() || '',
  /** JSON / non-upload payloads. Multipart uploads use maxUploadBytes per-route. */
  jsonBodyLimitBytes: envInt('API_JSON_BODY_LIMIT', 64 * 1024),
  maxUploadBytes: envInt('API_MAX_UPLOAD_BYTES', 100 * 1024 * 1024),
  // Opt-in HaveIBeenPwned k-anonymity breach check on password set (fail-open).
  passwordBreachCheck: process.env.PASSWORD_BREACH_CHECK === 'true'
}
