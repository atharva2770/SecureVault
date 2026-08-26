import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '../../..')
const BANNED = /\$queryRawUnsafe|\$executeRawUnsafe|\$queryRaw\s*\(|\$executeRaw\s*\(/

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, acc)
    else if (full.endsWith('.ts') && !full.endsWith('.test.ts')) acc.push(full)
  }
  return acc
}

describe('prisma query safety', () => {
  it('does not use raw or unsafe SQL APIs', () => {
    const files = walk(join(ROOT, 'packages')).concat(walk(join(ROOT, 'apps')))
    const hits: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      if (BANNED.test(text)) hits.push(file)
    }
    expect(hits).toEqual([])
  })
})
