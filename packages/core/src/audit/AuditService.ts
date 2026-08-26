import { AsyncLocalStorage } from 'node:async_hooks'

import { DBService } from '@securevault/db'

/**
 * Canonical audit actions written to the single `AuditLogs` table.
 * Do NOT shard into per-month tables — keep one table and rely on indexes.
 */
export const AuditAction = {
  LOGIN: 'LOGIN',
  UNLOCK: 'UNLOCK',
  FILE_ADD: 'FILE_ADD',
  FILE_OPEN: 'FILE_OPEN',
  FILE_DELETE: 'FILE_DELETE',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  ACL_DENY: 'ACL_DENY',
  ACL_GRANT: 'ACL_GRANT',
  VIEW: 'VIEW',
  SEARCH: 'SEARCH',
  RETRIEVE: 'RETRIEVE',
  DOWNLOAD: 'DOWNLOAD',
  RIGHTS_CHANGE: 'RIGHTS_CHANGE',
  AUTH_DENY: 'AUTH_DENY'
} as const

export type AuditActionName = (typeof AuditAction)[keyof typeof AuditAction]

export interface WriteAuditInput {
  action: AuditActionName
  userId?: string | null
  fileId?: string | null
  folderId?: string | null
  categoryId?: string | null
  details?: string | null
  ip?: string | null
  userAgent?: string | null
  /** @deprecated Combined IP+UA; filled automatically when ip/userAgent are set. */
  ipOrDevice?: string | null
}

export interface AuditAlsStore {
  userId: string | null
  ip: string | null
  userAgent: string | null
  /** True after recordAudit ran for this request — the HTTP fallback will not double-write. */
  recorded: boolean
}

const auditAls = new AsyncLocalStorage<AuditAlsStore>()

export function runWithAuditContext(store: AuditAlsStore, next: () => void): void {
  auditAls.run(store, next)
}

/**
 * Binds the current async resource to an audit store. Fastify request hooks
 * should use this so ALS survives `done()` returning (unlike `run(store, done)`).
 * Every request must call this again so a previous request cannot leak.
 */
export function enterAuditContext(store: AuditAlsStore): void {
  auditAls.enterWith(store)
}

export function bindAuditUser(userId: string | null | undefined): void {
  const store = auditAls.getStore()
  if (store && userId) store.userId = userId
}

export function auditAlreadyRecorded(): boolean {
  return Boolean(auditAls.getStore()?.recorded)
}

function clip(value: string | null | undefined, max: number): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

/**
 * The only application-layer write into AuditLogs.
 * Merges request ALS (user, IP, UA), never throws to the caller, and does not
 * await the INSERT so the primary request is never blocked.
 */
export function recordAudit(input: WriteAuditInput): void {
  const store = auditAls.getStore()
  if (store) store.recorded = true
  void AuditService.getInstance().write({
    ...input,
    userId: input.userId ?? store?.userId ?? null,
    ip: input.ip ?? store?.ip ?? null,
    userAgent: input.userAgent ?? store?.userAgent ?? null
  })
}

export interface AuditLogListFilter {
  userId?: string
  categoryId?: string
  action?: string
  from?: Date
  to?: Date
  cursor?: string
  limit?: number
}

export interface AuditLogListItem {
  logId: string
  userId: string | null
  username: string | null
  action: string
  fileId: string | null
  fileName: string | null
  folderId: string | null
  categoryId: string | null
  moduleName: string | null
  details: string | null
  ip: string | null
  userAgent: string | null
  timestamp: string
}

export interface AuditLogListResult {
  items: AuditLogListItem[]
  nextCursor: string | null
}

/**
 * Append-only audit writer targeting the single AuditLogs table.
 */
export class AuditService {
  private static instance: AuditService | null = null

  private readonly db = DBService.getInstance()

  private constructor() {}

  static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService()
    }
    return AuditService.instance
  }

  /**
   * Inserts one row into AuditLogs. Failures are logged and swallowed so audit
   * issues never block primary vault operations. Prefer {@link recordAudit}.
   */
  async write(input: WriteAuditInput): Promise<void> {
    try {
      const ip = clip(input.ip, 64)
      const userAgent = clip(input.userAgent, 300)
      const combined =
        clip(input.ipOrDevice, 200) ??
        clip([ip, userAgent].filter(Boolean).join(' '), 200)

      await this.db.prisma.auditLog.create({
        data: {
          action: input.action,
          userId: input.userId ?? null,
          fileId: input.fileId ?? null,
          folderId: input.folderId ?? null,
          categoryId: input.categoryId ?? null,
          details: clip(input.details, 4000),
          ipOrDevice: combined,
          ip,
          userAgent
        }
      })
    } catch (error) {
      console.error('[AuditService] failed to write audit log', input.action, error)
    }
  }

  async list(filter: AuditLogListFilter = {}): Promise<AuditLogListResult> {
    const take = Math.min(Math.max(filter.limit ?? 25, 1), 100)
    const where: {
      userId?: string
      categoryId?: string
      action?: string | { in: string[] }
      timestamp?: { gte?: Date; lte?: Date }
    } = {}

    if (filter.userId) where.userId = filter.userId
    if (filter.categoryId) where.categoryId = filter.categoryId
    if (filter.action) {
      if (filter.action === 'AUTH_DENY') {
        where.action = { in: ['AUTH_DENY', 'ACL_DENY'] }
      } else if (filter.action === 'RIGHTS_CHANGE') {
        where.action = { in: ['RIGHTS_CHANGE', 'ACL_GRANT'] }
      } else if (filter.action === 'RETRIEVE') {
        where.action = { in: ['RETRIEVE', 'FILE_OPEN'] }
      } else {
        where.action = filter.action
      }
    }
    if (filter.from || filter.to) {
      where.timestamp = {}
      if (filter.from) where.timestamp.gte = filter.from
      if (filter.to) where.timestamp.lte = filter.to
    }

    const cursorId = filter.cursor && /^\d+$/.test(filter.cursor) ? BigInt(filter.cursor) : null

    const rows = await this.db.prisma.auditLog.findMany({
      where,
      orderBy: [{ timestamp: 'desc' }, { logId: 'desc' }],
      take: take + 1,
      ...(cursorId
        ? {
            cursor: { logId: cursorId },
            skip: 1
          }
        : {}),
      include: {
        file: { select: { displayName: true, categoryId: true } }
      }
    })

    const page = rows.slice(0, take)
    const userIds = [...new Set(page.map((r) => r.userId).filter(Boolean))] as string[]
    const categoryIds = [
      ...new Set(
        page
          .map((r) => r.categoryId ?? r.file?.categoryId ?? null)
          .filter((id): id is string => Boolean(id))
      )
    ]

    const [users, categories] = await Promise.all([
      userIds.length
        ? this.db.prisma.user.findMany({
            where: { userId: { in: userIds } },
            select: { userId: true, username: true }
          })
        : Promise.resolve([]),
      categoryIds.length
        ? this.db.prisma.fileCategory.findMany({
            where: { categoryId: { in: categoryIds } },
            select: { categoryId: true, name: true }
          })
        : Promise.resolve([])
    ])

    const userMap = new Map(users.map((u) => [u.userId, u.username]))
    const catMap = new Map(categories.map((c) => [c.categoryId, c.name]))

    return {
      items: page.map((row) => {
        const categoryId = row.categoryId ?? row.file?.categoryId ?? null
        return {
          logId: row.logId.toString(),
          userId: row.userId,
          username: row.userId ? (userMap.get(row.userId) ?? null) : null,
          action: row.action,
          fileId: row.fileId,
          fileName: row.file?.displayName ?? null,
          folderId: row.folderId,
          categoryId,
          moduleName: categoryId ? (catMap.get(categoryId) ?? null) : null,
          details: row.details,
          ip: row.ip ?? parseIp(row.ipOrDevice),
          userAgent: row.userAgent ?? parseUa(row.ipOrDevice),
          timestamp: row.timestamp.toISOString()
        }
      }),
      nextCursor: rows.length > take ? page[page.length - 1]?.logId.toString() ?? null : null
    }
  }
}

function parseIp(combined: string | null): string | null {
  if (!combined) return null
  const first = combined.split(' ')[0]
  return first || null
}

function parseUa(combined: string | null): string | null {
  if (!combined) return null
  const idx = combined.indexOf(' ')
  if (idx < 0) return null
  return combined.slice(idx + 1) || null
}

export default AuditService
