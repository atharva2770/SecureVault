import { loadWorkspaceEnv } from '@securevault/db'

import { buildApi } from './app'
import { apiConfig } from './config'

loadWorkspaceEnv()

const app = await buildApi()

try {
  await app.listen({ port: apiConfig.port, host: apiConfig.host })
  app.log.info(`SecureVault API listening on http://${apiConfig.host}:${apiConfig.port}`)
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
