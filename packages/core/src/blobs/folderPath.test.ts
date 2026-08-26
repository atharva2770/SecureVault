import { describe, expect, it } from 'vitest'

import { folderRelativePath, sanitizeFolderSegment } from './folderPath'

describe('sanitizeFolderSegment', () => {
  it('strips Windows-illegal characters', () => {
    expect(sanitizeFolderSegment('Gauge / Poka')).toBe('Gauge _ Poka')
    expect(sanitizeFolderSegment('a:b*c?')).toBe('a_b_c_')
  })

  it('does not allow empty or dot-only names', () => {
    expect(sanitizeFolderSegment('...')).toBe('_')
    expect(sanitizeFolderSegment('   ')).toBe('folder')
  })
})

describe('folderRelativePath', () => {
  it('builds category / nested path from parent links', () => {
    const folders = [
      { folderId: 'root', parentFolderId: null, name: 'HR' },
      { folderId: 'child', parentFolderId: 'root', name: 'Personnel file' }
    ]
    expect(folderRelativePath(folders, 'child')).toBe('HR/Personnel file')
    expect(folderRelativePath(folders, 'root')).toBe('HR')
  })
})
