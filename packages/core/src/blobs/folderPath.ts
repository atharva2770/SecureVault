/**
 * Maps vault folder names to Windows-safe path segments under the blob root.
 * Ciphertext files use the file UUID — never the original document name.
 */
export function sanitizeFolderSegment(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/^\.+$/, '_')
    .trim()
    .replace(/[. ]+$/g, '')
  return cleaned.slice(0, 120) || 'folder'
}

export type FolderPathRow = {
  folderId: string
  parentFolderId: string | null
  name: string
}

/** `HR/Personnel file` — category root first, then nested names. */
export function folderRelativePath(folders: FolderPathRow[], folderId: string): string {
  const byId = new Map(folders.map((row) => [row.folderId, row]))
  const parts: string[] = []
  const seen = new Set<string>()
  let cur = byId.get(folderId)
  while (cur && !seen.has(cur.folderId)) {
    seen.add(cur.folderId)
    parts.unshift(sanitizeFolderSegment(cur.name))
    cur = cur.parentFolderId ? byId.get(cur.parentFolderId) : undefined
  }
  return parts.join('/')
}
