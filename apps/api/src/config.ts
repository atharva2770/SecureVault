import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

import { loadWorkspaceEnv } from '@securevault/db'

loadWorkspaceEnv()

function envInt(name: string, fallback: number): number {
  const raw = Number(process.env[name])
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}

function workspaceRoot(): string {
  const candidates = [
    process.cwd(),
    resolve(process.cwd(), '../..'),
    resolve(process.cwd(), '..')
  ]
  for (const dir of candidates) {
    if (existsSync(resolve(dir, 'packages')) && existsSync(resolve(dir, 'package.json'))) {
      return dir
    }
  }
  return process.cwd()
}

function resolveBlobRoot(): string {
  const raw = process.env.VAULT_BLOB_ROOT?.trim() || 'data/vault-blobs'
  return isAbsolute(raw) ? raw : resolve(workspaceRoot(), raw)
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
  cookieSecure: process.env.API_COOKIE_SECURE === 'true',
  blobRoot: resolveBlobRoot(),
  kmsWrapKeyHex: process.env.VAULT_KMS_WRAP_KEY?.trim() || '',
  maxUploadBytes: envInt('API_MAX_UPLOAD_BYTES', 100 * 1024 * 1024)
}
