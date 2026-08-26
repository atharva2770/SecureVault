/**
 * Builds a CONTAINS / CONTAINSTABLE predicate from user text.
 * Strips FTS operators so the value is safe as a bound parameter.
 * Uses prefix terms ("word*") — still served by the full-text index.
 */
export function toContainsQuery(term: string): string | null {
  const cleaned = term
    .replace(/["*()\\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length < 2) return null

  const words = cleaned
    .split(' ')
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !/^(and|or|not|near)$/i.test(w))
    .slice(0, 8)

  if (!words.length) return null
  return words.map((w) => `"${w}*"`).join(' AND ')
}

export function encodeNameCursor(displayName: string, fileId: string): string {
  return Buffer.from(`${displayName}\t${fileId}`, 'utf8').toString('base64url')
}

export function decodeNameCursor(cursor: string): { displayName: string; fileId: string } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8')
    const tab = raw.indexOf('\t')
    if (tab < 0) return null
    const displayName = raw.slice(0, tab)
    const fileId = raw.slice(tab + 1)
    if (!displayName || !fileId) return null
    return { displayName, fileId }
  } catch {
    return null
  }
}

export function parseOffsetCursor(cursor: string | undefined): number {
  if (!cursor) return 0
  const n = Number.parseInt(cursor, 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}
