import { FileQueryService } from '@securevault/core'
import type { MultipartFile } from '@fastify/multipart'
import { createReadStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { extname } from 'node:path'
import type { Readable } from 'node:stream'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { apiConfig } from '../config'
import { getVaultFileService } from '../filesContext'
import { HttpError, sendError } from '../httpErrors'
import { requireSession } from '../plugins/auth'
import {
  downloadFileBodySchema,
  fileIdParamsSchema,
  listFilesQuerySchema,
  moveOrCopyBodySchema,
  renameFileBodySchema,
  searchQuerySchema,
  uploadFieldsSchema
} from '../schemas/files'

function multipartValue(
  fields: Record<string, unknown> | undefined,
  name: string
): string {
  if (!fields) return ''
  const raw = fields[name]
  if (raw == null) return ''
  const first = Array.isArray(raw) ? raw[0] : raw
  if (typeof first === 'string') return first
  if (first && typeof first === 'object' && 'value' in first) {
    return String((first as { value: unknown }).value ?? '')
  }
  return String(first)
}

async function drainStream(stream: Readable): Promise<void> {
  await new Promise<void>((resolve) => {
    stream.on('error', () => resolve())
    stream.on('end', () => resolve())
    stream.on('close', () => resolve())
    stream.resume()
  })
}

function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  const encoded = encodeURIComponent(fileName)
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

/** Content types that a browser may execute/script if rendered inline. */
const UNSAFE_INLINE_TYPES = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'text/xml',
  'application/xml',
  'text/javascript',
  'application/javascript',
  'application/ecmascript',
  'text/ecmascript'
])

/**
 * Never return a user-uploaded file with a content type the browser might
 * execute as HTML/script. Such types are downgraded to an opaque binary type so
 * the response is downloaded, not rendered.
 */
function safeResponseContentType(mime: string | null): string {
  const value = (mime || '').trim().toLowerCase()
  if (!value || UNSAFE_INLINE_TYPES.has(value.split(';')[0].trim())) {
    return 'application/octet-stream'
  }
  return mime as string
}

function downloadFileName(displayName: string, originalFileName: string): string {
  const originalExt = extname(originalFileName)
  const base = displayName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 180) || 'file'
  if (originalExt && extname(base).toLowerCase() !== originalExt.toLowerCase()) {
    return `${base}${originalExt}`
  }
  return base
}

export async function registerFileRoutes(app: FastifyInstance): Promise<void> {
  const listed = FileQueryService.getInstance()
  const vault = getVaultFileService()
  const r = app.withTypeProvider<ZodTypeProvider>()

  r.get('/api/files', { schema: { querystring: listFilesQuerySchema } }, async (request, reply) => {
    try {
      const session = requireSession(request)
      return await listed.listFiles(session.userId, {
        folderId: request.query.folderId,
        categoryId: request.query.categoryId
      })
    } catch (error) {
      return sendError(reply, error)
    }
  })

  r.get('/api/search', { schema: { querystring: searchQuerySchema } }, async (request, reply) => {
    try {
      const session = requireSession(request)
      return await listed.search(session.userId, request.query.q)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  r.post(
    '/api/files',
    { bodyLimit: apiConfig.maxUploadBytes },
    async (request, reply) => {
    let uploaded: MultipartFile | undefined
    try {
      const session = requireSession(request)
      uploaded = await request.file()
      if (!uploaded || uploaded.fieldname !== 'file') {
        if (uploaded?.file) await drainStream(uploaded.file)
        throw new HttpError(400, 'A file part named "file" is required.')
      }

      const parsed = uploadFieldsSchema.safeParse({
        displayName: multipartValue(uploaded.fields, 'displayName'),
        categoryId: multipartValue(uploaded.fields, 'categoryId'),
        folderId: multipartValue(uploaded.fields, 'folderId') || undefined
      })
      if (!parsed.success) {
        await drainStream(uploaded.file)
        throw new HttpError(400, 'Invalid request.')
      }

      const record = await vault.addFile({
        userId: session.userId,
        displayName: parsed.data.displayName,
        categoryId: parsed.data.categoryId,
        folderId: parsed.data.folderId ?? null,
        originalFileName: uploaded.filename || 'upload.bin',
        mimeType: uploaded.mimetype || null,
        body: uploaded.file
      })

      return reply.status(201).send(record)
    } catch (error) {
      if (uploaded?.file.readable) {
        await drainStream(uploaded.file)
      }
      return sendError(reply, error)
    }
  })

  r.post(
    '/api/files/:fileId/download',
    { schema: { params: fileIdParamsSchema, body: downloadFileBodySchema } },
    async (request, reply) => {
    let tempPath: string | null = null
    try {
      const session = requireSession(request)
      const { fileId } = request.params
      const { password, intent } = request.body

      const downloaded = await vault.downloadToTemp(session.userId, fileId, password, {
        kek: session.kek,
        intent: intent === 'download' || intent === 'copy' ? 'copy' : 'view'
      })
      tempPath = downloaded.tempPath
      const name = downloadFileName(downloaded.displayName, downloaded.originalFileName)

      reply.header('Content-Type', safeResponseContentType(downloaded.mimeType))
      reply.header('Content-Disposition', contentDisposition(name))
      reply.header('X-Checksum-SHA256', downloaded.checksum)
      reply.header('X-Content-Type-Options', 'nosniff')
      reply.header('Content-Security-Policy', "default-src 'none'; sandbox")

      const stream = createReadStream(downloaded.tempPath)
      const cleanup = (): void => {
        if (!tempPath) return
        const path = tempPath
        tempPath = null
        unlink(path).catch(() => undefined)
      }
      stream.on('close', cleanup)
      stream.on('error', cleanup)
      return reply.send(stream)
    } catch (error) {
      if (tempPath) {
        await unlink(tempPath).catch(() => undefined)
      }
      return sendError(reply, error)
    }
  })

  r.delete(
    '/api/files/:fileId',
    { schema: { params: fileIdParamsSchema } },
    async (request, reply) => {
      try {
        const session = requireSession(request)
        return await vault.deleteFile(session.userId, request.params.fileId)
      } catch (error) {
        return sendError(reply, error)
      }
    }
  )

  r.post(
    '/api/files/:fileId/move',
    { schema: { params: fileIdParamsSchema, body: moveOrCopyBodySchema } },
    async (request, reply) => {
      try {
        const session = requireSession(request)
        return await vault.moveFile(session.userId, {
          fileId: request.params.fileId,
          targetFolderId: request.body.targetFolderId
        })
      } catch (error) {
        return sendError(reply, error)
      }
    }
  )

  r.post(
    '/api/files/:fileId/copy',
    { schema: { params: fileIdParamsSchema, body: moveOrCopyBodySchema } },
    async (request, reply) => {
      try {
        const session = requireSession(request)
        return await vault.copyFile(session.userId, {
          fileId: request.params.fileId,
          targetFolderId: request.body.targetFolderId
        })
      } catch (error) {
        return sendError(reply, error)
      }
    }
  )

  r.post(
    '/api/files/:fileId/rename',
    { schema: { params: fileIdParamsSchema, body: renameFileBodySchema } },
    async (request, reply) => {
      try {
        const session = requireSession(request)
        return await vault.renameFile(session.userId, {
          fileId: request.params.fileId,
          displayName: request.body.displayName
        })
      } catch (error) {
        return sendError(reply, error)
      }
    }
  )
}
