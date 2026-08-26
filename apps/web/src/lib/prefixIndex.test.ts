import { describe, expect, it } from 'vitest'

import { PrefixIndex } from './prefixIndex'

describe('PrefixIndex', () => {
  const files = [
    { id: '1', name: 'Spec.pdf' },
    { id: '2', name: 'Specification.docx' },
    { id: '3', name: 'invoice-2024.pdf' },
    { id: '4', name: 'alpha.txt' }
  ]
  const index = new PrefixIndex(files, (f) => f.name)

  it('returns the matching run without scanning later names', () => {
    expect(index.prefix('spec').map((f) => f.id)).toEqual(['1', '2'])
    expect(index.prefix('SPEC').map((f) => f.id)).toEqual(['1', '2'])
  })

  it('is empty when nothing shares the prefix', () => {
    expect(index.prefix('zzz')).toEqual([])
  })

  it('returns every item for a blank prefix', () => {
    expect(index.prefix('').map((f) => f.id).sort()).toEqual(['1', '2', '3', '4'])
  })
})
