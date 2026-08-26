import { describe, expect, it } from 'vitest'

import { loginBodySchema } from './auth'
import { createUserBodySchema } from './admin'
import { listFilesQuerySchema, uploadFieldsSchema } from './files'
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
})
