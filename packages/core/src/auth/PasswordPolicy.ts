import { createHash } from 'node:crypto'

/*
  Centralized password strength policy for every credential-setting path
  (self-service register, admin-provisioned users, and password change).

  Design notes:
  - NIST SP 800-63B leaning: length is the primary strength lever; we allow
    long passphrases to satisfy the policy without rigid character-class rules,
    but still require a mix for shorter secrets.
  - Breach check uses the HaveIBeenPwned range API with k-anonymity: only the
    first 5 chars of the SHA-1 are ever sent, never the password. It is
    opt-in (PASSWORD_BREACH_CHECK=true) and fails OPEN so an offline/air-gapped
    deployment is never blocked from setting a password by a network outage.
*/

export const MIN_PASSWORD_LENGTH = 10
export const PASSPHRASE_LENGTH = 16
export const MAX_PASSWORD_LENGTH = 4096

const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/'
const HIBP_TIMEOUT_MS = 2500

/** A small set of obviously-weak secrets rejected regardless of length/mix. */
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  'passw0rd',
  'welcome',
  'welcome1',
  'qwerty',
  'qwerty123',
  'letmein',
  'iloveyou',
  'admin',
  'administrator',
  'changeme',
  'secret',
  'vault',
  'securevault',
  'docman',
  '12345678',
  '123456789',
  '1234567890'
])

export interface PasswordPolicyOptions {
  /** Used to reject passwords that merely echo the username. */
  username?: string | null
  /** Enable the HaveIBeenPwned breach check (network). Falls back to env flag. */
  breachCheck?: boolean
}

export class PasswordPolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PasswordPolicyError'
  }
}

function classesOf(password: string): number {
  let classes = 0
  if (/[a-z]/.test(password)) classes += 1
  if (/[A-Z]/.test(password)) classes += 1
  if (/[0-9]/.test(password)) classes += 1
  if (/[^A-Za-z0-9]/.test(password)) classes += 1
  return classes
}

function isSingleRepeatedChar(password: string): boolean {
  return password.length > 0 && new Set(password).size === 1
}

/**
 * Synchronous complexity + reuse checks. Throws {@link PasswordPolicyError}.
 */
export function assertPasswordComplexity(
  password: string,
  options: PasswordPolicyOptions = {}
): void {
  if (typeof password !== 'string' || password.length === 0) {
    throw new PasswordPolicyError('Password is required.')
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new PasswordPolicyError(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
    )
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new PasswordPolicyError('Password is too long.')
  }
  if (isSingleRepeatedChar(password)) {
    throw new PasswordPolicyError('Password is too simple.')
  }

  const normalized = password.trim().toLowerCase()
  if (COMMON_PASSWORDS.has(normalized)) {
    throw new PasswordPolicyError('This password is too common. Choose a stronger one.')
  }

  const username = options.username?.trim().toLowerCase()
  if (username && username.length >= 3 && normalized.includes(username)) {
    throw new PasswordPolicyError('Password must not contain your username.')
  }

  // Shorter secrets must mix character classes; long passphrases are exempt.
  if (password.length < PASSPHRASE_LENGTH && classesOf(password) < 3) {
    throw new PasswordPolicyError(
      'Use at least 3 of: lowercase, uppercase, number, symbol — or a longer passphrase.'
    )
  }
}

/**
 * Returns the number of times this password appears in known breaches, or
 * `null` if the check was skipped or could not be completed (fail-open).
 */
export async function breachCount(password: string): Promise<number | null> {
  try {
    const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase()
    const prefix = sha1.slice(0, 5)
    const suffix = sha1.slice(5)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HIBP_TIMEOUT_MS)
    let text: string
    try {
      const res = await fetch(`${HIBP_RANGE_URL}${prefix}`, {
        headers: { 'Add-Padding': 'true' },
        signal: controller.signal
      })
      if (!res.ok) return null
      text = await res.text()
    } finally {
      clearTimeout(timer)
    }

    for (const line of text.split('\n')) {
      const [hashSuffix, countRaw] = line.trim().split(':')
      if (hashSuffix && hashSuffix.toUpperCase() === suffix) {
        const count = Number.parseInt(countRaw ?? '0', 10)
        return Number.isFinite(count) ? count : 0
      }
    }
    return 0
  } catch {
    // Network/timeout/DNS failure — do not block credential setting.
    return null
  }
}

/**
 * Full policy gate: complexity (always) + breach check (opt-in, fail-open).
 * Throws {@link PasswordPolicyError} on the first failing rule.
 */
export async function enforcePasswordPolicy(
  password: string,
  options: PasswordPolicyOptions = {}
): Promise<void> {
  assertPasswordComplexity(password, options)

  const breachEnabled = options.breachCheck ?? process.env.PASSWORD_BREACH_CHECK === 'true'
  if (!breachEnabled) return

  const count = await breachCount(password)
  if (count && count > 0) {
    throw new PasswordPolicyError(
      'This password has appeared in a known data breach. Choose a different one.'
    )
  }
}

export default enforcePasswordPolicy
