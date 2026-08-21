import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Overwrites a Buffer in-place with zeroes so key material does not linger.
 */
export function secureZero(buffer: Buffer | null | undefined): void {
  if (buffer && buffer.length > 0) {
    buffer.fill(0)
  }
}

/**
 * SHA-256 hex digest (used as a KEK verifier — never store the KEK itself).
 */
export function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * Constant-time compare of two hex strings.
 */
export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a.toLowerCase(), 'utf8')
  const right = Buffer.from(b.toLowerCase(), 'utf8')
  if (left.length !== right.length) {
    return false
  }
  return timingSafeEqual(left, right)
}
