import { describe, expect, it } from 'vitest'

import { splitHighlight } from './highlight'

describe('splitHighlight', () => {
  it('marks a case-insensitive prefix', () => {
    expect(splitHighlight('Spec.pdf', 'sp')).toEqual([
      { text: 'Sp', hit: true },
      { text: 'ec.pdf', hit: false }
    ])
  })

  it('marks every token', () => {
    expect(splitHighlight('Customer Drawings.pdf', 'customer draw')).toEqual([
      { text: 'Customer', hit: true },
      { text: ' ', hit: false },
      { text: 'Draw', hit: true },
      { text: 'ings.pdf', hit: false }
    ])
  })

  it('returns the whole string when there is no query', () => {
    expect(splitHighlight('Spec.pdf', '  ')).toEqual([{ text: 'Spec.pdf', hit: false }])
  })
})
