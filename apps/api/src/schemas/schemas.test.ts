import { describe, expect, it } from 'vitest'

import { loginBodySchema } from './auth'
import { createUserBodySchema, listAuditLogsQuerySchema } from './admin'
import { listFilesQuerySchema, searchQuerySchema, folderSearchQuerySchema, uploadFieldsSchema } from './files'
import { createFolderBodySchema } from './folders'

describe('request schemas', () => {
  it('rejects unknown keys on login', () => {
    const result = loginBodySchema.safeParse({
      username: 'alice',
      password: 'secret-secret',
      extra: true
    })
    expect(result.success).toBe(false)
  })

  it('rejects an oversized login password', () => {
    const result = loginBodySchema.safeParse({
      username: 'alice',
      password: 'x'.repeat(5000)
    })
    expect(result.success).toBe(false)
  })

  it('rejects a non-uuid folder id', () => {
    const result = createFolderBodySchema.safeParse({
      name: 'Invoices',
      parentFolderId: '../etc/passwd'
    })
    expect(result.success).toBe(false)
  })

  it('rejects a non-uuid file list filter', () => {
    const result = listFilesQuerySchema.safeParse({ folderId: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })

  it('rejects upload fields that are not uuids', () => {
    const result = uploadFieldsSchema.safeParse({
      displayName: 'doc.pdf',
      categoryId: 'abc',
      folderId: '../../tmp'
    })
    expect(result.success).toBe(false)
  })

  it('accepts a well-formed create-user body', () => {
    const result = createUserBodySchema.safeParse({
      username: 'bob',
      password: 'correct-horse',
      roleCode: 'member'
    })
    expect(result.success).toBe(true)
  })

  it('rejects an oversized search query', () => {
    const result = searchQuerySchema.safeParse({ q: 'x'.repeat(201) })
    expect(result.success).toBe(false)
  })

  it('requires a uuid folderId on folder-scoped search', () => {
    expect(folderSearchQuerySchema.safeParse({ q: 'spec' }).success).toBe(false)
    expect(
      folderSearchQuerySchema.safeParse({ folderId: 'not-a-uuid', q: 'spec' }).success
    ).toBe(false)
    expect(
      folderSearchQuerySchema.safeParse({
        folderId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        q: 'spec',
        includeSubfolders: 'true',
        limit: '25'
      }).success
    ).toBe(true)
  })

  it('rejects a non-uuid audit-log user filter', () => {
    const result = listAuditLogsQuerySchema.safeParse({ userId: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })

  it('accepts cursor pagination on the audit-log list', () => {
    const result = listAuditLogsQuerySchema.safeParse({
      cursor: '42',
      limit: '25',
      action: 'VIEW'
    })
    expect(result.success).toBe(true)
  })
})
