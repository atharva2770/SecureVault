import { isAbsolute, relative, resolve, sep } from 'node:path'

/**
 * Resolves `candidate` and throws unless it is the root itself or a path inside it.
 * Uses path.relative so drive-letter jumps on Windows cannot bypass the prefix check.
 */
export function assertPathInsideRoot(rootDir: string, candidate: string): string {
  const root = resolve(rootDir)
  const abs = resolve(candidate)
  const rel = relative(root, abs)
  if (rel === '') return abs

  const first = rel.split(/[/\\]/)[0]
  if (first === '..' || isAbsolute(rel)) {
    throw new Error('Invalid blob path.')
  }
  // Defence in depth: prefix check after resolve.
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`
  if (!abs.startsWith(prefix) && abs !== root) {
    throw new Error('Invalid blob path.')
  }
  return abs
}
