import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { PasswordPolicyError, UnsupportedUploadTypeError, UploadTooLargeError } from '@securevault/core'

export class HttpError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
  }
}

const PUBLIC_BY_STATUS: Record<number, string> = {
  400: 'Invalid request.',
  401: 'Vault is locked. Sign in to continue.',
  403: 'Access denied.',
  404: 'Not found.',
  413: 'Request too large.',
  415: 'Unsupported content type.',
  429: 'Too many attempts. Please wait and try again.',
  500: 'Something went wrong.',
  503: 'Search is unavailable.'
}

const PUBLIC_MESSAGES = new Set([
  'Invalid username or password.',
  'This account is disabled.',
  'Username is already taken.',
  'Username must be between 3 and 100 characters.',
  'Current password is incorrect.',
  'Incorrect file password.',
  'Access denied.',
  'Access denied. Admin privileges required.',
  'Access denied. Only admins can upload files.',
  'Access denied. Only admins can create categories.',
  'Choose a destination folder.',
  'Vault is locked. Sign in to continue.',
  'Too many attempts. Please wait and try again.',
  'Invalid or missing security token.',
  'A file part named "file" is required.',
  'displayName and categoryId are required.',
  'File password is required.',
  'File name is required.',
  'File name is too long.',
  'Folder name must be between 1 and 255 characters.',
  'A folder with that name already exists here.',
  'Category folders cannot be deleted.',
  'Folder is not empty. Delete or move subfolders first.',
  'Folder is not empty. Delete or move files first.',
  'Parent folder not found.',
  'Folder not found.',
  'File not found.',
  'Category folder not found.',
  'Folder not found for this file type.',
  'Search is unavailable.',
  'File type is not allowed.',
  'Empty files cannot be uploaded.',
  'Request too large.',
  'Destination folder not found in this category.',
  'A file with that name already exists in this folder.',
  'Target folder is required.',
  'You cannot disable your own account.',
  'You cannot remove your own Admin role.',
  'Only an Admin can create another Admin.',
  'Only an Admin can assign the Admin role.',
  'ACL entry not found.',
  'User not found.',
  'Role not found.',
  'No valid roles provided.',
  'userId is required.',
  'folderId is required.',
  'principalId is required.',
  'A category with this code already exists.',
  'Category name must be between 1 and 100 characters.',
  'Category code is invalid.',
  'Subfolders must be created under a file category.',
  'Downloads are disabled.'
])

function looksInternal(message: string): boolean {
  const lower = message.toLowerCase()
  return /prisma|sqlserver|eoent|econn|errno|queryraw|executeraw|stack|wrap key|argon2| at [a-z0-9_./\\-]+:\d+/i.test(
    lower
  )
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = (error as NodeJS.ErrnoException).code
  return error.name === 'AbortError' || code === 'ABORT_ERR'
}

function statusFromMessage(message: string): number {
  const lower = message.toLowerCase()
  if (lower === 'access denied.' || lower.includes('admin privileges') || lower.includes('only admins')) {
    return 403
  }
  if (lower.includes('search is unavailable')) return 503
  if (lower.includes('too many')) return 429
  if (lower.includes('request too large') || lower.includes('payload too large')) return 413
  if (lower.includes('not found')) return 404
  if (lower.includes('incorrect file password')) return 403
  if (
    lower.includes('required') ||
    lower.includes('already') ||
    lower.includes('must be') ||
    lower.includes('invalid') ||
    lower.includes('incorrect') ||
    lower.includes('disabled') ||
    lower.includes('cannot decrypt') ||
    lower.includes('old desktop app') ||
    lower.includes('was not found on this machine') ||
    lower.includes('too long') ||
    lower.includes('too simple') ||
    lower.includes('too common') ||
    lower.includes('data breach') ||
    lower.includes('passphrase') ||
    lower.includes('not allowed') ||
    lower.includes('empty files')
  ) {
    return 400
  }
  return 500
}

export interface PublicError {
  statusCode: number
  clientMessage: string
  detail: string
}

export function toPublicError(error: unknown): PublicError {
  if (error instanceof HttpError) {
    const detail = error.message
    const clientMessage =
      error.statusCode >= 500 || looksInternal(detail)
        ? (PUBLIC_BY_STATUS[error.statusCode] ?? PUBLIC_BY_STATUS[500])
        : PUBLIC_MESSAGES.has(detail)
          ? detail
          : (PUBLIC_BY_STATUS[error.statusCode] ?? PUBLIC_BY_STATUS[400])
    return { statusCode: error.statusCode, clientMessage, detail }
  }

  if (error instanceof PasswordPolicyError) {
    return { statusCode: 400, clientMessage: error.message, detail: error.message }
  }

  if (error instanceof UnsupportedUploadTypeError) {
    return { statusCode: 400, clientMessage: error.message, detail: error.message }
  }

  if (error instanceof UploadTooLargeError) {
    return { statusCode: 413, clientMessage: error.message, detail: error.message }
  }

  if (isAbortError(error)) {
    return {
      statusCode: 400,
      clientMessage: 'Upload was interrupted. Try again.',
      detail: error instanceof Error ? error.message : 'Upload aborted.'
    }
  }

  const detail = error instanceof Error ? error.message : 'Unexpected error.'
  const statusCode = statusFromMessage(detail)

  if (PUBLIC_MESSAGES.has(detail)) {
    return { statusCode, clientMessage: detail, detail }
  }

  if (statusCode >= 500 || looksInternal(detail)) {
    const safeStatus = statusCode >= 500 ? statusCode : 500
    return {
      statusCode: safeStatus,
      clientMessage: PUBLIC_BY_STATUS[safeStatus] ?? PUBLIC_BY_STATUS[500],
      detail
    }
  }

  return {
    statusCode,
    clientMessage: PUBLIC_BY_STATUS[statusCode] ?? PUBLIC_BY_STATUS[400],
    detail
  }
}

export function toHttpError(error: unknown): HttpError {
  const mapped = toPublicError(error)
  return new HttpError(mapped.statusCode, mapped.clientMessage)
}

export function sendError(reply: FastifyReply, error: unknown): FastifyReply {
  const mapped = toPublicError(error)
  reply.log.warn({ err: error, detail: mapped.detail }, 'request failed')
  return reply.status(mapped.statusCode).send({ error: mapped.clientMessage })
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const anyErr = error as Error & { statusCode?: number; code?: string; validation?: unknown }

    if (
      anyErr.validation ||
      anyErr.code === 'FST_ERR_VALIDATION' ||
      anyErr.code === 'FST_ERR_CTP_INVALID_JSON_BODY'
    ) {
      request.log.warn({ err: error, detail: anyErr.message }, 'validation failed')
      return reply.status(400).send({ error: 'Invalid request.' })
    }

    if (anyErr.code?.startsWith('FST_ERR_') && anyErr.statusCode && anyErr.statusCode < 500) {
      const status = anyErr.statusCode
      request.log.warn({ err: error, code: anyErr.code }, 'fastify client error')
      return reply.status(status).send({
        error: PUBLIC_BY_STATUS[status] ?? PUBLIC_BY_STATUS[400]
      })
    }

    if (anyErr.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
      request.log.warn({ err: error }, 'unsupported content type')
      return reply.status(415).send({ error: PUBLIC_BY_STATUS[415] })
    }

    if (anyErr.code === 'FST_ERR_CTP_BODY_TOO_LARGE' || anyErr.statusCode === 413) {
      request.log.warn({ err: error }, 'body too large')
      return reply.status(413).send({ error: PUBLIC_BY_STATUS[413] })
    }

    const mapped = toPublicError(error)
    request.log.error({ err: error, detail: mapped.detail, reqId: request.id }, 'unhandled request error')
    const status = anyErr.statusCode && anyErr.statusCode >= 400 ? anyErr.statusCode : mapped.statusCode
    const safeStatus = status >= 400 ? status : 500
    return reply.status(safeStatus).send({
      error: safeStatus >= 500 ? PUBLIC_BY_STATUS[500] : mapped.clientMessage
    })
  })
}

export function clientMeta(request: FastifyRequest): string {
  const ip = request.ip || 'unknown'
  const ua = request.headers['user-agent'] || 'unknown'
  return `${ip} ${ua}`.slice(0, 200)
}
