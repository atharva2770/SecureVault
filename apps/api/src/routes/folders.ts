import { FolderService } from '@securevault/core'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { sendError } from '../httpErrors'
import { requireSession } from '../plugins/auth'
import {
  createCategoryBodySchema,
  createFolderBodySchema,
  folderIdParamsSchema
} from '../schemas/folders'

export async function registerFolderRoutes(app: FastifyInstance): Promise<void> {
  const folders = FolderService.getInstance()
  const r = app.withTypeProvider<ZodTypeProvider>()

  r.get('/api/folders', async (request, reply) => {
    try {
      const session = requireSession(request)
      return await folders.listFolders(session.userId)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  r.post('/api/folders', { schema: { body: createFolderBodySchema } }, async (request, reply) => {
    try {
      const session = requireSession(request)
      const { name, parentFolderId } = request.body
      return await folders.createSubfolder(session.userId, name, parentFolderId)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  r.delete(
    '/api/folders/:folderId',
    { schema: { params: folderIdParamsSchema } },
    async (request, reply) => {
      try {
        const session = requireSession(request)
        return await folders.deleteFolder(session.userId, request.params.folderId)
      } catch (error) {
        return sendError(reply, error)
      }
    }
  )

  r.get('/api/categories', async (request, reply) => {
    try {
      const session = requireSession(request)
      return await folders.listCategories(session.userId)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  r.post(
    '/api/categories',
    { schema: { body: createCategoryBodySchema } },
    async (request, reply) => {
      try {
        const session = requireSession(request)
        const { name, code } = request.body
        return await folders.createCategory(session.userId, name, code)
      } catch (error) {
        return sendError(reply, error)
      }
    }
  )

  r.post('/api/sidebar/ensure', async (request, reply) => {
    try {
      const session = requireSession(request)
      return await folders.ensureSidebarStructure(session.userId)
    } catch (error) {
      return sendError(reply, error)
    }
  })
}
