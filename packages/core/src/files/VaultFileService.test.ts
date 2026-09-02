/**
 * The per-file password gate. No database and no disk: Prisma sits behind a stub
 * and the ACL is spied out, so what is under test is purely the policy decision.
 *
 * The success cases assert two things together — that the request was NOT
 * rejected with a password error, and that `verifyAccessPassword` was never
 * called. The second half is what actually pins finding F8: an open in an
 * ACL-only category must cost no Argon2 at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DBService } from '@securevault/db'

import { AccessControlService } from '../access/AccessControlService'
import { AuditService } from '../audit/AuditService'
import type { BlobStore } from '../blobs/BlobStore'
import { CryptoService } from '../crypto/CryptoService'
import type { KeyWrappingProvider } from '../kms/KeyWrappingProvider'
import { VaultFileService } from './VaultFileService'

const PASSWORD = 'the-real-file-password'
const FILE_ID = 'file-1'
const USER_ID = 'user-1'

/** downloadToTemp continues to the blob layer once the gate passes; this is where it stops. */
const PAST_THE_GATE = /ciphertext|ENOENT|blob|path|not found/i

type PrismaStub = {
  file: {
    findFirst: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
}

let prisma: PrismaStub
let verifySpy: ReturnType<typeof vi.spyOn>
let service: VaultFileService

function fileRow(overrides: Record<string, unknown> = {}) {
  return {
    fileId: FILE_ID,
    userId: USER_ID,
    folderId: 'folder-1',
    categoryId: 'category-1',
    displayName: 'Quarterly Report',
    originalFileName: 'report.pdf',
    storedBlobPath: 'web://missing-on-purpose',
    mimeType: 'application/pdf',
    sizeBytes: 10n,
    checksum: 'a'.repeat(64),
    wrappedDEK: new Uint8Array(1),
    iv: new Uint8Array(1),
    authTag: new Uint8Array(1),
    accessPasswordHash: null as string | null,
    source: 'web',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
    category: { categoryId: 'category-1', name: 'HR', requiresFilePassword: false },
    ...overrides
  }
}

beforeEach(() => {
  prisma = {
    file: {
      findFirst: vi.fn().mockResolvedValue(fileRow()),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockImplementation(async ({ data }) => fileRow({ ...data }))
    }
  }
  vi.spyOn(DBService.prototype, 'prisma', 'get').mockReturnValue(prisma as never)
  vi.spyOn(AccessControlService.prototype, 'requireFile').mockResolvedValue({
    view: true,
    edit: true,
    copy: true,
    delete: true
  })
  vi.spyOn(AuditService.getInstance(), 'write').mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})

  verifySpy = vi.spyOn(CryptoService.prototype, 'verifyAccessPassword')

  service = new VaultFileService({} as BlobStore, {} as KeyWrappingProvider)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('downloadToTemp password gate', () => {
  it('opens with no password when the category does not require one', async () => {
    prisma.file.findFirst.mockResolvedValue(
      fileRow({
        accessPasswordHash: null,
        category: { requiresFilePassword: false }
      })
    )

    await expect(service.downloadToTemp(USER_ID, FILE_ID)).rejects.toThrow(PAST_THE_GATE)
    expect(verifySpy).not.toHaveBeenCalled()
  })

  it('denies a wrong password when the category requires one', async () => {
    verifySpy.mockResolvedValue(false)
    prisma.file.findFirst.mockResolvedValue(
      fileRow({
        accessPasswordHash: '$argon2id$stored',
        category: { requiresFilePassword: true }
      })
    )

    await expect(service.downloadToTemp(USER_ID, FILE_ID, 'wrong')).rejects.toThrow(
      'Incorrect file password.'
    )
    expect(verifySpy).toHaveBeenCalledOnce()
  })

  it('accepts the right password when the category requires one', async () => {
    verifySpy.mockResolvedValue(true)
    prisma.file.findFirst.mockResolvedValue(
      fileRow({
        accessPasswordHash: '$argon2id$stored',
        category: { requiresFilePassword: true }
      })
    )

    await expect(service.downloadToTemp(USER_ID, FILE_ID, PASSWORD)).rejects.toThrow(PAST_THE_GATE)
    expect(verifySpy).toHaveBeenCalledWith(PASSWORD, '$argon2id$stored')
  })

  it('denies, fail closed, when a password-required category has no stored hash', async () => {
    prisma.file.findFirst.mockResolvedValue(
      fileRow({
        accessPasswordHash: null,
        category: { requiresFilePassword: true }
      })
    )

    // A data error must never read as "no password needed".
    await expect(service.downloadToTemp(USER_ID, FILE_ID, PASSWORD)).rejects.toThrow(
      'Incorrect file password.'
    )
    expect(verifySpy).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('file_password_missing_for_required_category')
    )
  })

  it('denies, fail closed, when the file has no category at all', async () => {
    prisma.file.findFirst.mockResolvedValue(
      fileRow({ categoryId: null, accessPasswordHash: null, category: null })
    )

    await expect(service.downloadToTemp(USER_ID, FILE_ID)).rejects.toThrow(
      'Incorrect file password.'
    )
    expect(verifySpy).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('file_password_policy_unresolved')
    )
  })

  it('still verifies a legacy hash in a category that has opted out', async () => {
    verifySpy.mockResolvedValue(false)
    prisma.file.findFirst.mockResolvedValue(
      fileRow({
        accessPasswordHash: '$argon2id$legacy',
        category: { requiresFilePassword: false }
      })
    )

    // A control in force on existing data is not silently dropped.
    await expect(service.downloadToTemp(USER_ID, FILE_ID, 'wrong')).rejects.toThrow(
      'Incorrect file password.'
    )
    expect(verifySpy).toHaveBeenCalledOnce()
  })

  it('opens a copy with the source password, whatever the copy is called', async () => {
    verifySpy.mockResolvedValue(true)
    // A copy carries the source's hash and a renamed displayName — the F6 shape.
    prisma.file.findFirst.mockResolvedValue(
      fileRow({
        displayName: 'Quarterly Report (1)',
        accessPasswordHash: '$argon2id$source-hash',
        category: { requiresFilePassword: true }
      })
    )

    await expect(service.downloadToTemp(USER_ID, FILE_ID, PASSWORD)).rejects.toThrow(PAST_THE_GATE)
    expect(verifySpy).toHaveBeenCalledWith(PASSWORD, '$argon2id$source-hash')
  })
})

describe('renameFile', () => {
  it('does not touch the access password', async () => {
    prisma.file.findFirst.mockResolvedValue(
      fileRow({ accessPasswordHash: '$argon2id$unchanged' })
    )
    const hashSpy = vi.spyOn(CryptoService.prototype, 'hashAccessPassword')

    await service.renameFile(USER_ID, { fileId: FILE_ID, displayName: 'A New Name' })

    expect(hashSpy).not.toHaveBeenCalled()
    const [[call]] = prisma.file.update.mock.calls
    expect(call.data).toHaveProperty('displayName', 'A New Name')
    expect(call.data).not.toHaveProperty('accessPasswordHash')
  })
})
