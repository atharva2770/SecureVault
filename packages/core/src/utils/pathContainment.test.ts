import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { assertPathInsideRoot } from './pathContainment'

describe('assertPathInsideRoot', () => {
  const root = resolve('/tmp/securevault-blobs')

  it('allows a file under the root', () => {
    const inside = resolve(root, 'user-id', 'file-id.enc')
    expect(assertPathInsideRoot(root, inside)).toBe(inside)
  })

  it('rejects parent-directory traversal', () => {
    const outside = resolve(root, '..', 'secret.txt')
    expect(() => assertPathInsideRoot(root, outside)).toThrow('Invalid blob path.')
  })

  it('rejects an absolute path outside the root', () => {
    expect(() => assertPathInsideRoot(root, resolve('/etc/passwd'))).toThrow('Invalid blob path.')
  })
})
