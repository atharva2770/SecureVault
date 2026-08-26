import type { FileDto, FolderDto } from '@securevault/domain'

export const STAGED_ID_PREFIX = 'stg:'

export interface StagedFile {
  localId: string
  file: File
  originalName: string
  displayName: string
  folderId: string
  addedAt: string
  status: 'ready' | 'locking' | 'error'
  error?: string
}

export function isStagedId(id: string): boolean {
  return id.startsWith(STAGED_ID_PREFIX)
}

export function newStagedId(): string {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${STAGED_ID_PREFIX}${id}`
}

export function displayNameFromFile(originalName: string): string {
  const base = originalName.replace(/\.[^.]+$/, '')
  return base.trim() || originalName
}

export function uniqueDisplayName(base: string, taken: Set<string>): string {
  const stem = base.trim() || 'file'
  const key = (s: string) => s.trim().toLowerCase()
  if (!taken.has(key(stem))) return stem
  let n = 2
  while (taken.has(key(`${stem} (${n})`))) n += 1
  return `${stem} (${n})`
}

export function namesTakenInFolder(
  folderId: string,
  staged: StagedFile[],
  vaultFiles: FileDto[],
  exceptLocalId?: string
): Set<string> {
  const taken = new Set<string>()
  for (const f of vaultFiles) {
    if (f.folderId === folderId) taken.add(f.displayName.trim().toLowerCase())
  }
  for (const s of staged) {
    if (s.folderId !== folderId) continue
    if (exceptLocalId && s.localId === exceptLocalId) continue
    taken.add(s.displayName.trim().toLowerCase())
  }
  return taken
}

export function stagedToFileDto(item: StagedFile, folder: FolderDto | undefined): FileDto {
  return {
    fileId: item.localId,
    folderId: item.folderId,
    categoryId: folder?.categoryId ?? null,
    displayName: item.displayName,
    originalFileName: item.originalName,
    mimeType: item.file.type || null,
    sizeBytes: String(item.file.size),
    checksum: '',
    source: 'staging',
    version: 0,
    createdAt: item.addedAt,
    updatedAt: item.addedAt,
    categoryName: folder?.name ?? null
  }
}

export function previewLocalFile(file: File): void {
  const url = URL.createObjectURL(file)
  const opened = window.open(url, '_blank', 'noopener,noreferrer')
  if (!opened) {
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.click()
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function downloadLocalFile(file: File, name: string): void {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name || file.name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
