import { Readable, Transform } from 'node:stream'
import { extname } from 'node:path'

const PEEK_BYTES = 512

export class UnsupportedUploadTypeError extends Error {
  constructor(message = 'File type is not allowed.') {
    super(message)
    this.name = 'UnsupportedUploadTypeError'
  }
}

export class UploadTooLargeError extends Error {
  constructor() {
    super('Request too large.')
    this.name = 'UploadTooLargeError'
  }
}

function startsWith(buf: Buffer, bytes: number[]): boolean {
  if (buf.length < bytes.length) return false
  return bytes.every((b, i) => buf[i] === b)
}

function asciiPrefix(buf: Buffer, n: number): string {
  return buf.subarray(0, Math.min(n, buf.length)).toString('latin1')
}

/**
 * Classify an upload from content, not the client-supplied MIME or extension.
 * Dangerous executables and markup are rejected. Known documents/images/zip
 * families are kept. Unknown binaries are stored as application/octet-stream
 * (they are encrypted at rest).
 */
export function sniffUploadMime(prefix: Buffer, originalFileName = ''): string {
  if (!prefix.length) {
    throw new UnsupportedUploadTypeError('Empty files cannot be uploaded.')
  }

  // Executables / native images
  if (startsWith(prefix, [0x4d, 0x5a])) {
    throw new UnsupportedUploadTypeError() // MZ / PE
  }
  if (startsWith(prefix, [0x7f, 0x45, 0x4c, 0x46])) {
    throw new UnsupportedUploadTypeError() // ELF
  }
  if (startsWith(prefix, [0xca, 0xfe, 0xba, 0xbe]) || startsWith(prefix, [0xcf, 0xfa, 0xed, 0xfe])) {
    throw new UnsupportedUploadTypeError() // Mach-O
  }

  if (asciiPrefix(prefix, 5).startsWith('%PDF-')) return 'application/pdf'
  if (startsWith(prefix, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(prefix, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (asciiPrefix(prefix, 6) === 'GIF87a' || asciiPrefix(prefix, 6) === 'GIF89a') return 'image/gif'
  if (startsWith(prefix, [0x52, 0x49, 0x46, 0x46]) && asciiPrefix(prefix.subarray(8), 4) === 'WEBP') {
    return 'image/webp'
  }
  if (startsWith(prefix, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    const ext = extname(originalFileName).toLowerCase()
    if (ext === '.xls') return 'application/vnd.ms-excel'
    if (ext === '.ppt') return 'application/vnd.ms-powerpoint'
    return 'application/msword'
  }
  if (startsWith(prefix, [0x50, 0x4b, 0x03, 0x04]) || startsWith(prefix, [0x50, 0x4b, 0x05, 0x06])) {
    const ext = extname(originalFileName).toLowerCase()
    if (ext === '.docx') {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }
    if (ext === '.xlsx') {
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
    if (ext === '.pptx') {
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    }
    return 'application/zip'
  }

  const sample = prefix.subarray(0, Math.min(PEEK_BYTES, prefix.length))
  if (sample.includes(0)) {
    return 'application/octet-stream'
  }

  const text = sample.toString('utf8').toLowerCase()
  if (/<!doctype\s+html|<html[\s>]|<svg[\s>]|<script[\s>]|<\?php/.test(text)) {
    throw new UnsupportedUploadTypeError()
  }

  return 'text/plain'
}

export async function inspectUpload(
  source: Readable,
  originalFileName: string
): Promise<{ mimeType: string; body: Readable }> {
  const chunks: Buffer[] = []
  let total = 0
  try {
    for await (const chunk of source) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      chunks.push(buf)
      total += buf.length
      if (total >= PEEK_BYTES) break
    }
  } catch (error) {
    source.destroy()
    throw error
  }

  const peeked = Buffer.concat(chunks, total)
  const mimeType = sniffUploadMime(peeked, originalFileName)
  const body = Readable.from(
    (async function* prepend() {
      if (peeked.length) yield peeked
      try {
        for await (const chunk of source) {
          yield chunk
        }
      } catch {
        /* stream already ended or was truncated after peek */
      }
    })()
  )
  body.on('error', () => {
    /* pipeline / route handler reports upload failures */
  })
  return { mimeType, body }
}

/** Aborts the stream once more than `maxBytes` have been read. */
export function limitReadable(source: Readable, maxBytes: number): Readable {
  let seen = 0
  return source.pipe(
    new Transform({
      transform(chunk: Buffer, _enc, callback): void {
        seen += chunk.length
        if (seen > maxBytes) {
          callback(new UploadTooLargeError())
          return
        }
        callback(null, chunk)
      }
    })
  )
}
