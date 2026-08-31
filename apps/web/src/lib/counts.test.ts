import { describe, expect, it } from 'vitest'
import { compareFoldersByOrder, formatContentCounts } from '@securevault/domain'

describe('formatContentCounts', () => {
  it('omits folders when the count is zero', () => {
    expect(formatContentCounts(12, 0)).toBe('12 files')
    expect(formatContentCounts(1, 0)).toBe('1 file')
  })

  it('joins files and folders', () => {
    expect(formatContentCounts(12, 5, 'sub-folder')).toBe('12 files · 5 sub-folders')
    expect(formatContentCounts(1, 1, 'sub-folder')).toBe('1 file · 1 sub-folder')
  })
})

describe('compareFoldersByOrder', () => {
  it('sorts by sortOrder then name', () => {
    const folders = [
      { name: 'FMEA', sortOrder: 50 },
      { name: 'Customer Drawing', sortOrder: 10 },
      { name: 'Process Sheet', sortOrder: 30 }
    ]
    const names = folders.sort(compareFoldersByOrder).map((f) => f.name)
    expect(names).toEqual(['Customer Drawing', 'Process Sheet', 'FMEA'])
  })
})
