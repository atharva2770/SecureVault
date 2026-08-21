import { FolderService } from '@securevault/core'
import type { FastifyInstance } from 'fastify'

import { sendError } from '../httpErrors'
import { requireSession } from '../plugins/auth'

export async function registerFolderRoutes(app: FastifyInstance): Promise<void> {
  const folders = FolderService.getInstance()

  app.get('/api/folders', async (request, reply) => {
    try {
      const session = requireSession(request)
      return await folders.listFolders(session.userId)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/folders', async (request, reply) => {
    try {
      const session = requireSession(request)
      const body = (request.body ?? {}) as { name?: string; parentFolderId?: string }
      return await folders.createSubfolder(
        session.userId,
        body.name ?? '',
        body.parentFolderId ?? ''
      )
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.delete('/api/folders/:folderId', async (request, reply) => {
    try {
      const session = requireSession(request)
      const { folderId } = request.params as { folderId: string }
      return await folders.deleteFolder(session.userId, folderId)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.get('/api/categories', async (request, reply) => {
    try {
      const session = requireSession(request)
      return await folders.listCategories(session.userId)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/categories', async (request, reply) => {
    try {
      const session = requireSession(request)
      const body = (request.body ?? {}) as { name?: string; code?: string }
      return await folders.createCategory(session.userId, body.name ?? '', body.code)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/sidebar/ensure', async (request, reply) => {
    try {
      const session = requireSession(request)
      return await folders.ensureSidebarStructure(session.userId)
    } catch (error) {
      return sendError(reply, error)
    }
  })
}
