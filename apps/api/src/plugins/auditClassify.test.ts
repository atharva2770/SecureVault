import { describe, expect, it } from 'vitest'

import { AuditAction } from '@securevault/core'

import { classifyAuditAction, resourceFromRequest } from './auditClassify'

describe('classifyAuditAction', () => {
  it('logs VIEW for listing files or folders', () => {
    expect(classifyAuditAction({ method: 'GET', url: '/api/files?folderId=abc' }, 200)).toBe(
      AuditAction.VIEW
    )
    expect(classifyAuditAction({ method: 'GET', url: '/api/folders' }, 200)).toBe(AuditAction.VIEW)
  })

  it('logs SEARCH for the search endpoint', () => {
    expect(classifyAuditAction({ method: 'GET', url: '/api/search?q=invoice' }, 200)).toBe(
      AuditAction.SEARCH
    )
    expect(
      classifyAuditAction(
        { method: 'GET', url: '/api/search/folder?folderId=abc&q=spec' },
        200
      )
    ).toBe(AuditAction.SEARCH)
  })

  it('logs RETRIEVE vs DOWNLOAD from download intent', () => {
    expect(
      classifyAuditAction(
        { method: 'POST', url: '/api/files/f1/download', body: { intent: 'view' } },
        200
      )
    ).toBe(AuditAction.RETRIEVE)
    expect(
      classifyAuditAction(
        { method: 'POST', url: '/api/files/f1/download', body: { intent: 'copy' } },
        200
      )
    ).toBe(AuditAction.DOWNLOAD)
  })

  it('logs RIGHTS_CHANGE for mutating admin routes', () => {
    expect(classifyAuditAction({ method: 'POST', url: '/api/admin/users' }, 201)).toBe(
      AuditAction.RIGHTS_CHANGE
    )
    expect(classifyAuditAction({ method: 'GET', url: '/api/admin/users' }, 200)).toBeNull()
  })

  it('logs AUTH_DENY on 403 even for skipped paths', () => {
    expect(classifyAuditAction({ method: 'GET', url: '/api/admin/audit-logs' }, 403)).toBe(
      AuditAction.AUTH_DENY
    )
  })

  it('does not audit health, session, or the access-log list itself', () => {
    expect(classifyAuditAction({ method: 'GET', url: '/health' }, 200)).toBeNull()
    expect(classifyAuditAction({ method: 'GET', url: '/api/auth/session' }, 200)).toBeNull()
    expect(classifyAuditAction({ method: 'GET', url: '/api/admin/audit-logs' }, 200)).toBeNull()
  })

  it('pulls resource ids from params and query', () => {
    expect(
      resourceFromRequest({
        method: 'GET',
        url: '/api/files?folderId=fold-1&categoryId=cat-1',
        query: { folderId: 'fold-1', categoryId: 'cat-1' }
      })
    ).toEqual({
      fileId: undefined,
      folderId: 'fold-1',
      categoryId: 'cat-1',
      details: '/api/files'
    })
  })
})
