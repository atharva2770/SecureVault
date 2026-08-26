import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import type { FastifyRequest } from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'

import { apiConfig } from './config'
import { registerErrorHandler } from './httpErrors'
import { registerAuthGuard } from './plugins/auth'
import { registerContentTypeGuard } from './plugins/contentType'
import { registerCsrf } from './plugins/csrf'
import { registerAdminRoutes } from './routes/admin'
import { registerAuthRoutes } from './routes/auth'
import { registerFileRoutes } from './routes/files'
import { registerFolderRoutes } from './routes/folders'

const DOWNLOAD_PATH = /^\/api\/files\/[^/]+\/download$/

// Brute-force targets get a strict backstop bucket. High-frequency SPA calls
// (session/touch/logout) intentionally stay in the generous default bucket; the
// real per-username/IP login lockout lives in plugins/rateLimit.ts.
const SENSITIVE_AUTH_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/change-password'
])

/** Groups requests into independent rate-limit buckets with distinct budgets. */
function rateLimitGroup(request: FastifyRequest): string {
  const path = request.url.split('?')[0] ?? request.url
  if (SENSITIVE_AUTH_PATHS.has(path)) return 'auth'
  if (path.startsWith('/api/admin/')) return 'admin'
  if (DOWNLOAD_PATH.test(path)) return 'download'
  return 'default'
}

function rateLimitMax(group: string): number {
  switch (group) {
    case 'auth':
      return 30
    case 'admin':
      return 120
    case 'download':
      return 120
    default:
      return 600
  }
}

export async function buildApi() {
  const app = Fastify({
    logger: true,
    bodyLimit: apiConfig.jsonBodyLimitBytes,
    trustProxy: apiConfig.trustProxy
  })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setSchemaErrorFormatter(() => new Error('Invalid request.'))
  registerErrorHandler(app)

  await app.register(helmet, {
    // API responses are JSON; a tight CSP here is defense-in-depth (the SPA host
    // must set its own CSP). The download route overrides this per-response.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"]
      }
    },
    // HSTS only once served over HTTPS (never on localhost/dev).
    hsts: apiConfig.httpsEnabled ? { maxAge: 15552000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    frameguard: { action: 'deny' },
    // Avoid COEP breaking blob/object URL flows used by file preview/download.
    crossOriginEmbedderPolicy: false
  })

  await app.register(rateLimit, {
    global: true,
    timeWindow: '1 minute',
    // Independent bucket per client-IP per route group.
    keyGenerator: (request) => `${request.ip}:${rateLimitGroup(request)}`,
    max: (request) => rateLimitMax(rateLimitGroup(request)),
    allowList: (request) => (request.url.split('?')[0] ?? request.url) === '/health'
  })

  await app.register(cors, {
    origin: apiConfig.webOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-csrf-token'],
    exposedHeaders: ['Content-Disposition', 'X-Checksum-SHA256']
  })

  await app.register(cookie, {
    secret: apiConfig.cookieSecret
  })

  // CSRF must run after the cookie plugin (needs request.cookies) and before routes.
  await registerCsrf(app)
  await registerContentTypeGuard(app)

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
