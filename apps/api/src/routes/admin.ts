import { AdminService } from '@securevault/core'
import type { FastifyInstance } from 'fastify'

import { sendError } from '../httpErrors'
import { requireSession } from '../plugins/auth'

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  const admin = AdminService.getInstance()

  app.get('/api/admin/users', async (request, reply) => {
    try {
      return await admin.listUsers(requireSession(request).userId)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/users', async (request, reply) => {
    try {
      const session = requireSession(request)
      const body = (request.body ?? {}) as {
        username?: string
        password?: string
        roleCode?: string
        grantAllCategoryRoots?: boolean
        folderIds?: string[]
      }
      return await admin.createUser(session.userId, {
        username: body.username ?? '',
        password: body.password ?? '',
        roleCode: body.roleCode ?? 'MEMBER',
        grantAllCategoryRoots: body.grantAllCategoryRoots,
        folderIds: Array.isArray(body.folderIds) ? body.folderIds : undefined
      })
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.patch('/api/admin/users/:userId/roles', async (request, reply) => {
    try {
      const session = requireSession(request)
      const { userId } = request.params as { userId: string }
      const body = (request.body ?? {}) as { roleCodes?: string[] }
      return await admin.setUserRoles(session.userId, {
        userId,
        roleCodes: body.roleCodes ?? []
      })
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.patch('/api/admin/users/:userId/disabled', async (request, reply) => {
    try {
      const session = requireSession(request)
      const { userId } = request.params as { userId: string }
      const body = (request.body ?? {}) as { isDisabled?: boolean }
      return await admin.setUserDisabled(session.userId, userId, Boolean(body.isDisabled))
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.get('/api/admin/users/:userId/folder-access', async (request, reply) => {
    try {
      const session = requireSession(request)
      const { userId } = request.params as { userId: string }
      return await admin.getUserFolderAccess(session.userId, userId)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.put('/api/admin/users/:userId/folder-access', async (request, reply) => {
    try {
      const session = requireSession(request)
      const { userId } = request.params as { userId: string }
      const body = (request.body ?? {}) as { folderIds?: string[] }
      return await admin.setUserFolderAccess(session.userId, userId, body.folderIds ?? [])
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.get('/api/admin/roles', async (request, reply) => {
    try {
      return await admin.listRoles(requireSession(request).userId)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.get('/api/admin/folders', async (request, reply) => {
    try {
      return await admin.listAclFolders(requireSession(request).userId)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.get('/api/admin/folders/:folderId/acls', async (request, reply) => {
    try {
      const session = requireSession(request)
      const { folderId } = request.params as { folderId: string }
      return await admin.listFolderAcls(session.userId, folderId)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.put('/api/admin/folders/:folderId/acls', async (request, reply) => {
    try {
      const session = requireSession(request)
      const { folderId } = request.params as { folderId: string }
      const body = (request.body ?? {}) as {
        principalType?: 'USER' | 'ROLE'
        principalId?: string
        canView?: boolean
        canEdit?: boolean
        canCopy?: boolean
        canDelete?: boolean
        inherit?: boolean
      }
      return await admin.setFolderAcl(session.userId, {
        folderId,
        principalType: body.principalType === 'ROLE' ? 'ROLE' : 'USER',
        principalId: body.principalId ?? '',
        canView: Boolean(body.canView),
        canEdit: Boolean(body.canEdit),
        canCopy: Boolean(body.canCopy),
        canDelete: Boolean(body.canDelete),
        inherit: body.inherit
      })
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.delete('/api/admin/acls/:folderAclId', async (request, reply) => {
    try {
      const session = requireSession(request)
      const { folderAclId } = request.params as { folderAclId: string }
      return await admin.revokeFolderAcl(session.userId, folderAclId)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.get('/api/admin/my-access', async (request, reply) => {
    try {
      return await admin.getMyAccess(requireSession(request).userId)
    } catch (error) {
      return sendError(reply, error)
    }
  })
}
