#!/usr/bin/env node
/**
 * Repairs per-file access passwords after the P0-04 policy change.
 *
 * Files used to hash their display name as an access password, so any file that
 * was ever copied or renamed carries a hash that no longer matches anything and
 * cannot be opened. Under the new policy a category either requires a real
 * password or relies on the folder ACL alone.
 *
 * This clears the hash for files whose category does not require one, which
 * makes them openable again. It never rewrites a hash and never touches a file
 * in a category that does require a password — changing the credential on a
 * Defence or Accounts document is a deliberate admin decision, not a script's.
 *
 *   node scripts/repair-file-passwords.mjs            # dry run, writes nothing
 *   node scripts/repair-file-passwords.mjs --apply    # performs the update
 *
 * Env:
 *   DATABASE_URL              (required unless USE_TRUSTED_CONNECTION is true)
 *   DATABASE_URL_TRUSTED      (required when USE_TRUSTED_CONNECTION is true)
 *   USE_TRUSTED_CONNECTION    default false
 *   REPAIR_APPLY              set to 1/true as an alternative to --apply
 *
 * Idempotent: a second run reports nothing left to do.
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { PrismaMssql } from '@prisma/adapter-mssql'
import { PrismaClient } from '@prisma/client'
import { config } from 'dotenv'

const APPLY =
  process.argv.includes('--apply') ||
  process.env.REPAIR_APPLY === '1' ||
  process.env.REPAIR_APPLY === 'true'

function fail(message) {
  console.error(message)
  process.exit(1)
}

/** Mirrors packages/db/src/env.ts — this script cannot import that TypeScript entrypoint. */
function loadEnv() {
  for (const candidate of [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
    resolve(process.cwd(), '../.env')
  ]) {
    if (existsSync(candidate)) {
      config({ path: candidate, override: false })
      return
    }
  }
  config({ override: false })
}

function databaseUrl() {
  loadEnv()
  const trusted =
    process.env.USE_TRUSTED_CONNECTION === 'true' || process.env.USE_TRUSTED_CONNECTION === '1'
  const key = trusted ? 'DATABASE_URL_TRUSTED' : 'DATABASE_URL'
  const url = process.env[key]
  if (!url || !url.trim()) {
    fail(
      `Missing ${key}.\n` +
        'Set USE_TRUSTED_CONNECTION and the matching connection string in the repo-root .env.'
    )
  }
  return url
}

function fmt(value) {
  return value === null || value === undefined ? 'n/a' : String(value)
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaMssql(databaseUrl()) })

  try {
    const categories = await prisma.fileCategory.findMany({
      select: { categoryId: true, code: true, name: true, requiresFilePassword: true },
      orderBy: { sortOrder: 'asc' }
    })
    const openCategoryIds = categories
      .filter((c) => !c.requiresFilePassword)
      .map((c) => c.categoryId)
    const lockedCategories = categories.filter((c) => c.requiresFilePassword)

    console.log('--- category policy ---')
    for (const category of categories) {
      console.log(
        `  ${category.code.padEnd(16)} ${
          category.requiresFilePassword ? 'password required' : 'ACL only'
        }`
      )
    }

    // 1. Clearable: a stored hash in a category that no longer wants one.
    const clearable = await prisma.file.count({
      where: {
        isDeleted: false,
        accessPasswordHash: { not: null },
        categoryId: { in: openCategoryIds }
      }
    })

    // 2. Needs an admin: a category that requires a password. Reported, never touched.
    const lockedWithHash = await prisma.file.count({
      where: {
        isDeleted: false,
        accessPasswordHash: { not: null },
        categoryId: { in: lockedCategories.map((c) => c.categoryId) }
      }
    })
    const lockedMissingHash = await prisma.file.count({
      where: {
        isDeleted: false,
        accessPasswordHash: null,
        categoryId: { in: lockedCategories.map((c) => c.categoryId) }
      }
    })

    // 3. Unclassifiable: no category at all, so policy cannot be decided here.
    const orphaned = await prisma.file.count({
      where: { isDeleted: false, categoryId: null, accessPasswordHash: { not: null } }
    })

    // Legacy sentinel written by the 20260811183000 migration.
    const sentinel = await prisma.file.count({
      where: { isDeleted: false, accessPasswordHash: 'LEGACY_REQUIRES_REUPLOAD' }
    })

    console.log('\n--- findings ---')
    console.log(`  clearable (ACL-only categories):     ${fmt(clearable)}`)
    console.log(`  of which legacy sentinel rows:       ${fmt(sentinel)}`)
    console.log(`  password-required, hash present:     ${fmt(lockedWithHash)}  (left alone)`)
    console.log(`  password-required, hash MISSING:     ${fmt(lockedMissingHash)}  (needs an admin)`)
    console.log(`  no category, hash present:           ${fmt(orphaned)}  (left alone)`)

    if (lockedMissingHash > 0) {
      const rows = await prisma.file.findMany({
        where: {
          isDeleted: false,
          accessPasswordHash: null,
          categoryId: { in: lockedCategories.map((c) => c.categoryId) }
        },
        select: { fileId: true, displayName: true, categoryId: true },
        take: 50
      })
      console.log('\n--- unopenable, need a password set by an admin ---')
      for (const row of rows) {
        const category = categories.find((c) => c.categoryId === row.categoryId)
        console.log(`  ${row.fileId}  ${category?.code ?? '?'}  ${row.displayName}`)
      }
      if (lockedMissingHash > rows.length) {
        console.log(`  … and ${lockedMissingHash - rows.length} more`)
      }
    }

    if (!APPLY) {
      console.log('\nDry run. Nothing was written. Re-run with --apply to clear the hashes above.')
      return
    }

    if (clearable === 0) {
      console.log('\nNothing to do.')
      return
    }

    const result = await prisma.file.updateMany({
      where: {
        isDeleted: false,
        accessPasswordHash: { not: null },
        categoryId: { in: openCategoryIds }
      },
      data: { accessPasswordHash: null }
    })

    console.log(`\nCleared ${result.count} file password hashes. The folder ACL now governs those.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))
