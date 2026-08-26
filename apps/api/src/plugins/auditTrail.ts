import type { FastifyInstance, FastifyRequest } from 'fastify'

import {
  auditAlreadyRecorded,
  enterAuditContext,
  recordAudit
} from '@securevault/core'

import { classifyAuditAction, resourceFromRequest } from './auditClassify'

function userAgentOf(request: FastifyRequest): string | null {
  const raw = request.headers['user-agent']
  const value = Array.isArray(raw) ? raw[0] : raw
  return value?.trim() ? value.trim().slice(0, 300) : null
}

/**
 * Enters the audit ALS for every request and writes a fallback row when a
 * classified route never called recordAudit. Handlers still call recordAudit
 * for richer file/folder ids; the fallback is what makes logging unskippable.
 */
export async function registerAuditTrail(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', (request, _reply, done) => {
    enterAuditContext({
      userId: null,
      ip: request.ip || null,
      userAgent: userAgentOf(request),
      recorded: false
    })
    done()
  })

  app.addHook('onResponse', (request, reply, done) => {
    try {
      if (auditAlreadyRecorded()) {
        done()
        return
      }
      const action = classifyAuditAction(request, reply.statusCode)
      if (!action) {
        done()
        return
      }
      const resource = resourceFromRequest(request)
      recordAudit({
        action,
        userId: request.vaultSession?.userId ?? null,
        fileId: resource.fileId,
        folderId: resource.folderId,
        categoryId: resource.categoryId,
        details: resource.details
      })
    } catch (error) {
      request.log.warn({ err: error }, 'audit fallback failed')
    }
    done()
  })
}
