# DOCMAN — Security Implementation Plan

Companion to `SECURITY-AUDIT.md`. Covers three not-yet-implemented workstreams:

1. **Email-based password reset** (deferred auth item A6).
2. **Injection & path-traversal hardening** (schema validation, raw-SQL audit, LIKE/ReDoS).
3. **HTTP-layer hardening** (Helmet/CSP, CORS, HTTPS, global rate limiting, download safety).

Each section is independently shippable. Ordering recommendation: **3 → 2 → 1** (HTTP
layer is lowest-risk and highest-coverage; validation next; reset last because it needs a
DB migration + a delivery decision).

---

## Workstream 1 — Email-based password reset

### 1.0 Key facts established during the audit (read before building)
- **No `email` column exists** on `User` (`packages/db/prisma/schema.prisma`). Accounts
  are username-only and admin-provisioned. A reset-by-email flow therefore requires a
  schema migration **and** a way to populate emails.
- **A reset is non-destructive for web files.** `unwrapFileDek` tries the **KMS** wrap key
  first; web-uploaded files are KMS-wrapped, *not* wrapped with the user's
  password-derived KEK. So changing the password (new salt / params / `kekVerifier`) does
  **not** lose access to web-vault files. Only legacy desktop KEK-wrapped files are
  affected — and those already return "cannot be opened in the web vault." This makes a
  reset safe, but it must be **explicitly acknowledged** as project policy.
- Sessions are server-side and already revocable (`httpSessions.destroyAllForUser`), which
  we reuse to invalidate all sessions on reset.

### 1.1 Decisions required from you (blockers)
- **D1 — Add `email` to users?** Yes/no. If yes: optional + unique; who sets it (register
  form, admin create form, profile page, or all three)?
- **D2 — Delivery transport.** Dev default = console/log transport (prints the reset link).
  Production = SMTP (`nodemailer`) or a provider API (SES/SendGrid). Provide creds/preference.
- **D3 — Reset policy sign-off.** Confirm "password reset sets a fresh KEK; web files stay
  accessible; legacy desktop-encrypted files remain unopenable (unchanged behaviour)."

### 1.2 Schema & migration
- Add to `User`: `email String? @unique @map("Email") @db.NVarChar(320)`.
- New model `PasswordResetToken`:
  - `tokenId` (uuid pk), `userId` (fk), `tokenHash` (`Char(64)`, unique — store SHA-256 of
    the raw token, never the token), `expiresAt` (DateTime2), `usedAt` (DateTime2?),
    `createdAt`. Indexes on `userId` and `expiresAt`.
- Run `npm run db:migrate` (you run this — needs live MSSQL). Then `npm run db:generate`.

### 1.3 Core service — `packages/core/src/auth/PasswordResetService.ts`
- `requestReset(email): Promise<{ userId; token; email } | null>`
  - Look up user by normalized email. If none → return `null` (caller still responds 200).
  - Invalidate prior unused tokens for the user; create a new one: `token = randomBytes(32).hex`,
    persist `sha256Hex(token)`, `expiresAt = now + 30 min`.
  - Return the raw token to the caller **once** (never stored, never logged in prod).
- `resetPassword(rawToken, newPassword): Promise<{ userId }>`
  - `tokenHash = sha256Hex(rawToken)`; find token where hash matches, `usedAt == null`,
    `expiresAt > now`. Generic failure otherwise.
  - `enforcePasswordPolicy(newPassword, { username })` (reuse existing policy).
  - Generate new salt + `getDefaultArgon2Params()` + derive new KEK → new `kekVerifier`;
    update user; mark token `usedAt = now`; delete the user's other reset tokens.
  - Return `userId` so the route can revoke all sessions.
- Constant-time, generic errors; all detail via `request.log` server-side only.

### 1.4 Email transport — `packages/core/src/email/`
- `EmailTransport` interface `{ send({ to, subject, text, html }): Promise<void> }`.
- `ConsoleEmailTransport` (default) — logs the message + reset URL (dev/offline safe).
- `SmtpEmailTransport` (opt-in) — lazy `import('nodemailer')`, configured from `SMTP_URL`
  / `MAIL_FROM`. Only added if D2 = SMTP.
- Factory in `apps/api` picks transport from env; never block the request on send failure
  beyond logging.

### 1.5 API routes — `apps/api/src/routes/auth.ts` (all in `PUBLIC_PATHS`)
- `POST /api/auth/forgot-password` `{ email }` → **always** `200 { ok: true }` (no
  enumeration). Behind the existing register/login throttle (per-IP). On a real hit,
  build `${WEB_ORIGIN}/reset-password?token=…` and hand to the transport.
- `POST /api/auth/reset-password` `{ token, newPassword }` → validate + reset; then
  `httpSessions.destroyAllForUser(userId)`; return generic `200`. Rate-limited.
- Add both paths to `PUBLIC_PATHS` and confirm CSRF: these are unauthenticated POSTs; the
  SPA will have the `sv_csrf` cookie from its initial GET, so the double-submit header
  still applies (keep them protected).

### 1.6 Frontend
- `apps/web/src/pages/ForgotPasswordPage.tsx` — email field → calls forgot-password →
  always shows the same "If that email exists, a link has been sent" message.
- `apps/web/src/pages/ResetPasswordPage.tsx` — reads `?token=`, new-password + confirm,
  client-side policy hints mirroring the server, calls reset → redirect to sign-in.
- `UnlockScreen.tsx` — add a "Forgot password?" link.
- Routing in `apps/web/src/App.tsx` + `api.auth.forgotPassword/resetPassword` in
  `api/vault.ts`. If D1 includes profile/admin email capture, extend those forms + DTOs.

### 1.7 Verification
- `tsc` across workspaces + `vite build`.
- Manual: request reset for a known + unknown email (identical response + timing), expired
  token rejected, used token rejected, all sessions dropped after reset, web files still
  open with the new password.

---

## Workstream 2 — Injection & path-traversal hardening — ✅ IMPLEMENTED

Status: shipped and verified (20 unit tests, typecheck, prod build, live smoke test).
Delivered:
- Zod 4 + `fastify-type-provider-zod` validator on every JSON route (body/params/query).
  Strict objects; UUID-shaped ids; unknown keys rejected as `400 Invalid request.`
- Multipart upload fields parsed through the same `uploadFieldsSchema`.
- Confirmed **zero** `$queryRaw` / `$executeRaw` / `*Unsafe` usage; locked in with a
  source-scan test.
- Ciphertext paths must resolve inside the blob root (`assertPathInsideRoot`); object keys
  still require UUIDs. Traversal (`../`, absolute paths outside the root) is rejected.
- Client search uses `String.includes` (no `RegExp`); queries capped at 200 chars. Added
  `escapeLikePattern` for a future parameterized LIKE.
- JSON `bodyLimit` default 64 KiB; multipart upload keeps 100 MiB per-route. Non-JSON
  bodies on JSON routes return 415.
- Global error handler: full detail in server logs, generic client messages. Credential /
  password-policy copy stays user-facing; Prisma/stack never leaves the server.
- Live-verified: extra JSON key → 400 `Invalid request.`; unknown user → 400
  `Invalid username or password.`; `text/plain` → 415.

### (Original plan retained below for reference)

## Workstream 2 — Injection & path-traversal hardening

Current posture (from audit): Prisma is used with typed query args throughout (no
`$queryRaw`/`$executeRaw` found — **confirm with the grep in 2.2**), file lookups are by
`fileId` equality and disk paths are derived from the **stored** `storedBlobPath`, not from
user text. So the base is good; this workstream makes it *enforced and explicit*.

### 2.1 Schema-validation layer (zod) — the core of the prompt
- Add `zod` to `apps/api`. Choose one integration style and apply uniformly:
  - **Option A (recommended):** `fastify-type-provider-zod` — attach `schema: { body, querystring, params }` (zod) per route; register its validator+serializer compilers in `app.ts`. Invalid input → 400 before the handler runs.
- Author schemas in `apps/api/src/schemas/` mirroring every route:
  - **auth:** `{ username: z.string().min(3).max(100), password: z.string().min(1).max(4096) }`; reset `{ token: z.string().length(64-ish), newPassword }`.
  - **folders:** create `{ name: 1..255, parentFolderId: uuid }`; params `{ folderId: uuid }`; categories `{ name: 1..100, code?: /^[A-Z0-9_]{1,50}$/ }`.
  - **files:** query `{ folderId?: uuid, categoryId?: uuid }`; params `{ fileId: uuid }`;
    download `{ password: 1..1000, intent?: enum('view','download') }`; move/copy
    `{ targetFolderId: uuid }`; rename `{ displayName: 1..500 }`.
  - **admin:** uuid params; `roleCodes: z.array(z.enum(ROLE_CODES))`; folder-grant arrays
    with strict boolean/uuid shapes; `.strict()` everywhere to reject unknown keys.
  - **multipart upload:** validate `displayName`/`categoryId`/`folderId` fields after parse
    (multipart isn't JSON-schema-validated) — centralize in a small `parseUploadFields` zod
    object; enforce `uuid` for ids.
- Result: no handler reads raw `req.body/query/params`; all values are typed + bounded.

### 2.2 Raw-SQL / Prisma audit (verify, then lock in)
- `rg "\$queryRaw|\$executeRaw|\$queryRawUnsafe|\$executeRawUnsafe" packages apps` — expect
  **zero** hits. If any exist, require `Prisma.sql`/tagged-template parameterization; ban
  the `*Unsafe` variants via an ESLint `no-restricted-properties` rule so they can't return.

### 2.3 File retrieval & path traversal (confirm + fortify)
- Lookup stays strict equality on `fileId` (already the case in `VaultFileService`/
  `FileQueryService`). Never build a path from `displayName` or any user text.
- Harden `resolveCiphertextPath`/`LocalBlobStore`: after resolving the object key from the
  DB record, `path.resolve` it and assert it is **inside** `apiConfig.blobRoot`
  (`resolved.startsWith(root + sep)`), else throw. Add a unit test with `../` in a stored
  value to prove containment. `objectKey(userId, fileId)` should validate both are uuids.

### 2.4 Search string sanitization (LIKE / ReDoS)
- Server search is currently client-side over authorized results (no SQL LIKE today). If a
  server search endpoint is added, escape LIKE metacharacters (`% _ [ ]`) and use Prisma
  `contains` (parameterized), never string-built SQL.
- Audit `apps/web/src/lib/search.ts` for user-string→`new RegExp` construction; if present,
  escape the input or use plain `String.includes`/tokenized matching to remove ReDoS risk.
  Cap query length.

### 2.5 Content-Type & body-size limits
- Global `bodyLimit` already set to `maxUploadBytes` (100 MB) — **too high for JSON**. Lower
  the default `bodyLimit` (e.g. 64 KB) and keep the large limit **only** on the multipart
  upload route via its own config. Reject non-`application/json` bodies on JSON routes
  (zod provider + an `onRequest` content-type check), and keep the multipart limits already
  configured (`files:1`, `fileSize`, `fields`, `fieldSize`).

### 2.6 Generic errors, detailed server logs
- `httpErrors.ts` currently echoes internal `error.message` to clients. Add a global
  `setErrorHandler`: log full error + `reqId` via `request.log.error`; return a **generic**
  message keyed by status (400 "Invalid request", 401/403/404/500 generics), except a small
  allowlist of intentionally user-facing validation messages. Never leak stack/Prisma text.

### 2.7 Verification
- `tsc` + build; add Vitest unit tests for: schema rejects unknown/oversized fields; path
  containment rejects traversal; LIKE escaper; error handler returns generic text.

---

## Workstream 3 — HTTP-layer hardening — ✅ IMPLEMENTED

Status: shipped and verified (typecheck + prod build + live header/behaviour smoke test).
Delivered:
- `@fastify/helmet` with a strict CSP (`default-src 'self'`, `script-src 'self'`,
  `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, `form-action 'self'`,
  `img-src 'self' data: blob:`, `font-src 'self' data:`), `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. HSTS gated on
  `HTTPS_ENABLED` (off in dev — confirmed absent).
- `@fastify/rate-limit` global, per-IP **per-route-group** buckets: sensitive auth POSTs
  30/min, admin 120/min, download 120/min, default 600/min; `/health` allow-listed.
  (SPA's frequent `session`/`touch` stay in the generous default bucket by design.)
- Fastify `trustProxy` from `API_TRUST_PROXY` (fixes client-IP keying behind a proxy).
- CORS: strict allowlist from `WEB_ORIGIN` (comma-separated supported), explicit
  methods/headers, credentials, exposed download headers — no wildcard.
- Download safety: unsafe inline types (html/svg/xml/js) downgraded to
  `application/octet-stream`; `Content-Disposition: attachment`, `nosniff`, and
  `Content-Security-Policy: default-src 'none'; sandbox` on the response.
- Live-verified: security headers on `/health`; `x-ratelimit-limit: 600` on `/api/*`;
  tokenless POST → 403; matching-token POST → 200.

Residual (tune in prod): per-IP limits share a bucket for office NAT clients — consider
keying authenticated requests by session/user, and back the limiter + sessions with Redis
for multi-instance. Set `API_TRUST_PROXY=true`, `HTTPS_ENABLED=true`, `API_COOKIE_SECURE=true`
behind TLS.

### (Original plan retained below for reference)

### 3.1 Helmet + CSP — `@fastify/helmet`
- `npm i @fastify/helmet -w @securevault/api`; register early in `app.ts`.
- Baseline: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Frame-Options: DENY` **and** CSP `frame-ancestors 'none'`, `X-DNS-Prefetch-Control: off`.
- **CSP** (tune against the built app):
  - `default-src 'self'`; `script-src 'self'` (Vite build emits external JS — **no**
    `unsafe-inline/eval** needed in prod build); `style-src 'self'` (+ `'unsafe-inline'`
    only if a runtime style injection requires it — verify, prefer nonce);
    `font-src 'self' data:` (fonts are self-hosted woff2 per the build output);
    `img-src 'self' data: blob:` (blob: for the object-URL file preview/download);
    `connect-src 'self'`; `object-src 'none'`; `base-uri 'none'`; `form-action 'self'`.
  - Serve CSP from **whoever serves the SPA** (reverse proxy or a static server) as well,
    since Helmet on the API only covers API responses.
- **HSTS**: enable `Strict-Transport-Security` (`max-age=15552000; includeSubDomains`)
  **only when served over HTTPS** — gate on `apiConfig.cookieSecure`/an `HTTPS_ENABLED` flag
  to avoid HSTS on localhost.

### 3.2 CORS — tighten (already partly done for CSRF)
- Keep a **strict allowlist** from `WEB_ORIGIN` (never `*`), `credentials: true`, explicit
  `methods` + `allowedHeaders: ['Content-Type','x-csrf-token']` + `exposedHeaders`
  (`Content-Disposition`, `X-Checksum-SHA256`) — already applied in `app.ts`. Add support
  for a comma-separated `WEB_ORIGIN` list validated against an allowset for multi-env.

### 3.3 Force HTTPS + Secure cookies (production)
- TLS terminates at the reverse proxy (nginx/IIS/Caddy); redirect `http→https` there.
- App side: set `API_COOKIE_SECURE=true` (session + `sv_csrf` already read this), enable
  Fastify `trustProxy` so `request.ip`/`request.protocol` reflect the client (also fixes the
  per-IP throttle keying noted in the audit), and enable HSTS (3.1).

### 3.4 Global rate limiting — `@fastify/rate-limit`
- `npm i @fastify/rate-limit -w @securevault/api`; register a **global** default
  (e.g. 300 req/min/IP). Add **per-route overrides**:
  - `/api/auth/*`: strict (works alongside the existing per-username lockout in `rateLimit.ts`).
  - `/api/admin/*`: strict.
  - `/api/files/:id/download`: strict (expensive crypto + I/O).
- Key by `request.ip` (requires `trustProxy`); `429` + `Retry-After`. For multi-instance,
  back it with Redis (`@fastify/rate-limit` supports a store) — same note as sessions.

### 3.5 Download / preview response safety (mostly present — make explicit + universal)
- `files.ts` already sets `Content-Disposition: attachment`, explicit `Content-Type`,
  and `X-Content-Type-Options: nosniff`. Harden further:
  - For preview/`open` intent, force safe types: send `application/octet-stream` (or a
    strict allowlist like `application/pdf`, images) and **never** `text/html`,
    `image/svg+xml`, or JS content types inline; add `Content-Security-Policy: default-src 'none'; sandbox`
    on the download response so a rogue file can't execute if opened directly.
  - Note the current FE `open` path uses `URL.createObjectURL` + `window.open` — keep
    `blob:` in `img-src` CSP, and prefer forcing download for risky types.

### 3.6 Verification
- `tsc` + build; smoke-test headers with `curl -I`; confirm CSP doesn't break the built SPA
  (watch the browser console for CSP violations and adjust the allowlist, not by adding
  `unsafe-*`); confirm 429s on the auth/download overrides; confirm cookies carry `Secure`
  behind TLS.

---

## New dependencies introduced (by workstream)
- **1:** `nodemailer` (only if SMTP chosen).
- **2:** `zod` (+ `fastify-type-provider-zod`).
- **3:** `@fastify/helmet`, `@fastify/rate-limit`.

## Cross-cutting notes
- Sessions, login throttle, CSRF token, and (future) rate-limit counters are all
  **process-local**. A multi-instance deployment needs a shared store (Redis) for each.
- Config knobs to document in `.env`: `API_COOKIE_SECURE`, `API_COOKIE_SECRET`,
  `PASSWORD_BREACH_CHECK`, `VAULT_SESSION_MAX_MS`, plus (new) `SMTP_URL`, `MAIL_FROM`,
  `HTTPS_ENABLED`.
