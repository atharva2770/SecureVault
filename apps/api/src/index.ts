import { loadWorkspaceEnv } from '@securevault/db'

import { buildApi } from './app'
import { apiConfig, ConfigError } from './config'

loadWorkspaceEnv()

try {
  const app = await buildApi()
  await app.listen({ port: apiConfig.port, host: apiConfig.host })
  app.log.info(`SecureVault API listening on http://${apiConfig.host}:${apiConfig.port}`)
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message)
    process.exit(1)
  }
  console.error(error)
  process.exit(1)
}
