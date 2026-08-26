import { describe, expect, it } from 'vitest'

import { escapeLikePattern } from './likeEscape'

describe('escapeLikePattern', () => {
  it('escapes SQL LIKE metacharacters', () => {
    expect(escapeLikePattern('100%_off[x]')).toBe('100[%][_]off[[]x[]]')
  })

  it('leaves ordinary search text unchanged', () => {
    expect(escapeLikePattern('invoice 2024')).toBe('invoice 2024')
  })
})
