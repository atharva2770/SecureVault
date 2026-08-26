import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  AuditAction,
  AuditService,
  auditAlreadyRecorded,
  bindAuditUser,
  recordAudit,
  runWithAuditContext
} from './AuditService'

describe('recordAudit', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is fire-and-forget, merges ALS, and marks the request recorded', () => {
    const write = vi.spyOn(AuditService.getInstance(), 'write').mockResolvedValue(undefined)

    runWithAuditContext(
      { userId: null, ip: '203.0.113.9', userAgent: 'SecureVaultTest/1.0', recorded: false },
      () => {
        expect(auditAlreadyRecorded()).toBe(false)
        bindAuditUser('user-1')
        recordAudit({ action: AuditAction.VIEW, folderId: 'folder-1' })
        expect(auditAlreadyRecorded()).toBe(true)
      }
    )

    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.VIEW,
        userId: 'user-1',
        folderId: 'folder-1',
        ip: '203.0.113.9',
        userAgent: 'SecureVaultTest/1.0'
      })
    )
    expect(auditAlreadyRecorded()).toBe(false)
  })

  it('still writes when no ALS is present so callers cannot skip logging', () => {
    const write = vi.spyOn(AuditService.getInstance(), 'write').mockResolvedValue(undefined)
    recordAudit({ action: AuditAction.AUTH_DENY, userId: 'user-2', details: 'deny:view' })
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.AUTH_DENY,
        userId: 'user-2',
        details: 'deny:view'
      })
    )
  })
})
