# DOCMAN — Security Audit (Authentication & Authorization)

Scope: `apps/api` (Fastify), `packages/core` (auth, crypto, RBAC, ACL), `packages/db`
(Prisma/MSSQL). Reviewed against the two engagement briefs: (1) full authentication
audit, (2) authorization-model audit. This document states findings first, then the
fixes applied in this pass and the items intentionally deferred.

Severity key: **Critical / High / Medium / Low / Info**.

---

## 0. Executive summary

DOCMAN is in good shape. The architecturally hard parts are already correct:

- Passwords are **never** stored. A KEK is derived with **Argon2id (64 MiB, t=3, p=4)**
  and only a SHA-256 *verifier* of the KEK is persisted (`AuthCredentials`,
  `CryptoService`). No MD5/SHA1/bcrypt/plaintext anywhere in the credential path.
- Sessions are **opaque, server-side, httpOnly, signed cookies** — not JWTs in
  `localStorage`. This already satisfies the *intent* of the "short-lived access +
  refresh token" recommendation, in a simpler and more revocable way.
- Authorization is **enforced server-side, deny-by-default**, and re-resolved from the
  rights tables on every list/file/folder operation (`AccessControlService`,
  `FolderService`, `FileQueryService`, `VaultFileService`). The frontend is not trusted
  for access decisions.
- Admin operations verify the ADMIN role **in the service layer**, not just in the UI.

The gaps were mostly at the **edges**: weak password policy, login user-enumeration via
timing, coarse rate limiting, no cross-session revocation on password change, no
route-level admin gate, and no probing detection. Those are addressed below.

No Critical issues were found.

---

## PART A — Authentication audit

### A1. Password storage — **PASS (Info)**
`CryptoService.deriveKEK` uses Argon2id with memoryCost 65 536 KiB (64 MiB), timeCost 3,
parallelism 4, and *enforces* a 64 MiB floor. Salt is 32 random bytes per user. The KEK
is never persisted; only `sha256Hex(kek)` is stored as `kekVerifier`, compared in
constant time (`safeEqualHex` → `timingSafeEqual`). This exceeds the brief.

### A2. Password complexity + breach check — **FIXED (was Medium)**
Before: the only rule was length ≥ 8 (`AuthCredentials.assertPassword`,
`AdminService.createUser`). No complexity, no reuse/common-password checks, no breach
list.
Fix: new `packages/core/src/auth/PasswordPolicy.ts`:
- Min length 10, single-repeated-char rejection, common-password denylist, and
  "must not contain username". Shorter secrets must mix ≥ 3 character classes; long
  passphrases (≥ 16) are exempt (NIST SP 800-63B leaning).
- Optional **HaveIBeenPwned k-anonymity** breach check (only the first 5 SHA-1 chars are
  sent), gated by `PASSWORD_BREACH_CHECK=true`, 2.5 s timeout, **fails open** so an
  air-gapped deployment is never blocked by a network outage.
- Wired into `register`, `changePassword`, and admin `createUser`.

### A3. Session / token strategy — **PASS with hardening (was Low)**
Design is sound: `randomBytes(32)` session id, signed httpOnly cookie
(`sameSite=lax`, `secure` via `API_COOKIE_SECURE`), 15-min idle timeout, in-memory store
holding the KEK (never sent to the browser). Session id is regenerated on every login
(no fixation).
Hardening applied:
- **Absolute session lifetime** added (`VAULT_SESSION_MAX_MS`, default 12 h) in addition
  to idle timeout, so a stolen cookie cannot live indefinitely on activity alone.
Notes / recommendations (not code-changed):
- `API_COOKIE_SECURE` **must** be `true` in production (currently defaults to false for
  local dev). The default `API_COOKIE_SECRET` is a dev placeholder and must be overridden.
- Session store is process-local; a multi-instance deployment needs a shared store
  (e.g. Redis) for sessions and the throttle counters.

### A4. Refresh-token rotation / revocation — **N/A → satisfied in spirit**
No refresh tokens exist because the app uses opaque server-side sessions, which are
inherently revocable. Logout destroys the session; see A6 for revocation on password
change. No action needed.

### A5. Login endpoint hardening — **FIXED (was Medium)**
Before: rate limiting was **per-IP only** (10 / 15 min), no per-username limit, no
backoff, no lockout. The generic `"Invalid username or password."` message was already
correct (no enumeration via the message body).
Findings & fixes:
- **User enumeration via timing (Medium) — FIXED.** A non-existent username returned
  instantly while a real one paid the full Argon2 cost. `AuthCredentials.login` now runs
  a throwaway Argon2 derivation (`burnKekDerivation`) for unknown users to equalize
  wall-clock time.
- **Throttling (Medium) — FIXED.** New `apps/api/src/plugins/rateLimit.ts` adds two
  independent guards: per-IP (10 free, then exponential backoff to 15 min) **and**
  per-username (5 free, then exponential backoff to 15 min). Prevents both password
  spraying and single-account brute force. Success clears the counters. Lockouts emit a
  structured `credential_lockout` security log (the "notification" hook).
- Login now returns `429` + `Retry-After` when locked.

### A6. Password reset — **PARTIAL (was Medium)**
There is **no** forgot-password / email reset flow (there is no email subsystem). The
authenticated `change-password` flow correctly requires the current password.
Fix applied: on password change, **all other sessions for that user are revoked**
immediately (`httpSessions.destroyAllForUser`, keeping the initiating session with its
rotated KEK). The initiating session's KEK is rotated in place.
Deferred (needs infra — see Part C): a self-service reset requires single-use,
short-lived, cryptographically-random tokens delivered by email, and must not reveal
whether an address is registered. Cannot be implemented safely without an email provider.

### A7. Step-up / re-auth for sensitive admin actions — **DEFERRED (Medium)**
Not present. Recommended: a "sudo mode" — require the admin's password (verified via the
existing KEK verifier) within the last N minutes before role changes, user
deletion/disable, and ACL edits, tracked as `reauthAt` on the session. This needs a
coordinated frontend prompt to avoid locking admins out, so it is scoped in Part C rather
than half-wired here.

### A8. Registration abuse — **FIXED (was Low)**
Before: `register` had **no** rate limit. Fix: per-IP register throttle (5 free, then
backoff to 30 min). Note (Info): `register` returns `"Username is already taken."`, which
allows username enumeration by design of self-service signup; consider making
registration admin-only after the first user (product decision).

---

## PART B — Authorization audit

DOCMAN's promise — "users only see what their role grants" — is enforced at the
API/DB layer. Evidence and residual gaps:

### B1. Server-side filtering on every data route — **PASS (Info)**
- `GET /api/folders` → `FolderService.listFolders` resolves effective rights per folder
  via `AccessControlService.getEffectiveRights` and returns only granted folders
  (ancestors appear as traversal-only, no files/siblings).
- `GET /api/files` → `FileQueryService.listFiles` re-checks `getEffectiveRights` for the
  filter folder **and per file** before including it.
- `GET /api/categories` requires a session; category roots are ACL-gated on access.
- Admin ACL/user listings go through `AdminService`, which gates on role (see B4).
- **No server-side search endpoint exists** — search is client-side over the already
  ACL-filtered `listFiles`/`listFolders` responses, so there is no unfiltered query to
  leak results. (Confirmed by route inventory.)
All rights computation flows through the single pure engine `resolveFolderRightsPure`
(deny-by-default; admin bypass; viewer capped at VIEW), not re-implemented per route.

### B2. Reusable per-request rights resolver — **FIXED (was Low)**
Before: each service resolved rights independently (correct, but no shared request-level
identity, so a new route could forget the check). Fix: `registerAuthGuard` now resolves
the caller's identity once per request and exposes it as `request.identity`
(`{ userId, roleCodes, isAdmin }`), plus a `requireAdmin(request)` helper for handlers.

### B3. File retrieval / download re-checks rights at request time — **PASS (Info)**
`VaultFileService.downloadToTemp` calls `AccessControlService.requireFile(fileId, 'view'|'copy', userId)`
on **every** request; move/copy/delete/rename likewise require the appropriate right on
source and target. Rights are read from the DB (30 s cache) and the cache is invalidated
on every ACL/role mutation (`invalidateUser` / `invalidateAll`), so an admin-initiated
revocation takes effect immediately. Residual (Low): a revocation performed *out of band*
in the DB propagates within ≤ 30 s (cache TTL). Acceptable; documented.

### B4. Admin-only routes verify ADMIN server-side — **PASS + hardened (was Low)**
`AdminService.requireAdminOrManager` verifies the ADMIN role (or the `ADMIN_ACL`
capability for ACL-only operations) on **every** admin method, and enforces "only an
admin can create/assign admin". Hardening applied: a route-level gate in
`registerAuthGuard` now returns `403` for any `/api/admin/*` request from a non-admin
*before* the handler runs (defense in depth).

### B5. Integration tests for cross-department 403s — **DEFERRED (High-value, infra)**
No test runner is configured and tests require a live MSSQL schema; see Part C. This is
the most significant outstanding gap for *regression protection* (the enforcement itself
is present).

### B6. Alert on repeated 403s (probing) — **FIXED (was Low)**
Added a rolling per-user 403 counter (`recordForbidden`) that emits a structured
`authz_probing_suspected` security log after 8 forbidden responses in 5 minutes, fed by
both the admin gate and an `onResponse` hook that catches 403s thrown deep in services.
`ACL_DENY` rows are also already written to the audit log.

---

## PART C — Deferred (needs frontend co-design or external infra)

These are intentionally **not** implemented in this backend-only pass because doing them
blindly would either break the running SPA or requires infrastructure that can't be
validated here. Each is ready to implement on confirmation:

1. **CSRF double-submit token** — **DONE.** `apps/api/src/plugins/csrf.ts` issues a
   readable `sv_csrf` cookie and rejects any unsafe `/api/*` method whose `x-csrf-token`
   header doesn't match (timing-safe). CORS now allowlists the header explicitly, and the
   web client (`apps/web/src/api/vault.ts`) echoes the cookie on every state-changing
   request. Verified via typecheck + production build. (Dev/prod are same-origin via the
   Vite `/api` proxy, so the SPA can read the cookie; split-origin deploys should serve the
   SPA same-origin as the API or additionally surface the token in the session body.)
2. **Step-up re-auth (A7)** — backend `reauthAt` gate + FE password prompt.
3. **Self-service password reset (A6)** — needs an email provider; single-use, short-lived,
   random tokens; no address enumeration.
4. **Integration test suite (B5)** — add Vitest + a disposable MSSQL test DB, then assert
   403 for cross-department folder/file access for every module × role.

## Changes applied in this pass (files)

- `packages/core/src/auth/PasswordPolicy.ts` (new) — complexity + HIBP breach check.
- `packages/core/src/auth/AuthCredentials.ts` — policy on register/change; timing
  equalization for unknown users.
- `packages/core/src/admin/AdminService.ts` — policy on admin-provisioned users.
- `apps/api/src/plugins/rateLimit.ts` (new) — per-IP + per-username backoff/lockout.
- `apps/api/src/routes/auth.ts` — login/register throttling, `429 + Retry-After`,
  revoke sibling sessions on password change.
- `apps/api/src/session.ts` — absolute session lifetime, `destroyAllForUser`.
- `apps/api/src/plugins/auth.ts` — per-request `request.identity`, `/api/admin/*` gate,
  repeated-403 probing monitor.
- `apps/api/src/config.ts` — `sessionAbsoluteMaxMs`, `passwordBreachCheck` knobs.

All five workspaces typecheck clean after the changes.

## Operational recommendations (config, no code)

- Set `API_COOKIE_SECURE=true` and a strong random `API_COOKIE_SECRET` in production.
- Set `PASSWORD_BREACH_CHECK=true` where outbound HTTPS to `api.pwnedpasswords.com` is allowed.
- If running multiple API instances, move sessions + throttle counters to a shared store.
- Ensure the API sits behind a proxy that sets a trustworthy client IP (configure Fastify
  `trustProxy`) so per-IP throttling keys on the real client, not the proxy.
