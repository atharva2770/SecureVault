import { AdminService } from '@securevault/core'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { sendError } from '../httpErrors'
import { requireSession } from '../plugins/auth'
import {
  createUserBodySchema,
  folderAclIdParamsSchema,
  folderIdParamsSchema,
  listAuditLogsQuerySchema,
  setFolderAclBodySchema,
  setUserDisabledBodySchema,
  setUserFolderAccessBodySchema,
  setUserRolesBodySchema,
  userIdParamsSchema
} from '../schemas/admin'

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  const admin = AdminService.getInstance()
  const r = app.withTypeProvider<ZodTypeProvider>()

  r.get('/api/admin/users', async (request, reply) => {
    try {
      return await admin.listUsers(requireSession(request).userId)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  r.post('/api/admin/users', { schema: { body: createUserBodySchema } }, async (request, reply) => {
    try {
      const session = requireSession(request)
      const body = request.body
      return await admin.createUser(session.userId, {
        username: body.username,
        password: body.password,
        roleCode: body.roleCode ?? 'MEMBER',
        grantAllCategoryRoots: body.grantAllCategoryRoots,
        folderIds: body.folderIds,
        folderGrants: body.folderGrants?.map((g) => ({
          folderId: g.folderId,
          canView: g.canView,
          canEdit: g.canEdit,
          canCopy: g.canCopy,
          canDelete: g.canDelete,
          inherit: g.inherit !== false
        }))
      })
    } catch (error) {
      return sendError(reply, error)
    }
  })

  r.patch(
    '/api/admin/users/:userId/roles',
    { schema: { params: userIdParamsSchema, body: setUserRolesBodySchema } },
    async (request, reply) => {
      try {
        const session = requireSession(request)
        return await admin.setUserRoles(session.userId, {
          userId: request.params.userId,
          roleCodes: request.body.roleCodes
        })
      } catch (error) {
        return sendError(reply, error)
      }
    }
  )

  r.patch(
    '/api/admin/users/:userId/disabled',
    { schema: { params: userIdParamsSchema, body: setUserDisabledBodySchema } },
    async (request, reply) => {
      try {
        const session = requireSession(request)
        return await admin.setUserDisabled(
          session.userId,
          request.params.userId,
          request.body.isDisabled
        )
      } catch (error) {
        return sendError(reply, error)
      }
    }
  )

  r.get(
    '/api/admin/users/:userId/folder-access',
    { schema: { params: userIdParamsSchema } },
    async (request, reply) => {
      try {
        const session = requireSession(request)
        return await admin.getUserFolderAccess(session.userId, request.params.userId)
      } catch (error) {
        return sendError(reply, error)
      }
    }
  )

  r.put(
    '/api/admin/users/:userId/folder-access',
    { schema: { params: userIdParamsSchema, body: setUserFolderAccessBodySchema } },
    async (request, reply) => {
      try {
        const session = requireSession(request)
        const body = request.body
        const grants = body.grants
          ? body.grants.map((g) => ({
              folderId: g.folderId,
              canView: g.canView,
              canEdit: g.canEdit,
              canCopy: g.canCopy,
              canDelete: g.canDelete,
              inherit: g.inherit !== false
            }))
          : (body.folderIds ?? []).map((folderId) => ({
              folderId,
              canView: true,
              canEdit: true,
              canCopy: true,
              canDelete: true,
              inherit: true
            }))
        return await admin.setUserFolderAccess(session.userId, request.params.userId, grants)
      } catch (error) {
        return sendError(reply, error)
      }
    }
  )

  r.get('/api/admin/roles', async (request, reply) => {
    try {
      return await admin.listRoles(requireSession(request).userId)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  r.get('/api/admin/folders', async (request, reply) => {
    try {
      return await admin.listAclFolders(requireSession(request).userId)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  r.get(
    '/api/admin/folders/:folderId/acls',
    { schema: { params: folderIdParamsSchema } },
    async (request, reply) => {
      try {
        const session = requireSession(request)
        return await admin.listFolderAcls(session.userId, request.params.folderId)
      } catch (error) {
        return sendError(reply, error)
      }
    }
  )

  r.put(
    '/api/admin/folders/:folderId/acls',
    { schema: { params: folderIdParamsSchema, body: setFolderAclBodySchema } },
    async (request, reply) => {
      try {
        const session = requireSession(request)
        const body = request.body
        return await admin.setFolderAcl(session.userId, {
          folderId: request.params.folderId,
          principalType: body.principalType === 'ROLE' ? 'ROLE' : 'USER',
          principalId: body.principalId,
          canView: Boolean(body.canView),
          canEdit: Boolean(body.canEdit),
          canCopy: Boolean(body.canCopy),
          canDelete: Boolean(body.canDelete),
          inherit: body.inherit
        })
      } catch (error) {
        return sendError(reply, error)
      }
    }
  )

  r.delete(
    '/api/admin/acls/:folderAclId',
    { schema: { params: folderAclIdParamsSchema } },
    async (request, reply) => {
      try {
        const session = requireSession(request)
        return await admin.revokeFolderAcl(session.userId, request.params.folderAclId)
      } catch (error) {
        return sendError(reply, error)
      }
    }
  )

  r.get('/api/admin/my-access', async (request, reply) => {
    try {
      return await admin.getMyAccess(requireSession(request).userId)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  // Append-only: no PATCH/DELETE for audit rows. Retention is a DBA script.
  r.get(
    '/api/admin/audit-logs',
    { schema: { querystring: listAuditLogsQuerySchema } },
    async (request, reply) => {
      try {
        const from = parseOptionalDate(request.query.from)
        const to = parseOptionalDate(request.query.to)
        if (request.query.from && !from) return reply.status(400).send({ error: 'Invalid request.' })
        if (request.query.to && !to) return reply.status(400).send({ error: 'Invalid request.' })
        return await admin.listAuditLogs(requireSession(request).userId, {
          userId: request.query.userId,
          categoryId: request.query.categoryId,
          action: request.query.action,
          from,
          to,
          cursor: request.query.cursor,
          limit: request.query.limit
        })
      } catch (error) {
        return sendError(reply, error)
      }
    }
  )
}

function parseOptionalDate(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}
