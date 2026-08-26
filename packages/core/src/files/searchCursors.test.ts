import { describe, expect, it } from 'vitest'

import { toContainsQuery, encodeNameCursor, decodeNameCursor, parseOffsetCursor } from './searchCursors'

describe('toContainsQuery', () => {
  it('turns a phrase into AND-ed prefix terms', () => {
    expect(toContainsQuery('customer drawings')).toBe('"customer*" AND "drawings*"')
  })

  it('strips FTS operators so they cannot be injected', () => {
    expect(toContainsQuery('foo" OR NEAR bar')).toBe('"foo*" AND "bar*"')
  })

  it('rejects tiny or operator-only input', () => {
    expect(toContainsQuery('a')).toBeNull()
    expect(toContainsQuery('AND OR')).toBeNull()
  })
})

describe('name cursor', () => {
  it('round-trips display name + file id', () => {
    const token = encodeNameCursor('Spec.pdf', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    expect(decodeNameCursor(token)).toEqual({
      displayName: 'Spec.pdf',
      fileId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    })
  })
})

describe('offset cursor', () => {
  it('parses a non-negative integer', () => {
    expect(parseOffsetCursor(undefined)).toBe(0)
    expect(parseOffsetCursor('50')).toBe(50)
    expect(parseOffsetCursor('-1')).toBe(0)
    expect(parseOffsetCursor('nope')).toBe(0)
  })
})
