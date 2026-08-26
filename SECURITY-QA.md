# DOCMAN — Security QA pass

Repeat this checklist when dependencies, env vars, upload handling, or the API error
path change. Last run: 2026-08-26.

## 1. Secrets not in the repo

| Check | Result |
| --- | --- |
| `.env` gitignored (`!.env.example` allowed) | Yes — `.gitignore` |
| `.env.example` has placeholders only | Yes |
| Hardcoded cookie/KMS/DB secrets in source | Removed. `API_COOKIE_SECRET` no longer has a compiled-in default. |
| Git history scan | This tree is not a git repo yet. Before the first commit, confirm `.env` is untracked (`git status`). |

**Required env (API refuses to boot if missing/placeholder):**
`DATABASE_URL` or `DATABASE_URL_TRUSTED`, `API_COOKIE_SECRET` (≥16 chars, not `change-me…`), `VAULT_KMS_WRAP_KEY` (64 hex). Production also requires `WEB_ORIGIN` and `API_COOKIE_SECURE=true`.

Copy `.env.example` → `.env` and replace every placeholder. Validated in `apps/api/src/config.ts` (`loadApiConfig` / `ConfigError`).

## 2. Dependency vulnerabilities

| Command | When |
| --- | --- |
| `npm run audit:deps` | Production deps, fail on **high+** (`--omit=dev`) |
| `npm run audit:deps:all` | Full tree including Prisma CLI |

CI: `.github/workflows/ci.yml` runs `audit:deps:all` (visible in logs; does not fail the job while the known Prisma CLI advisory is unfixed), then `npm test` and `npm run typecheck`.

**This run:** `deepmerge-ts <8` (via Prisma 7 `@prisma/config`) — **high**, GHSA-ggr8-5vv4-36mx, recursive-merge stack exhaustion. Affects the Prisma CLI config merge, not HTTP handlers. Do **not** `npm audit fix --force` (downgrades Prisma 7 → 6). Re-check when upgrading Prisma. No other production-app packages were reported.

## 3. Error responses

Global Fastify handler: `apps/api/src/httpErrors.ts` (`registerErrorHandler`).

- Client body is `{ error: "<generic or allowlisted message>" }` only.
- Stack traces, Prisma/SQL text, and filesystem paths stay on the server log (`request.log.error({ err, detail })`).
- Routes use `sendError()`; plugins send fixed public strings (401/403/413/415/CSRF).
- Allowlist-only: a 400 `HttpError` with a path in the message is rewritten to `Invalid request.`

## 4. Uploads

| Control | Where |
| --- | --- |
| Max size (default 100 MiB) | `@fastify/multipart` `fileSize`, route `bodyLimit`, plus `limitReadable` while encrypting |
| Type from **magic bytes**, not extension | `packages/core/src/files/sniffUpload.ts` — PE/ELF/Mach-O/HTML/SVG/PHP rejected; PDF/images/zip/Office sniffed |
| Store outside web root | `VAULT_BLOB_ROOT` default `data/vault-blobs` (gitignored). Boot fails if the path is under `apps/web`. Ciphertext is encrypted; Vite does not serve it. |

## 5. Re-run

```bash
npm run audit:deps
npm test
npm run typecheck
```

Then grep for new secrets:

```bash
git ls-files | findstr /i ".env .pem .key credentials"
```
