/*
  In-memory attempt throttling for credential endpoints.

  Two independent guards are consulted on login so an attacker can neither
  brute-force one account from many IPs (per-username guard) nor spray many
  accounts from one IP (per-IP guard). Failures trigger exponential backoff and,
  past a hard ceiling, a fixed lockout window. Successful auth clears the key.

  This is process-local (single API instance). A multi-instance deployment
  should back these counters with a shared store (Redis) — noted in the audit.
*/

export class TooManyAttemptsError extends Error {
  readonly retryAfterMs: number
  constructor(retryAfterMs: number) {
    super('Too many attempts. Please wait and try again.')
    this.name = 'TooManyAttemptsError'
    this.retryAfterMs = retryAfterMs
  }
}

interface AttemptRow {
  failures: number
  firstFailureAt: number
  lockedUntil: number
}

const SWEEP_INTERVAL_MS = 60_000

export interface GuardOptions {
  /** Failures allowed before backoff/lockout begins. */
  freeAttempts: number
  /** Backoff base (ms) multiplied by 2^(failures-free) once over the threshold. */
  backoffBaseMs: number
  /** Hard cap on a single backoff/lockout window (ms). */
  maxLockMs: number
  /** Idle window after which a key with no lock is forgotten (ms). */
  windowMs: number
  label: string
}

/** Exported only so tests can build a guard with their own windows. */
export class AttemptGuard {
  private readonly rows = new Map<string, AttemptRow>()

  constructor(private readonly opts: GuardOptions) {}

  /** Number of keys currently tracked. */
  get size(): number {
    return this.rows.size
  }

  /**
   * Forgets keys that are neither locked nor still inside their failure window.
   * The cleanup in `assert()` only runs for a key that has locked at least once,
   * so a key that never passed `freeAttempts` was kept for the life of the
   * process. Sweeping applies the same window `assert()` already uses, so a key
   * below the threshold now resets on idle instead of accumulating forever.
   * A key inside an active lockout is never dropped — that would hand the
   * caller a free pass.
   */
  sweep(now = Date.now()): number {
    let dropped = 0
    for (const [key, row] of this.rows) {
      if (row.lockedUntil > now) continue
      if (now - row.firstFailureAt <= this.opts.windowMs) continue
      this.rows.delete(key)
      dropped += 1
    }
    return dropped
  }

  assert(key: string): void {
    const row = this.rows.get(key)
    if (!row) return
    const now = Date.now()
    if (row.lockedUntil > now) {
      throw new TooManyAttemptsError(row.lockedUntil - now)
    }
    if (row.lockedUntil !== 0 && now - row.firstFailureAt > this.opts.windowMs) {
      this.rows.delete(key)
    }
  }

  recordFailure(key: string): void {
    const now = Date.now()
    const row = this.rows.get(key) ?? { failures: 0, firstFailureAt: now, lockedUntil: 0 }
    row.failures += 1

    if (row.failures > this.opts.freeAttempts) {
      const over = row.failures - this.opts.freeAttempts
      const backoff = Math.min(this.opts.backoffBaseMs * 2 ** (over - 1), this.opts.maxLockMs)
      row.lockedUntil = now + backoff
      // Structured alert for repeated failures (probing / brute-force signal).
      console.warn(
        JSON.stringify({
          level: 'security',
          event: 'credential_lockout',
          guard: this.opts.label,
          key,
          failures: row.failures,
          lockMs: backoff
        })
      )
    }
    this.rows.set(key, row)
  }

  clear(key: string): void {
    this.rows.delete(key)
  }
}

const loginByIp = new AttemptGuard({
  label: 'login:ip',
  freeAttempts: 10,
  backoffBaseMs: 2_000,
  maxLockMs: 15 * 60 * 1000,
  windowMs: 15 * 60 * 1000
})

const loginByUser = new AttemptGuard({
  label: 'login:user',
  freeAttempts: 5,
  backoffBaseMs: 5_000,
  maxLockMs: 15 * 60 * 1000,
  windowMs: 30 * 60 * 1000
})

const registerByIp = new AttemptGuard({
  label: 'register:ip',
  freeAttempts: 5,
  backoffBaseMs: 5_000,
  maxLockMs: 30 * 60 * 1000,
  windowMs: 60 * 60 * 1000
})

const guards = [loginByIp, loginByUser, registerByIp]

let sweeper: ReturnType<typeof setInterval> | null = null

/** Idempotent; `unref`'d so it never delays process exit. */
export function startAttemptGuardSweeper(): void {
  if (sweeper) return
  sweeper = setInterval(() => {
    for (const guard of guards) guard.sweep()
  }, SWEEP_INTERVAL_MS)
  sweeper.unref()
}

export function stopAttemptGuardSweeper(): void {
  if (sweeper) clearInterval(sweeper)
  sweeper = null
}

startAttemptGuardSweeper()

function userKey(username: string): string {
  return username.trim().toLowerCase() || '(empty)'
}

export function assertLoginAllowed(ip: string, username: string): void {
  loginByIp.assert(ip)
  loginByUser.assert(userKey(username))
}

export function recordLoginFailure(ip: string, username: string): void {
  loginByIp.recordFailure(ip)
  loginByUser.recordFailure(userKey(username))
}

export function recordLoginSuccess(ip: string, username: string): void {
  loginByIp.clear(ip)
  loginByUser.clear(userKey(username))
}

export function assertRegisterAllowed(ip: string): void {
  registerByIp.assert(ip)
}

export function recordRegisterAttempt(ip: string): void {
  registerByIp.recordFailure(ip)
}
