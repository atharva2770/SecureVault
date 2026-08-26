import { describe, expect, it } from 'vitest'

import { PasswordPolicyError } from '@securevault/core'

import { HttpError, toPublicError } from './httpErrors'

describe('toPublicError', () => {
  it('keeps generic credential failures', () => {
    const mapped = toPublicError(new Error('Invalid username or password.'))
    expect(mapped.statusCode).toBe(400)
    expect(mapped.clientMessage).toBe('Invalid username or password.')
  })

  it('hides prisma / stack detail behind a generic 500', () => {
    const mapped = toPublicError(
      new Error('Invalid `prisma.file.findMany()` invocation in C:\\Users\\win\\app.ts')
    )
    expect(mapped.statusCode).toBe(500)
    expect(mapped.clientMessage).toBe('Something went wrong.')
    expect(mapped.detail).toContain('prisma')
  })

  it('exposes password-policy messages', () => {
    const mapped = toPublicError(new PasswordPolicyError('Password must be at least 10 characters.'))
    expect(mapped.statusCode).toBe(400)
    expect(mapped.clientMessage).toBe('Password must be at least 10 characters.')
  })

  it('maps access denied to 403 without extra detail', () => {
    const mapped = toPublicError(new Error('Access denied. Admin privileges required.'))
    expect(mapped.statusCode).toBe(403)
    expect(mapped.clientMessage).toBe('Access denied. Admin privileges required.')
  })

  it('does not echo HttpError 500 messages', () => {
    const mapped = toPublicError(new HttpError(500, 'ENOENT: no such file C:\\secrets'))
    expect(mapped.clientMessage).toBe('Something went wrong.')
  })

  it('does not echo a non-allowlisted 400 that contains a path', () => {
    const mapped = toPublicError(new HttpError(400, 'Failed at C:\\vault\\blobs\\file.enc'))
    expect(mapped.clientMessage).toBe('Invalid request.')
    expect(mapped.clientMessage).not.toMatch(/C:\\/)
  })

  it('maps oversized uploads to a generic 413', () => {
    const mapped = toPublicError(new Error('Request too large.'))
    expect(mapped.statusCode).toBe(413)
    expect(mapped.clientMessage).toBe('Request too large.')
  })
})
