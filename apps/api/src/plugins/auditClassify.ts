import { AuditAction, type AuditActionName } from '@securevault/core'

const SKIP_PATHS = new Set([
  '/health',
  '/api/auth/session',
  '/api/auth/touch',
  '/api/auth/logout',
  '/api/sidebar/ensure',
  '/api/admin/audit-logs',
  '/api/admin/my-access'
])

const DOWNLOAD_PATH = /^\/api\/files\/[^/]+\/download$/

export interface AuditRequestShape {
  method: string
  url: string
  params?: unknown
  query?: unknown
  body?: unknown
}

export function pathOf(url: string): string {
  return url.split('?')[0] ?? url
}

function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'string' && raw.trim()) out[key] = raw
  }
  return out
}

/**
 * Maps a completed HTTP request to the audit action the fallback writer should
 * persist when a handler never called recordAudit. Returns null for noise
 * (health, session, the access-log list itself) and for non-success that is
 * not a 403 (failed authz is AUTH_DENY; 4xx/5xx otherwise is not an access).
 */
export function classifyAuditAction(request: AuditRequestShape, status: number): AuditActionName | null {
  const path = pathOf(request.url)
  const method = request.method.toUpperCase()

  if (status === 403) return AuditAction.AUTH_DENY
  if (status < 200 || status >= 400) return null
  if (SKIP_PATHS.has(path)) return null

  if (path === '/api/search' && method === 'GET') return AuditAction.SEARCH
  if (path === '/api/search/folder' && method === 'GET') return AuditAction.SEARCH
  if ((path === '/api/files' || path === '/api/folders' || path === '/api/categories') && method === 'GET') {
    return AuditAction.VIEW
  }

  if (DOWNLOAD_PATH.test(path) && method === 'POST') {
    const intent =
      request.body && typeof request.body === 'object' && 'intent' in request.body
        ? String((request.body as { intent?: unknown }).intent ?? '')
        : ''
    return intent === 'copy' || intent === 'download' ? AuditAction.DOWNLOAD : AuditAction.RETRIEVE
  }

  if (path.startsWith('/api/admin/') && method !== 'GET') return AuditAction.RIGHTS_CHANGE

  return null
}

export function resourceFromRequest(request: AuditRequestShape): {
  fileId?: string
  folderId?: string
  categoryId?: string
  details?: string
} {
  const params = asRecord(request.params)
  const query = asRecord(request.query)
  return {
    fileId: params.fileId,
    folderId: params.folderId ?? query.folderId,
    categoryId: query.categoryId,
    details: pathOf(request.url)
  }
}
