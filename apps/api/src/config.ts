import { loadWorkspaceEnv } from '@securevault/db'

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
  webOrigin: process.env.WEB_ORIGIN?.trim() || 'http://localhost:5173',
  cookieSecure: process.env.API_COOKIE_SECURE === 'true'
}
