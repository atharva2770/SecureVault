import { PrismaMssql } from '@prisma/adapter-mssql'
import { PrismaClient } from '@prisma/client'

import { resolveDatabaseUrl, usesTrustedConnection } from './env'

/**
 * Singleton Prisma database service for desktop main process and the future API.
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
    return usesTrustedConnection()
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
