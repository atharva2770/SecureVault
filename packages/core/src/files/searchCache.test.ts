import { afterEach, describe, expect, it } from 'vitest'

import type { FileSearchPageDto, VaultSearchResults } from '@securevault/domain'

import { AccessControlService } from '../access/AccessControlService'
import { SearchCache, globalKey, resetSearchCache, scopedKey } from './searchCache'

const emptyPage: FileSearchPageDto = { items: [], total: 0, nextCursor: null }
const emptyGlobal: VaultSearchResults = {
  modules: [],
  folders: [],
  files: [],
  fileTotal: 0,
  nextCursor: null
}

function scoped(userId: string, folderId = 'folder-a', query = 'inv') {
  return { userId, folderId, query, includeSubfolders: false, limit: 25 }
}

function global(userId: string, query = 'inv') {
  return { userId, query, limit: 25 }
}

describe('search cache keys', () => {
  it('always include userId and never collide across users', () => {
    const a = scopedKey(scoped('user-a'))
    const b = scopedKey(scoped('user-b'))
    expect(a).toContain('user-a')
    expect(b).toContain('user-b')
    expect(a).not.toBe(b)
    expect(globalKey(global('user-a'))).not.toBe(globalKey(global('user-b')))
  })

  it('treats query case as the same slot (SQL Server CI)', () => {
    expect(scopedKey(scoped('u', 'f', 'Inv'))).toBe(scopedKey(scoped('u', 'f', 'inv')))
    expect(globalKey(global('u', 'Spec'))).toBe(globalKey(global('u', 'spec')))
  })
})

describe('SearchCache', () => {
  afterEach(() => {
    resetSearchCache()
  })

  it('returns a clone so callers cannot mutate the stored page', () => {
    const cache = new SearchCache()
    const page: FileSearchPageDto = { items: [], total: 3, nextCursor: null }
    cache.setScoped(scoped('alice'), page)
    page.total = 99
    const hit = cache.getScoped(scoped('alice'))
    expect(hit?.total).toBe(3)
    if (hit) hit.total = 99
    expect(cache.getScoped(scoped('alice'))?.total).toBe(3)
  })

  it('refuses to cache or serve a page without a userId', () => {
    const cache = new SearchCache()
    cache.setScoped(scoped(''), emptyPage)
    expect(cache.size).toBe(0)
    expect(cache.getScoped(scoped(''))).toBeUndefined()
  })

  it('never serves user A a page stored for user B', () => {
    const cache = new SearchCache()
    cache.setScoped(scoped('alice'), { ...emptyPage, total: 4 })
    cache.setGlobal(global('alice'), { ...emptyGlobal, fileTotal: 7 })
    expect(cache.getScoped(scoped('bob'))).toBeUndefined()
    expect(cache.getGlobal(global('bob'))).toBeUndefined()
    expect(cache.getScoped(scoped('alice'))?.total).toBe(4)
  })

  it('expires entries after the TTL', () => {
    let t = 1_000
    const cache = new SearchCache({ ttlMs: 45_000, now: () => t })
    cache.setScoped(scoped('alice'), emptyPage)
    t = 45_999
    expect(cache.getScoped(scoped('alice'))).toEqual(emptyPage)
    t = 46_001
    expect(cache.getScoped(scoped('alice'))).toBeUndefined()
  })

  it('evicts the least recently used entry when full', () => {
    const cache = new SearchCache({ maxEntries: 2 })
    cache.setScoped(scoped('u', 'f1', 'aa'), { ...emptyPage, total: 1 })
    cache.setScoped(scoped('u', 'f2', 'bb'), { ...emptyPage, total: 2 })
    cache.setScoped(scoped('u', 'f3', 'cc'), { ...emptyPage, total: 3 })
    expect(cache.getScoped(scoped('u', 'f1', 'aa'))).toBeUndefined()
    expect(cache.getScoped(scoped('u', 'f2', 'bb'))?.total).toBe(2)
    expect(cache.getScoped(scoped('u', 'f3', 'cc'))?.total).toBe(3)
  })

  it('invalidateUser drops only that user', () => {
    const cache = new SearchCache()
    cache.setScoped(scoped('alice'), { ...emptyPage, total: 1 })
    cache.setGlobal(global('alice'), { ...emptyGlobal, fileTotal: 1 })
    cache.setScoped(scoped('bob'), { ...emptyPage, total: 2 })
    cache.setGlobal(global('bob'), { ...emptyGlobal, fileTotal: 2 })
    cache.invalidateUser('alice')
    expect(cache.getScoped(scoped('alice'))).toBeUndefined()
    expect(cache.getGlobal(global('alice'))).toBeUndefined()
    expect(cache.getScoped(scoped('bob'))?.total).toBe(2)
    expect(cache.getGlobal(global('bob'))?.fileTotal).toBe(2)
  })

  it('file mutation drops scoped and global pages for every user', () => {
    const cache = new SearchCache()
    cache.setScoped(scoped('alice', 'folder-a'), emptyPage)
    cache.setScoped(scoped('bob', 'folder-b'), emptyPage)
    cache.setGlobal(global('alice'), emptyGlobal)
    cache.invalidateOnFileMutation('folder-a')
    expect(cache.size).toBe(0)
    expect(cache.getScoped(scoped('bob', 'folder-b'))).toBeUndefined()
    expect(cache.getGlobal(global('alice'))).toBeUndefined()
  })

  it('ACL rights invalidation drops only that user search pages', () => {
    const cache = resetSearchCache(new SearchCache())
    cache.setScoped(scoped('alice'), { ...emptyPage, total: 1 })
    cache.setGlobal(global('bob'), { ...emptyGlobal, fileTotal: 2 })
    AccessControlService.getInstance().invalidateUser('alice')
    expect(cache.getScoped(scoped('alice'))).toBeUndefined()
    expect(cache.getGlobal(global('bob'))?.fileTotal).toBe(2)
  })

  it('ACL invalidateAll drops every search page', () => {
    const cache = resetSearchCache(new SearchCache())
    cache.setScoped(scoped('alice'), emptyPage)
    cache.setGlobal(global('bob'), emptyGlobal)
    AccessControlService.getInstance().invalidateAll()
    expect(cache.size).toBe(0)
  })

  it('ACL invalidateFolder drops cached search pages', () => {
    const cache = resetSearchCache(new SearchCache())
    cache.setScoped(scoped('alice', 'folder-a'), emptyPage)
    cache.setGlobal(global('bob'), emptyGlobal)
    AccessControlService.getInstance().invalidateFolder('folder-a')
    expect(cache.size).toBe(0)
  })
})
