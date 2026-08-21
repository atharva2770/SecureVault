import { FileQueryService } from '@securevault/core'
import type { FastifyInstance } from 'fastify'

import { sendError } from '../httpErrors'
import { requireSession } from '../plugins/auth'

export async function registerFileRoutes(app: FastifyInstance): Promise<void> {
  const files = FileQueryService.getInstance()

  app.get('/api/files', async (request, reply) => {
    try {
      const session = requireSession(request)
      const query = request.query as { folderId?: string; categoryId?: string }
      return await files.listFiles(session.userId, {
        folderId: query.folderId || undefined,
        categoryId: query.categoryId || undefined
      })
    } catch (error) {
      return sendError(reply, error)
    }
  })
}
