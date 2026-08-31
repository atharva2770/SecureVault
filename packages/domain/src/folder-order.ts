/** Sort folders by persisted order, then name. */
export function compareFoldersByOrder(
  a: { sortOrder?: number; name: string },
  b: { sortOrder?: number; name: string }
): number {
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)
}

/**
 * "12 files · 5 folders". Omits a zero side so a leaf reads "12 files".
 * An empty leaf reads "0 files".
 */
export function formatContentCounts(
  fileCount: number,
  folderCount: number,
  folderNoun = 'folder'
): string {
  const files = `${fileCount} file${fileCount === 1 ? '' : 's'}`
  if (folderCount <= 0) return files
  const folders = `${folderCount} ${folderNoun}${folderCount === 1 ? '' : 's'}`
  return `${files} · ${folders}`
}
