import type { FileSearchPageDto, VaultSearchResults } from '@securevault/domain'

/** Short TTL: enough to absorb repeat keystrokes, stale enough to drop quickly after writes. */
export const SEARCH_CACHE_TTL_MS = 45_000
export const SEARCH_CACHE_MAX_ENTRIES = 512

export interface ScopedSearchCacheKey {
  userId: string
  folderId: string
  query: string
  includeSubfolders: boolean
  cursor?: string
  limit: number
}

export interface GlobalSearchCacheKey {
  userId: string
  query: string
  cursor?: string
  limit: number
}

interface CacheEntry<T> {
  value: T
  expiresAt: number
  userId: string
}

/**
 * Process-local LRU for rights-filtered search pages.
 *
 * Keys always include userId. Results must never be reused across users.
 * Redis is not in this stack — this cache is in-memory only. A multi-instance
 * deployment needs Redis (or similar) so invalidation is visible to every API process.
 */
export class SearchCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>()
  private readonly keysByUser = new Map<string, Set<string>>()
  private readonly ttlMs: number
  private readonly maxEntries: number
  private readonly now: () => number

  constructor(opts?: { ttlMs?: number; maxEntries?: number; now?: () => number }) {
    this.ttlMs = opts?.ttlMs ?? SEARCH_CACHE_TTL_MS
    this.maxEntries = opts?.maxEntries ?? SEARCH_CACHE_MAX_ENTRIES
    this.now = opts?.now ?? Date.now
  }

  getScoped(key: ScopedSearchCacheKey): FileSearchPageDto | undefined {
    return this.get(scopedKey(key)) as FileSearchPageDto | undefined
  }

  setScoped(key: ScopedSearchCacheKey, value: FileSearchPageDto): void {
    this.set(scopedKey(key), key.userId, value)
  }

  getGlobal(key: GlobalSearchCacheKey): VaultSearchResults | undefined {
    return this.get(globalKey(key)) as VaultSearchResults | undefined
  }

  setGlobal(key: GlobalSearchCacheKey, value: VaultSearchResults): void {
    this.set(globalKey(key), key.userId, value)
  }

  /** Drop every cached page for this user (rights / role change). */
  invalidateUser(userId: string): void {
    const keys = this.keysByUser.get(userId)
    if (!keys) return
    for (const key of [...keys]) this.deleteKey(key)
  }

  /**
   * File add / rename / delete / move / copy. Drops scoped pages for that folder
   * (and all scoped pages, so includeSubfolders ancestor hits cannot go stale)
   * plus every global page — FTS hits are not folder-keyed.
   */
  invalidateOnFileMutation(_folderId?: string | null): void {
    this.clear()
  }

  invalidateAll(): void {
    this.clear()
  }

  clear(): void {
    this.entries.clear()
    this.keysByUser.clear()
  }

  get size(): number {
    return this.entries.size
  }

  private get(key: string): unknown | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= this.now()) {
      this.deleteKey(key)
      return undefined
    }
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  private set(key: string, userId: string, value: unknown): void {
    if (this.entries.has(key)) this.deleteKey(key)
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.deleteKey(oldest)
    }
    this.entries.set(key, {
      value: clone(value),
      expiresAt: this.now() + this.ttlMs,
      userId
    })
    let userKeys = this.keysByUser.get(userId)
    if (!userKeys) {
      userKeys = new Set()
      this.keysByUser.set(userId, userKeys)
    }
    userKeys.add(key)
  }

  private deleteKey(key: string): void {
    const entry = this.entries.get(key)
    this.entries.delete(key)
    if (!entry) return
    const userKeys = this.keysByUser.get(entry.userId)
    if (!userKeys) return
    userKeys.delete(key)
    if (userKeys.size === 0) this.keysByUser.delete(entry.userId)
  }
}

function normalizeQuery(query: string): string {
  return query.trim().slice(0, 200).toLowerCase()
}

export function scopedKey(key: ScopedSearchCacheKey): string {
  const cursor = key.cursor?.trim() || ''
  const sub = key.includeSubfolders ? '1' : '0'
  return `s\0${key.userId}\0${key.folderId}\0${normalizeQuery(key.query)}\0${sub}\0${cursor}\0${key.limit}`
}

export function globalKey(key: GlobalSearchCacheKey): string {
  const cursor = key.cursor?.trim() || ''
  return `g\0${key.userId}\0${normalizeQuery(key.query)}\0${cursor}\0${key.limit}`
}

function clone<T>(value: T): T {
  return typeof structuredClone === 'function' ? structuredClone(value) : (JSON.parse(JSON.stringify(value)) as T)
}

let instance: SearchCache | null = null

export function getSearchCache(): SearchCache {
  if (!instance) instance = new SearchCache()
  return instance
}

/** Test helper — swaps the process singleton. */
export function resetSearchCache(cache?: SearchCache): SearchCache {
  instance = cache ?? new SearchCache()
  return instance
}
