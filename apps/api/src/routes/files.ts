import { FileQueryService } from '@securevault/core'
import type { MultipartFile } from '@fastify/multipart'
import { createReadStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { extname } from 'node:path'
import type { Readable } from 'node:stream'
import type { FastifyInstance } from 'fastify'

import { getVaultFileService } from '../filesContext'
import { HttpError, sendError } from '../httpErrors'
import { requireSession } from '../plugins/auth'

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

  app.get('/api/files', async (request, reply) => {
    try {
      const session = requireSession(request)
      const query = request.query as { folderId?: string; categoryId?: string }
      return await listed.listFiles(session.userId, {
        folderId: query.folderId || undefined,
        categoryId: query.categoryId || undefined
      })
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/files', async (request, reply) => {
    let uploaded: MultipartFile | undefined
    try {
      const session = requireSession(request)
      uploaded = await request.file()
      if (!uploaded || uploaded.fieldname !== 'file') {
        if (uploaded?.file) await drainStream(uploaded.file)
        throw new HttpError(400, 'A file part named "file" is required.')
      }

      const displayName = multipartValue(uploaded.fields, 'displayName')
      const categoryId = multipartValue(uploaded.fields, 'categoryId')
      const folderId = multipartValue(uploaded.fields, 'folderId') || null

      if (!displayName || !categoryId) {
        await drainStream(uploaded.file)
        throw new HttpError(400, 'displayName and categoryId are required.')
      }

      const record = await vault.addFile({
        userId: session.userId,
        displayName,
        categoryId,
        folderId,
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

  app.post('/api/files/:fileId/download', async (request, reply) => {
    let tempPath: string | null = null
    try {
      const session = requireSession(request)
      const { fileId } = request.params as { fileId: string }
      const body = (request.body ?? {}) as { password?: string; intent?: string }
      const password = body.password?.trim() ?? ''
      if (!password) {
        throw new HttpError(400, 'File password is required.')
      }

      const downloaded = await vault.downloadToTemp(session.userId, fileId, password, {
        kek: session.kek,
        intent: body.intent === 'download' ? 'copy' : 'view'
      })
      tempPath = downloaded.tempPath
      const name = downloadFileName(downloaded.displayName, downloaded.originalFileName)

      reply.header('Content-Type', downloaded.mimeType || 'application/octet-stream')
      reply.header('Content-Disposition', contentDisposition(name))
      reply.header('X-Checksum-SHA256', downloaded.checksum)
      reply.header('X-Content-Type-Options', 'nosniff')

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

  app.delete('/api/files/:fileId', async (request, reply) => {
    try {
      const session = requireSession(request)
      const { fileId } = request.params as { fileId: string }
      return await vault.deleteFile(session.userId, fileId)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/files/:fileId/move', async (request, reply) => {
    try {
      const session = requireSession(request)
      const { fileId } = request.params as { fileId: string }
      const body = (request.body ?? {}) as { targetFolderId?: string }
      return await vault.moveFile(session.userId, {
        fileId,
        targetFolderId: body.targetFolderId ?? ''
      })
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/files/:fileId/copy', async (request, reply) => {
    try {
      const session = requireSession(request)
      const { fileId } = request.params as { fileId: string }
      const body = (request.body ?? {}) as { targetFolderId?: string }
      return await vault.copyFile(session.userId, {
        fileId,
        targetFolderId: body.targetFolderId ?? ''
      })
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/files/:fileId/rename', async (request, reply) => {
    try {
      const session = requireSession(request)
      const { fileId } = request.params as { fileId: string }
      const body = (request.body ?? {}) as { displayName?: string }
      return await vault.renameFile(session.userId, {
        fileId,
        displayName: body.displayName ?? ''
      })
    } catch (error) {
      return sendError(reply, error)
    }
  })
}
