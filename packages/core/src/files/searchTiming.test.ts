import { afterEach, describe, expect, it, vi } from 'vitest'

import { SLOW_SEARCH_MS, logSlowSearch } from './searchTiming'

describe('logSlowSearch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('stays quiet under the threshold', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    logSlowSearch({
      kind: 'scoped',
      durationMs: SLOW_SEARCH_MS - 1,
      userId: 'u1',
      folderId: 'f1',
      queryLength: 4,
      cacheHit: false
    })
    expect(warn).not.toHaveBeenCalled()
  })

  it('emits structured JSON at or above 200ms without the query text', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    logSlowSearch({
      kind: 'global',
      durationMs: 241.6,
      userId: 'u1',
      queryLength: 12,
      cacheHit: false
    })
    expect(warn).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(String(warn.mock.calls[0]?.[0])) as Record<string, unknown>
    expect(payload).toMatchObject({
      level: 'perf',
      event: 'slow_search',
      kind: 'global',
      durationMs: 242,
      userId: 'u1',
      folderId: null,
      queryLength: 12,
      cacheHit: false,
      thresholdMs: 200
    })
    expect(JSON.stringify(payload)).not.toMatch(/invoice|q=/i)
  })
})
