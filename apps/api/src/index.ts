import { loadWorkspaceEnv } from '@securevault/db'
import { ensureDocmanDiskLayout } from '@securevault/core'

import { buildApi } from './app'
import { apiConfig, ConfigError } from './config'

loadWorkspaceEnv()

try {
  const app = await buildApi()
  try {
    const root = await ensureDocmanDiskLayout(apiConfig.blobRoot)
    app.log.info(`Docman files store: ${root}`)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to create the Docman files directory.'
    console.error(
      `Cannot create the file store at ${apiConfig.blobRoot}. Attach drive F: or set VAULT_BLOB_ROOT. (${message})`
    )
    process.exit(1)
  }
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
