import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config } from 'dotenv'

/**
 * Loads the workspace `.env` from the repo root or the current working directory.
 * Works when Prisma runs from `packages/db` or the API runs from `apps/api`.
 */
export function loadWorkspaceEnv(): void {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
    resolve(process.cwd(), '../.env')
  ]

  for (const file of candidates) {
    if (existsSync(file)) {
      config({ path: file, override: false })
      return
    }
  }

  config({ override: false })
}

/**
 * Resolves the active SQL Server connection string from environment variables.
 *
 * - When `USE_TRUSTED_CONNECTION=true`, uses `DATABASE_URL_TRUSTED`
 *   (Windows Authentication / trustedConnection).
 * - Otherwise uses the standard `DATABASE_URL` (SQL auth).
 */
export function resolveDatabaseUrl(): string {
  loadWorkspaceEnv()

  const useTrusted =
    process.env.USE_TRUSTED_CONNECTION === 'true' || process.env.USE_TRUSTED_CONNECTION === '1'

  const url = useTrusted ? process.env.DATABASE_URL_TRUSTED : process.env.DATABASE_URL

  if (!url || url.trim().length === 0) {
    const key = useTrusted ? 'DATABASE_URL_TRUSTED' : 'DATABASE_URL'
    throw new Error(
      `Missing ${key}. Set USE_TRUSTED_CONNECTION and the corresponding connection string in the repo-root .env.`
    )
  }

  return url
}

export function usesTrustedConnection(): boolean {
  loadWorkspaceEnv()
  return (
    process.env.USE_TRUSTED_CONNECTION === 'true' || process.env.USE_TRUSTED_CONNECTION === '1'
  )
}
