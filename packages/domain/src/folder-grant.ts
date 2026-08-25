import type { FolderGrantDto } from './dto'

export const FULL_FOLDER_GRANT = {
  canView: true,
  canEdit: true,
  canCopy: true,
  canDelete: true,
  inherit: true
} as const

/**
 * Maps UI/API input onto FolderAcls columns.
 * Edit/Copy/Delete require View. No View → no row.
 */
export function normalizeFolderGrant(
  input: Partial<FolderGrantDto> & { folderId: string }
): FolderGrantDto | null {
  const folderId = input.folderId?.trim()
  if (!folderId) return null
  const canView = Boolean(input.canView || input.canEdit || input.canCopy || input.canDelete)
  if (!canView) return null
  return {
    folderId,
    canView: true,
    canEdit: Boolean(input.canEdit),
    canCopy: Boolean(input.canCopy),
    canDelete: Boolean(input.canDelete),
    inherit: input.inherit !== false
  }
}

export function normalizeFolderGrants(
  grants: Array<Partial<FolderGrantDto> & { folderId: string }>
): FolderGrantDto[] {
  const byId = new Map<string, FolderGrantDto>()
  for (const grant of grants) {
    const next = normalizeFolderGrant(grant)
    if (next) byId.set(next.folderId, next)
  }
  return [...byId.values()]
}

export function folderGrantsEqual(a: FolderGrantDto[], b: FolderGrantDto[]): boolean {
  if (a.length !== b.length) return false
  const key = (g: FolderGrantDto): string =>
    `${g.folderId}:${Number(g.canView)}${Number(g.canEdit)}${Number(g.canCopy)}${Number(g.canDelete)}${Number(g.inherit)}`
  const left = [...a].map(key).sort()
  const right = [...b].map(key).sort()
  return left.every((value, i) => value === right[i])
}
