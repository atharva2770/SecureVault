import type { FastifyReply, FastifyRequest } from 'fastify'

export class HttpError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
  }
}

export function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error
  const message = error instanceof Error ? error.message : 'Unexpected error.'
  const lower = message.toLowerCase()
  if (lower === 'access denied.' || lower.includes('admin privileges')) {
    return new HttpError(403, message)
  }
  if (lower.includes('too many') || lower.includes('file size')) {
    return new HttpError(429, message)
  }
  if (lower.includes('not found')) {
    return new HttpError(404, message)
  }
  if (lower.includes('incorrect file password')) {
    return new HttpError(403, message)
  }
  if (
    lower.includes('required') ||
    lower.includes('already') ||
    lower.includes('must be') ||
    lower.includes('invalid') ||
    lower.includes('incorrect') ||
    lower.includes('disabled') ||
    lower.includes('cannot be streamed') ||
    lower.includes('too long')
  ) {
    return new HttpError(400, message)
  }
  return new HttpError(500, message)
}

export function sendError(reply: FastifyReply, error: unknown): FastifyReply {
  const mapped = toHttpError(error)
  return reply.status(mapped.statusCode).send({ error: mapped.message })
}

export function clientMeta(request: FastifyRequest): string {
  const ip = request.ip || 'unknown'
  const ua = request.headers['user-agent'] || 'unknown'
  return `${ip} ${ua}`.slice(0, 200)
}
