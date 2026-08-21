import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config } from 'dotenv'
import { defineConfig } from 'prisma/config'

function loadEnv(): void {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env')
  ]
  for (const file of candidates) {
    if (existsSync(file)) {
      config({ path: file })
      return
    }
  }
  config()
}

loadEnv()

/**
 * Prefer Windows Auth when USE_TRUSTED_CONNECTION is enabled; otherwise SQL auth.
 */
function resolveMigrateUrl(): string {
  const useTrusted =
    process.env.USE_TRUSTED_CONNECTION === 'true' ||
    process.env.USE_TRUSTED_CONNECTION === '1'

  const url = useTrusted
    ? process.env.DATABASE_URL_TRUSTED
    : process.env.DATABASE_URL

  // `prisma generate` must work without a live .env (e.g. fresh clone / CI install).
  // migrate/deploy still require a real connection string in .env.
  return (
    url ||
    'sqlserver://localhost:1433;database=SecureVault;user=placeholder;password=placeholder;encrypt=true;trustServerCertificate=true'
  )
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations'
  },
  datasource: {
    url: resolveMigrateUrl()
  }
})
