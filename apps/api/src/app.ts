import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import Fastify from 'fastify'

import { apiConfig } from './config'
import { registerAuthGuard } from './plugins/auth'
import { registerAdminRoutes } from './routes/admin'
import { registerAuthRoutes } from './routes/auth'
import { registerFileRoutes } from './routes/files'
import { registerFolderRoutes } from './routes/folders'

export async function buildApi() {
  const app = Fastify({
    logger: true,
    bodyLimit: apiConfig.maxUploadBytes
  })

  await app.register(cors, {
    origin: apiConfig.webOrigin,
    credentials: true
  })

  await app.register(cookie, {
    secret: apiConfig.cookieSecret
  })

  await app.register(multipart, {
    limits: {
      files: 1,
      fileSize: apiConfig.maxUploadBytes,
      fields: 16,
      fieldSize: 16 * 1024
    }
  })

  await registerAuthGuard(app)
  await registerAuthRoutes(app)
  await registerFolderRoutes(app)
  await registerFileRoutes(app)
  await registerAdminRoutes(app)

  app.get('/health', async () => ({
    ok: true,
    service: 'securevault-api',
    blobs: true,
    kms: 'local'
  }))

  return app
}
