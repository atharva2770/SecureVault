import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'

import { sniffUploadMime, inspectUpload, UnsupportedUploadTypeError } from './sniffUpload'

describe('sniffUploadMime', () => {
  it('detects PDF from magic bytes even if the name is wrong', () => {
    const buf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(32, 0x20)])
    expect(sniffUploadMime(buf, 'invoice.exe')).toBe('application/pdf')
  })

  it('detects PNG', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    expect(sniffUploadMime(buf, 'x.jpg')).toBe('image/png')
  })

  it('rejects PE executables', () => {
    expect(() => sniffUploadMime(Buffer.from([0x4d, 0x5a, 0x90, 0x00]), 'readme.pdf')).toThrow(
      UnsupportedUploadTypeError
    )
  })

  it('rejects HTML disguised as text', () => {
    expect(() => sniffUploadMime(Buffer.from('<!DOCTYPE html><script>alert(1)</script>'), 'note.txt')).toThrow(
      UnsupportedUploadTypeError
    )
  })

  it('allows zip/office containers', () => {
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])
    expect(sniffUploadMime(zip, 'pack.zip')).toBe('application/zip')
    expect(sniffUploadMime(zip, 'letter.docx')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  })
})

describe('inspectUpload', () => {
  it('reassembles the stream after peeking', async () => {
    const payload = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('stream-body')])
    const { mimeType, body } = await inspectUpload(Readable.from([payload]), 'a.pdf')
    expect(mimeType).toBe('application/pdf')
    const chunks: Buffer[] = []
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    expect(Buffer.concat(chunks).equals(payload)).toBe(true)
  })
})
