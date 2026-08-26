import type { FolderDto } from '@securevault/domain'

export function folderPathLabel(folder: FolderDto, byId: Map<string, FolderDto>): string {
  const parts: string[] = []
  let cur: FolderDto | undefined = folder
  const seen = new Set<string>()
  while (cur && !seen.has(cur.folderId)) {
    seen.add(cur.folderId)
    parts.unshift(cur.name)
    cur = cur.parentFolderId ? byId.get(cur.parentFolderId) : undefined
  }
  return parts.join(' / ')
}
