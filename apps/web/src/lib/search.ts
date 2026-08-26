import type { VaultSearchResults } from '@securevault/domain'

import { api } from '@/api/vault'

const EMPTY: VaultSearchResults = { modules: [], folders: [], files: [] }

/** Hard cap so a pasted payload cannot become a ReDoS / LIKE bomb. */
export const MAX_SEARCH_QUERY_LENGTH = 200

export function normalizeSearchQuery(term: string): string {
  return term.trim().slice(0, MAX_SEARCH_QUERY_LENGTH)
}

/**
 * Rights-aware global vault search (SQL Server full-text). Folder-scoped
 * prefix search uses GET /api/search/folder instead — they do not share a path.
 */
export async function searchVault(term: string): Promise<VaultSearchResults> {
  const q = normalizeSearchQuery(term)
  if (q.length < 2) return EMPTY
  return api.search(q)
}

export function totalResults(results: VaultSearchResults | undefined): number {
  if (!results) return 0
  return results.modules.length + results.folders.length + results.files.length
}

export type { VaultSearchResults }
