import { FileQueryService } from '@securevault/core'
import type { MultipartFile } from '@fastify/multipart'
import { createReadStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { apiConfig } from '../config'
import { getVaultFileService } from '../filesContext'
import { HttpError, sendError } from '../httpErrors'
import { requireAdmin, requireSession } from '../plugins/auth'
import {
  downloadFileBodySchema,
  fileIdParamsSchema,
  listFilesQuerySchema,
  moveOrCopyBodySchema,
  renameFileBodySchema,
  searchQuerySchema,
  folderSearchQuerySchema,
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

/**
 * Collect multipart text fields and the file part.
 * The file is always buffered so the multipart iterator can finish cleanly
 * (breaking early leaves the file stream aborted and crashes the API).
 */
async function readMultipartUpload(request: FastifyRequest): Promise<{
  uploaded: MultipartFile
  body: Readable
  fields: Record<string, string>
}> {
  const fields: Record<string, string> = {}
  let uploaded: MultipartFile | undefined
  let fileBuffer: Buffer | undefined

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      if (part.fieldname !== 'file' || uploaded) {
        await drainStream(part.file)
        continue
      }
      uploaded = part
      fileBuffer = await part.toBuffer()
    } else {
      fields[part.fieldname] = String(part.value ?? '')
    }
  }

  if (!uploaded || !fileBuffer) {
    throw new HttpError(400, 'A file part named "file" is required.')
  }

  const body = Readable.from(fileBuffer)
  body.on('error', () => {
    /* absorbed — handler below maps failures to HTTP errors */
  })

  return {
    uploaded,
    body,
    fields
  }
}

function contentDisposition(fileName: string, kind: 'inline' | 'attachment'): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  const encoded = encodeURIComponent(fileName)
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`
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
      return await listed.searchGlobal(session.userId, {
        q: request.query.q,
        cursor: request.query.cursor,
        limit: request.query.limit
      })
    } catch (error) {
      return sendError(reply, error)
    }
  })

  r.get(
    '/api/search/folder',
    { schema: { querystring: folderSearchQuerySchema } },
    async (request, reply) => {
      try {
        const session = requireSession(request)
        const include = request.query.includeSubfolders
        return await listed.searchInFolder(session.userId, {
          folderId: request.query.folderId,
          q: request.query.q,
          includeSubfolders: include === 'true' || include === '1',
          cursor: request.query.cursor,
          limit: request.query.limit
        })
      } catch (error) {
        return sendError(reply, error)
      }
    }
  )

  r.post(
    '/api/files',
    { bodyLimit: apiConfig.maxUploadBytes },
    async (request, reply) => {
    let body: Readable | undefined
    try {
      const session = requireSession(request)
      requireAdmin(request)
      const upload = await readMultipartUpload(request)
      body = upload.body
      const uploaded = upload.uploaded

      const parsed = uploadFieldsSchema.safeParse({
        displayName: upload.fields.displayName || multipartValue(uploaded.fields, 'displayName'),
        categoryId:
          upload.fields.categoryId || multipartValue(uploaded.fields, 'categoryId') || undefined,
        folderId: upload.fields.folderId || multipartValue(uploaded.fields, 'folderId') || undefined
      })
      if (!parsed.success) {
        if (body.readable) await drainStream(body)
        const folderMissing = Boolean(parsed.error.flatten().fieldErrors.folderId)
        throw new HttpError(400, folderMissing ? 'Choose a destination folder.' : 'Invalid request.')
      }

      const record = await vault.addFile({
        userId: session.userId,
        displayName: parsed.data.displayName,
        categoryId: parsed.data.categoryId ?? '',
        folderId: parsed.data.folderId,
        originalFileName: uploaded.filename || 'upload.bin',
        mimeType: uploaded.mimetype || null,
        body,
        maxBytes: apiConfig.maxUploadBytes
      })

      return reply.status(201).send(record)
    } catch (error) {
      if (body?.readable) {
        await drainStream(body)
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

      if (intent === 'download' || intent === 'copy') {
        throw new HttpError(403, 'Downloads are disabled.')
      }

      const downloaded = await vault.downloadToTemp(session.userId, fileId, password, {
        kek: session.kek,
        intent: 'view'
      })
      tempPath = downloaded.tempPath
      const name = downloadFileName(downloaded.displayName, downloaded.originalFileName)

      reply.header('Content-Type', safeResponseContentType(downloaded.mimeType))
      reply.header('Content-Disposition', contentDisposition(name, 'inline'))
      reply.header('Cache-Control', 'no-store')
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
        const session = requireAdmin(request)
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
        const session = requireAdmin(request)
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
