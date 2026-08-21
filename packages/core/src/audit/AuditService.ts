import { hostname } from 'node:os'

import { DBService } from '@securevault/db'

/**
 * Canonical audit actions written to the single `AuditLogs` table.
 * Do NOT shard into per-month tables — keep one table and rely on indexes.
 *
 * Index recommendation (already expressed in schema.prisma):
 *   CREATE NONCLUSTERED INDEX IX_AuditLogs_Timestamp_UserId
 *     ON dbo.AuditLogs ([Timestamp], [UserId]);
 * Prefer (Timestamp, UserId) for time-range + user filters over ad-hoc scans.
 */
export const AuditAction = {
  LOGIN: 'LOGIN',
  UNLOCK: 'UNLOCK',
  FILE_ADD: 'FILE_ADD',
  FILE_OPEN: 'FILE_OPEN',
  FILE_DELETE: 'FILE_DELETE',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  ACL_DENY: 'ACL_DENY',
  ACL_GRANT: 'ACL_GRANT'
} as const

export type AuditActionName = (typeof AuditAction)[keyof typeof AuditAction]

export interface WriteAuditInput {
  action: AuditActionName
  userId?: string | null
  fileId?: string | null
  details?: string | null
  ipOrDevice?: string | null
}

/**
 * Append-only audit writer targeting the single AuditLogs table.
 */
export class AuditService {
  private static instance: AuditService | null = null

  private readonly db = DBService.getInstance()
  private readonly deviceLabel = hostname()

  private constructor() {}

  static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService()
    }
    return AuditService.instance
  }

  /**
   * Inserts one row into AuditLogs. Failures are logged to console and swallowed
   * so audit issues never block primary vault operations.
   */
  async write(input: WriteAuditInput): Promise<void> {
    try {
      await this.db.prisma.auditLog.create({
        data: {
          action: input.action,
          userId: input.userId ?? null,
          fileId: input.fileId ?? null,
          details: input.details ?? null,
          ipOrDevice: input.ipOrDevice ?? this.deviceLabel
        }
      })
    } catch (error) {
      console.error('[AuditService] failed to write audit log', input.action, error)
    }
  }
}

export default AuditService
