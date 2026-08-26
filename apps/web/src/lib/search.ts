import type { VaultSearchResults } from '@securevault/domain'

import { api } from '@/api/vault'

const EMPTY: VaultSearchResults = { modules: [], folders: [], files: [] }

/** Hard cap so a pasted payload cannot become a ReDoS / LIKE bomb. */
export const MAX_SEARCH_QUERY_LENGTH = 200

/** Above this, in-folder filtering leaves the loaded list and hits GET /api/search/folder. */
export { CLIENT_SCOPED_SEARCH_LIMIT } from './prefixIndex'

/** Keep scoped-search pages around so reopening a folder does not refetch. */
export const SCOPED_SEARCH_STALE_MS = 5 * 60_000
export const SCOPED_SEARCH_GC_MS = 30 * 60_000

export const GLOBAL_SEARCH_DEBOUNCE_MS = 250
export const GLOBAL_SEARCH_STALE_MS = 10_000

export function normalizeSearchQuery(term: string): string {
  return term.trim().slice(0, MAX_SEARCH_QUERY_LENGTH)
}

/**
 * Rights-aware global vault search (SQL Server full-text). Folder-scoped
 * prefix search uses GET /api/search/folder instead — they do not share a path.
 */
export async function searchVault(
  term: string,
  signal?: AbortSignal
): Promise<VaultSearchResults> {
  const q = normalizeSearchQuery(term)
  if (q.length < 2) return EMPTY
  return api.search(q, { signal })
}

export function totalResults(results: VaultSearchResults | undefined): number {
  if (!results) return 0
  return results.modules.length + results.folders.length + results.files.length
}

export type { VaultSearchResults }
