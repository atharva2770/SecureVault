import type { FileDto, FolderDto } from '@securevault/domain'

import { api } from '@/api/vault'

export interface VaultSearchResults {
  modules: FolderDto[]
  folders: FolderDto[]
  files: FileDto[]
}

const EMPTY: VaultSearchResults = { modules: [], folders: [], files: [] }

/** Hard cap so a pasted payload cannot become a ReDoS / LIKE bomb if search moves server-side. */
export const MAX_SEARCH_QUERY_LENGTH = 200

export function normalizeSearchQuery(term: string): string {
  return term.trim().slice(0, MAX_SEARCH_QUERY_LENGTH)
}

/**
 * Rights-aware global search.
 *
 * NOTE: There is no dedicated `/api/search` endpoint yet, so this aggregates the
 * data the current user is already allowed to see (sidebar modules/folders +
 * accessible files) and filters client-side. When a server search endpoint
 * lands, swap the body for a single `api.search(term)` call — callers/UI stay
 * unchanged.
 */
export async function searchVault(term: string): Promise<VaultSearchResults> {
  const q = normalizeSearchQuery(term).toLowerCase()
  if (q.length < 2) return EMPTY

  const [sidebar, files] = await Promise.all([api.ensureSidebar(), api.listFiles({})])

  const matchingFolders = sidebar.folders.filter((f) => f.name.toLowerCase().includes(q))

  return {
    modules: matchingFolders.filter((f) => f.isCategoryRoot),
    folders: matchingFolders.filter((f) => !f.isCategoryRoot),
    files: files.filter(
      (f) =>
        f.displayName.toLowerCase().includes(q) ||
        f.originalFileName.toLowerCase().includes(q) ||
        (f.categoryName?.toLowerCase().includes(q) ?? false)
    )
  }
}

export function totalResults(results: VaultSearchResults | undefined): number {
  if (!results) return 0
  return results.modules.length + results.folders.length + results.files.length
}
