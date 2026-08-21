import 'dotenv/config'
import { PrismaMssql } from '@prisma/adapter-mssql'
import { PrismaClient } from '@prisma/client'

/**
 * Resolves the active SQL Server connection string from environment variables.
 *
 * - When `USE_TRUSTED_CONNECTION=true`, uses `DATABASE_URL_TRUSTED`
 *   (Windows Authentication / trustedConnection).
 * - Otherwise uses the standard `DATABASE_URL` (SQL auth).
 *
 * @returns A Prisma-compatible SQL Server connection URL.
 * @throws If the selected environment variable is missing or empty.
 */
export function resolveDatabaseUrl(): string {
  const useTrusted =
    process.env.USE_TRUSTED_CONNECTION === 'true' ||
    process.env.USE_TRUSTED_CONNECTION === '1'

  const url = useTrusted
    ? process.env.DATABASE_URL_TRUSTED
    : process.env.DATABASE_URL

  if (!url || url.trim().length === 0) {
    const key = useTrusted ? 'DATABASE_URL_TRUSTED' : 'DATABASE_URL'
    throw new Error(
      `Missing ${key}. Set USE_TRUSTED_CONNECTION and the corresponding connection string in .env.`
    )
  }

  return url
}

/**
 * Singleton Prisma database service for the Electron main process.
 * Uses the Prisma MSSQL driver adapter (required by Prisma ORM v7).
 *
 * Client construction is lazy so app startup / session checks never block on SQL Server.
 */
export class DBService {
  private static instance: DBService | null = null

  private client: PrismaClient | null = null

  private constructor() {}

  /**
   * Returns the shared {@link DBService} instance, creating it on first call.
   */
  static getInstance(): DBService {
    if (!DBService.instance) {
      DBService.instance = new DBService()
    }
    return DBService.instance
  }

  /**
   * Typed Prisma client for querying SecureVault tables.
   */
  get prisma(): PrismaClient {
    if (!this.client) {
      const adapter = new PrismaMssql(resolveDatabaseUrl())
      this.client = new PrismaClient({ adapter })
    }
    return this.client
  }

  /**
   * Whether the active connection uses Windows trusted authentication.
   */
  get usesTrustedConnection(): boolean {
    return (
      process.env.USE_TRUSTED_CONNECTION === 'true' ||
      process.env.USE_TRUSTED_CONNECTION === '1'
    )
  }

  /**
   * Disconnects the Prisma client and clears the singleton (for tests / shutdown).
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.$disconnect()
      this.client = null
    }
    DBService.instance = null
  }
}

export default DBService
