/**
 * Sorted-array prefix index: build once (O(n log n)), query by prefix with
 * binary search + a sequential scan of the matching run (O(log n + m)).
 * Used for instant in-folder filtering so we never rescan the whole list
 * on every keystroke.
 */
export const CLIENT_SCOPED_SEARCH_LIMIT = 500

type Entry<T> = { key: string; item: T }

export class PrefixIndex<T> {
  private readonly sorted: Entry<T>[]

  constructor(items: readonly T[], nameOf: (item: T) => string) {
    this.sorted = items
      .map((item) => ({ key: nameOf(item).toLowerCase(), item }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  }

  get size(): number {
    return this.sorted.length
  }

  prefix(raw: string): T[] {
    const needle = raw.trim().toLowerCase()
    if (!needle) return this.sorted.map((row) => row.item)

    const start = lowerBound(this.sorted, needle)
    const out: T[] = []
    for (let i = start; i < this.sorted.length; i++) {
      const row = this.sorted[i]!
      if (!row.key.startsWith(needle)) break
      out.push(row.item)
    }
    return out
  }
}

function lowerBound<T>(rows: Entry<T>[], needle: string): number {
  let lo = 0
  let hi = rows.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (rows[mid]!.key < needle) lo = mid + 1
    else hi = mid
  }
  return lo
}
