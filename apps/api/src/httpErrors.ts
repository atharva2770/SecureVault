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
  if (message === 'Access denied.' || message.includes('Admin privileges')) {
    return new HttpError(403, message)
  }
  if (message.includes('Too many')) {
    return new HttpError(429, message)
  }
  if (message.includes('not found') || message.includes('not Found')) {
    return new HttpError(404, message)
  }
  if (
    message.includes('required') ||
    message.includes('already') ||
    message.includes('must be') ||
    message.includes('Invalid') ||
    message.includes('incorrect') ||
    message.includes('disabled')
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
