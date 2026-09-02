import { isIP } from 'node:net'

import { loadWorkspaceEnv } from '@securevault/db'
import { resolveVaultBlobRoot } from '@securevault/core'

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export interface ApiConfig {
  port: number
  host: string
  cookieName: string
  csrfCookieName: string
  cookieSecret: string
  idleTimeoutMs: number
  sessionAbsoluteMaxMs: number
  webOrigin: string
  webOrigins: string[]
  cookieSecure: boolean
  httpsEnabled: boolean
  /**
   * Passed straight to Fastify. Never the boolean `true`: that tells proxy-addr
   * to trust the whole X-Forwarded-For chain, making `request.ip` — and with it
   * the login lockout, the register throttle, the rate limiter and the AuditLogs
   * ip column — attacker-controlled.
   */
  trustProxy: string[] | false
  trustedProxies: string[]
  blobRoot: string
  kmsWrapKeyHex: string
  jsonBodyLimitBytes: number
  maxUploadBytes: number
  passwordBreachCheck: boolean
  /**
   * Whether POST /api/auth/register serves anyone. False by default, and forced
   * false in production unless the operator also sets the _UNSAFE escape hatch.
   * Bootstrap (an empty Users table) is handled in the route, not here.
   */
  allowPublicRegister: boolean
  nodeEnv: string
}

const PLACEHOLDER_SECRETS = new Set([
  'dev-only-change-me-securevault-cookie-secret',
  'change-me',
  'change-me-to-a-long-random-string',
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
])

function read(env: NodeJS.ProcessEnv, name: string): string {
  return env[name]?.trim() ?? ''
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = read(env, name)
  if (!value) {
    throw new ConfigError(`Missing required environment variable: ${name}`)
  }
  if (PLACEHOLDER_SECRETS.has(value) || /^change-me/i.test(value)) {
    throw new ConfigError(`${name} is still set to a placeholder. Generate a real secret.`)
  }
  if (name.startsWith('DATABASE_URL') && /YOUR_PASSWORD|placeholder/i.test(value)) {
    throw new ConfigError(`${name} still contains a placeholder password.`)
  }
  return value
}

/** Named ranges proxy-addr understands in place of a literal address. */
const PROXY_KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal'])

/**
 * Accepts an IPv4/IPv6 literal, a CIDR block, or one of proxy-addr's named
 * ranges. A malformed entry is fatal: silently ignoring it would leave the
 * deployment trusting a header it believes it is filtering.
 */
function parseTrustedProxies(env: NodeJS.ProcessEnv): string[] {
  const raw = read(env, 'API_TRUSTED_PROXIES') || '127.0.0.1,::1'
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  if (!entries.length) {
    throw new ConfigError('API_TRUSTED_PROXIES must list at least one address.')
  }

  for (const entry of entries) {
    if (PROXY_KEYWORDS.has(entry.toLowerCase())) continue

    const slash = entry.indexOf('/')
    const address = slash === -1 ? entry : entry.slice(0, slash)
    const family = isIP(address)
    if (!family) {
      throw new ConfigError(`API_TRUSTED_PROXIES contains an invalid address: ${entry}`)
    }
    if (slash !== -1) {
      const prefix = entry.slice(slash + 1)
      const bits = Number(prefix)
      const max = family === 4 ? 32 : 128
      if (!/^\d{1,3}$/.test(prefix) || !Number.isInteger(bits) || bits < 0 || bits > max) {
        throw new ConfigError(`API_TRUSTED_PROXIES contains an invalid CIDR prefix: ${entry}`)
      }
    }
  }

  return entries
}

function envInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = Number(env[name])
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}

/**
 * Parses and validates API configuration. Throws {@link ConfigError} if a
 * required variable is missing or malformed — callers must not catch this
 * and continue serving traffic.
 */
export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  loadWorkspaceEnv()

  const nodeEnv = read(env, 'NODE_ENV') || 'development'
  const isProd = nodeEnv === 'production'

  const cookieSecret = required(env, 'API_COOKIE_SECRET')
  if (cookieSecret.length < 16) {
    throw new ConfigError('API_COOKIE_SECRET must be at least 16 characters.')
  }

  const kmsWrapKeyHex = required(env, 'VAULT_KMS_WRAP_KEY')
  if (!/^[0-9a-fA-F]{64}$/.test(kmsWrapKeyHex)) {
    throw new ConfigError('VAULT_KMS_WRAP_KEY must be 64 hex characters (32 bytes).')
  }

  const useTrusted = env.USE_TRUSTED_CONNECTION === 'true' || env.USE_TRUSTED_CONNECTION === '1'
  required(env, useTrusted ? 'DATABASE_URL_TRUSTED' : 'DATABASE_URL')

  const webOriginRaw = read(env, 'WEB_ORIGIN')
  if (isProd && !webOriginRaw) {
    throw new ConfigError('WEB_ORIGIN is required when NODE_ENV=production.')
  }
  const webOrigin = webOriginRaw || 'http://localhost:5173'
  const webOrigins = webOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  // Parsed unconditionally so a malformed list is caught at boot even on a
  // deployment that has not yet switched API_TRUST_PROXY on.
  const trustedProxies = parseTrustedProxies(env)
  const trustProxyEnabled = env.API_TRUST_PROXY === 'true'

  // Two independent switches in production: flipping the ordinary flag is not
  // enough, so nobody re-opens registration by copying a development .env.
  const registerRequested = env.ALLOW_PUBLIC_REGISTER === 'true'
  const unsafeOverride = env.ALLOW_PUBLIC_REGISTER_UNSAFE === 'true'
  const allowPublicRegister = isProd ? registerRequested && unsafeOverride : registerRequested

  const cookieSecure = env.API_COOKIE_SECURE === 'true'
  if (isProd && !cookieSecure) {
    throw new ConfigError('API_COOKIE_SECURE=true is required when NODE_ENV=production.')
  }

  return {
    port: envInt(env, 'API_PORT', 4000),
    host: read(env, 'API_HOST') || '127.0.0.1',
    cookieName: read(env, 'API_COOKIE_NAME') || 'sv_session',
    csrfCookieName: read(env, 'API_CSRF_COOKIE_NAME') || 'sv_csrf',
    cookieSecret,
    idleTimeoutMs: envInt(env, 'VAULT_IDLE_TIMEOUT_MS', 15 * 60 * 1000),
    sessionAbsoluteMaxMs: envInt(env, 'VAULT_SESSION_MAX_MS', 12 * 60 * 60 * 1000),
    webOrigin,
    webOrigins,
    cookieSecure,
    httpsEnabled: env.HTTPS_ENABLED === 'true',
    trustProxy: trustProxyEnabled ? trustedProxies : false,
    trustedProxies,
    blobRoot: resolveVaultBlobRoot(env.VAULT_BLOB_ROOT),
    kmsWrapKeyHex,
    jsonBodyLimitBytes: envInt(env, 'API_JSON_BODY_LIMIT', 64 * 1024),
    maxUploadBytes: envInt(env, 'API_MAX_UPLOAD_BYTES', 100 * 1024 * 1024),
    passwordBreachCheck: env.PASSWORD_BREACH_CHECK === 'true',
    allowPublicRegister,
    nodeEnv
  }
}

let cached: ApiConfig | undefined

function cachedConfig(): ApiConfig {
  if (!cached) cached = loadApiConfig()
  return cached
}

/** Live config. First property access validates env and fails fast. */
export const apiConfig: ApiConfig = new Proxy({} as ApiConfig, {
  get(_target, prop) {
    if (typeof prop !== 'string' && typeof prop !== 'symbol') return undefined
    return cachedConfig()[prop as keyof ApiConfig]
  }
})
