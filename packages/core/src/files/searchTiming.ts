export const SLOW_SEARCH_MS = 200

export type SearchKind = 'scoped' | 'global'

export interface SlowSearchLog {
  kind: SearchKind
  durationMs: number
  userId: string
  folderId?: string
  queryLength: number
  cacheHit: boolean
}

/**
 * Emits a structured perf warning when a search call exceeds {@link SLOW_SEARCH_MS}.
 * Does not include the query string (display names can be sensitive).
 */
export function logSlowSearch(info: SlowSearchLog): void {
  if (info.durationMs < SLOW_SEARCH_MS) return
  console.warn(
    JSON.stringify({
      level: 'perf',
      event: 'slow_search',
      kind: info.kind,
      durationMs: Math.round(info.durationMs),
      userId: info.userId,
      folderId: info.folderId ?? null,
      queryLength: info.queryLength,
      cacheHit: info.cacheHit,
      thresholdMs: SLOW_SEARCH_MS
    })
  )
}
