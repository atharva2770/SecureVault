export interface HighlightPart {
  text: string
  hit: boolean
}

const MAX_TOKENS = 8

/**
 * Splits `text` into runs so the UI can wrap matches in a theme-aware mark.
 * Tokens are case-insensitive substrings from the user query.
 */
export function splitHighlight(text: string, query: string): HighlightPart[] {
  const tokens = query
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 1)
    .slice(0, MAX_TOKENS)

  if (!text || !tokens.length) return [{ text, hit: false }]

  const lower = text.toLowerCase()
  const ranges: Array<[number, number]> = []
  for (const token of tokens) {
    const needle = token.toLowerCase()
    let from = 0
    while (from < text.length) {
      const at = lower.indexOf(needle, from)
      if (at < 0) break
      ranges.push([at, at + needle.length])
      from = at + needle.length
    }
  }

  if (!ranges.length) return [{ text, hit: false }]

  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const merged: Array<[number, number]> = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (!last || range[0] > last[1]) merged.push([...range])
    else if (range[1] > last[1]) last[1] = range[1]
  }

  const parts: HighlightPart[] = []
  let cursor = 0
  for (const [start, end] of merged) {
    if (start > cursor) parts.push({ text: text.slice(cursor, start), hit: false })
    parts.push({ text: text.slice(start, end), hit: true })
    cursor = end
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false })
  return parts
}
