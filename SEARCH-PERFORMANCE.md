# Search performance (indexing + cache)

DOCMAN search is two different queries. Do not collapse them into one `LIKE '%term%'` scan of `Files`.

## Indexes (SR1 / SR2)

Applied in `packages/db/prisma/migrations/20260826090000_file_search_indexes/migration.sql`.

| Path | Endpoint | Index | Predicate |
| --- | --- | --- | --- |
| Folder-scoped prefix | `GET /api/search/folder` | `IX_Files_FolderId_DisplayName` | `FolderId = @id AND DisplayName LIKE @prefix + '%'` (trailing wildcard only) |
| Module + subfolders | same, `includeSubfolders=true` | `IX_Files_CategoryId_FolderId_DisplayName` | `CategoryId` + `FolderId IN (...)` + prefix |
| Global vault | `GET /api/search` | Full-text catalog `FTC_SecureVault` on `DisplayName`, `OriginalFileName` | `CONTAINSTABLE` + `RANK`; residual `IsDeleted = 0 AND FolderId IN (@viewable)` |

Confirm with `SET STATISTICS XML ON`: scoped must **Index Seek**, global must show **FulltextMatch**. A clustered scan of `Files` with `LIKE '%term%'` is a regression.

Prefix search never uses a leading wildcard. Global search never uses Prisma `contains` / `LIKE`. `FREETEXT` / `CONTAINS` are parameterized tagged templates in `FileQueryService.runFullTextSearch`.

If SQL Server Full-Text Search is not installed, the migration still creates the B-trees; global search returns 503 (`Search is unavailable.`).

## Cache

**Redis is not in this stack.** Sessions, login throttles, and this search cache are process-local. **Redis must be added** before running more than one API instance — otherwise invalidation on node A leaves stale rights-filtered pages on node B.

Until then: in-memory LRU in `packages/core/src/files/searchCache.ts`.

| | |
| --- | --- |
| TTL | 45s (inside the 30–60s window) |
| Capacity | 512 entries, LRU eviction |
| Scoped key | `(userId, folderId, query)` plus `includeSubfolders`, `cursor`, `limit` |
| Global key | `(userId, query)` plus `cursor`, `limit` |

Query text is trimmed, capped at 200 chars, and lowercased in the key (SQL Server CI). **userId is always part of the key.** Pages are cloned on write. User A's hits are never served to user B.

View rights are checked on every request *before* a cache lookup, so a revoke still denies even if a stale page had not been dropped yet.

Cache hits still write a `SEARCH` audit row (the user searched). Errors are never cached.

## Invalidation

| Event | What drops |
| --- | --- |
| File add / rename / delete / move / copy | Entire search cache (`invalidateOnFileMutation`) — covers that folder's prefix pages, ancestor `includeSubfolders` pages, and every user's global FTS page |
| Rights change for one user (`AccessControlService.invalidateUser`) | That user's scoped + global pages only |
| Role ACL / `invalidateAll` | Entire search cache |

`RbacService` and `AdminService` already call `invalidateUser` / `invalidateAll`; those now also drop search pages. File mutations are hooked in `VaultFileService`.

Short TTL is the backstop for anything not hooked (folder create/rename, FTS crawl lag).

## Slow queries

`logSlowSearch` in `packages/core/src/files/searchTiming.ts` writes a JSON line to stderr when a call takes **≥ 200ms**:

```json
{"level":"perf","event":"slow_search","kind":"scoped","durationMs":241,"userId":"…","folderId":"…","queryLength":12,"cacheHit":false,"thresholdMs":200}
```

The query string is not logged. Treat a sudden rise in `slow_search` as a plan regression (seek → scan, or FTS down to `LIKE`).

## Load test

Needs a signed-in user and a folder with a realistic file count (a few hundred to a few thousand rows). The script does not seed data.

Raise the default HTTP rate-limit bucket on the API process (600/min will 429 a real run):

```env
API_RATE_LIMIT_DEFAULT=100000
```

Node runner (p50 / p95, no extra binary):

```bash
set SEARCH_LOAD_USER=admin
set SEARCH_LOAD_PASSWORD=...
set SEARCH_LOAD_FOLDER_ID=...
set SEARCH_LOAD_Q=in
npm run test:search-load
```

k6 (same env; reports `p(50)` / `p(95)` on `http_req_duration{endpoint:scoped|global}`):

```bash
k6 run scripts/search-load-test.k6.js
```

Scoped hits `GET /api/search/folder?folderId=&q=&limit=25`. Global hits `GET /api/search?q=&limit=25` across the full rights-filtered dataset. Each request still writes a `SEARCH` audit row.

| Endpoint | p50 | p95 | Notes |
| --- | --- | --- | --- |
| `GET /api/search/folder` | *(run locally)* | *(run locally)* | Prefix seek + 45s cache; warm p95 should sit near p50 |
| `GET /api/search` | *(run locally)* | *(run locally)* | `CONTAINSTABLE` + `FolderId IN (...)`; first miss includes FTS |

Record the numbers next to file count, `SEARCH_LOAD_Q`, and whether the cache was cold or warm. Cache-cold scoped should stay a seek; if p95 jumps into hundreds of ms on a few-thousand-row folder, check the query plan before adding more cache.
