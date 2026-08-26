import type { FastifyInstance } from 'fastify'

import { apiConfig } from '../config'

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH'])

function mediaType(header: string | string[] | undefined): string {
  const raw = Array.isArray(header) ? header[0] : header
  return (raw ?? '').split(';')[0].trim().toLowerCase()
}

/**
 * JSON routes must send application/json. The file upload route is the only
 * multipart endpoint. POSTs with no body (logout/touch/sidebar) may omit Content-Type.
 */
export async function registerContentTypeGuard(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (request, reply) => {
    if (!BODY_METHODS.has(request.method)) return

    const path = request.url.split('?')[0] ?? request.url
    const ct = mediaType(request.headers['content-type'])
    const lengthRaw = request.headers['content-length']
    const length = lengthRaw ? Number(lengthRaw) : 0
    const hasBody = Number.isFinite(length) && length > 0

    if (path === '/api/files' && request.method === 'POST') {
      if (ct !== 'multipart/form-data') {
        return reply.status(415).send({ error: 'Unsupported content type.' })
      }
      return
    }

    if (!hasBody && !ct) return

    if (ct && ct !== 'application/json') {
      return reply.status(415).send({ error: 'Unsupported content type.' })
    }

    if (hasBody && ct !== 'application/json') {
      return reply.status(415).send({ error: 'Unsupported content type.' })
    }

    if (hasBody && length > apiConfig.jsonBodyLimitBytes) {
      return reply.status(413).send({ error: 'Request too large.' })
    }
  })
}
