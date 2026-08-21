import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual
} from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import * as argon2 from 'argon2'

/** Default Argon2id memory cost in KiB (64 MiB). */
export const ARGON2_MEMORY_COST_KIB = 65536

/** Default Argon2id time (iteration) cost. */
export const ARGON2_TIME_COST = 3

/** Default Argon2id parallelism. */
export const ARGON2_PARALLELISM = 4

/** AES-256 key length in bytes. */
export const AES_256_KEY_BYTES = 32

/** Recommended GCM IV length in bytes. */
export const GCM_IV_BYTES = 12

/** GCM authentication tag length in bytes. */
export const GCM_AUTH_TAG_BYTES = 16

/**
 * Parameters used for Argon2id KEK derivation.
 * Serialized into the User.argon2Params column as JSON.
 */
export interface Argon2Params {
  type: 'argon2id'
  memoryCost: number
  timeCost: number
  parallelism: number
  hashLength: number
}

/**
 * Result of streaming file encryption.
 */
export interface EncryptFileResult {
  /** Absolute path to the ciphertext file. */
  encPath: string
  /** 12-byte AES-GCM IV. */
  iv: Buffer
  /** 16-byte AES-GCM authentication tag. */
  authTag: Buffer
  /** Lowercase hex SHA-256 of the plaintext. */
  checksum: string
}

/**
 * Serialized wrapped DEK layout: `iv (12) || ciphertext (32) || authTag (16)`.
 */
export type WrappedKey = Buffer

const DEFAULT_ARGON2_PARAMS: Argon2Params = {
  type: 'argon2id',
  memoryCost: ARGON2_MEMORY_COST_KIB,
  timeCost: ARGON2_TIME_COST,
  parallelism: ARGON2_PARALLELISM,
  hashLength: AES_256_KEY_BYTES
}

/**
 * Cryptographic helpers for SecureVault:
 * password → KEK (Argon2id), random DEKs, streaming AES-256-GCM file crypto,
 * and AES-256-GCM key wrapping.
 */
export class CryptoService {
  private static instance: CryptoService | null = null

  private constructor() {}

  /**
   * Returns the shared {@link CryptoService} instance.
   */
  static getInstance(): CryptoService {
    if (!CryptoService.instance) {
      CryptoService.instance = new CryptoService()
    }
    return CryptoService.instance
  }

  /**
   * Default Argon2id parameters (memory cost ≥ 64 MiB).
   */
  getDefaultArgon2Params(): Argon2Params {
    return { ...DEFAULT_ARGON2_PARAMS }
  }

  /**
   * Derives a 32-byte Key Encryption Key (KEK) from a password and salt
   * using Argon2id.
   *
   * @param password - User password (UTF-8 string).
   * @param salt - Cryptographic salt (recommended ≥ 16 bytes).
   * @param params - Optional Argon2id overrides; memory cost must be ≥ 65536 KiB.
   * @returns Raw 32-byte KEK buffer.
   * @throws If memory cost is below 64 MiB or derivation fails.
   */
  async deriveKEK(
    password: string,
    salt: Buffer,
    params: Partial<Argon2Params> = {}
  ): Promise<Buffer> {
    const merged: Argon2Params = {
      ...DEFAULT_ARGON2_PARAMS,
      ...params,
      type: 'argon2id'
    }

    if (merged.memoryCost < ARGON2_MEMORY_COST_KIB) {
      throw new Error(
        `Argon2id memoryCost must be ≥ ${ARGON2_MEMORY_COST_KIB} KiB (64 MiB); got ${merged.memoryCost}`
      )
    }

    const kek = await argon2.hash(password, {
      type: argon2.argon2id,
      salt,
      memoryCost: merged.memoryCost,
      timeCost: merged.timeCost,
      parallelism: merged.parallelism,
      hashLength: merged.hashLength,
      raw: true
    })

    return Buffer.from(kek)
  }

  /**
   * Generates a cryptographically secure 32-byte Data Encryption Key (DEK)
   * for AES-256-GCM.
   *
   * @returns Fresh DEK buffer.
   */
  generateDEK(): Buffer {
    return randomBytes(AES_256_KEY_BYTES)
  }

  /**
   * Generates a cryptographically secure salt for Argon2id.
   *
   * @param bytes - Salt length (default 16).
   * @returns Random salt buffer.
   */
  generateSalt(bytes = 16): Buffer {
    return randomBytes(bytes)
  }

  /**
   * Encrypts a file with AES-256-GCM using Node crypto streams.
   * The plaintext is never fully loaded into memory.
   *
   * @param filePath - Absolute path to the plaintext file.
   * @param dek - 32-byte AES-256 DEK.
   * @param encPath - Optional output path; defaults to `<filePath>.enc`.
   * @returns Ciphertext path, IV, auth tag, and SHA-256 plaintext checksum.
   */
  async encryptFile(
    filePath: string,
    dek: Buffer,
    encPath?: string
  ): Promise<EncryptFileResult> {
    this.assertAes256Key(dek, 'DEK')

    const outPath = encPath ?? `${filePath}.enc`
    await mkdir(dirname(outPath), { recursive: true })

    const iv = randomBytes(GCM_IV_BYTES)
    const cipher = createCipheriv('aes-256-gcm', dek, iv)
    const hash = createHash('sha256')

    const hashingTransform = new Transform({
      transform(chunk: Buffer, _encoding, callback): void {
        hash.update(chunk)
        callback(null, chunk)
      }
    })

    try {
      await pipeline(
        createReadStream(filePath),
        hashingTransform,
        cipher,
        createWriteStream(outPath)
      )
    } catch (error) {
      await unlink(outPath).catch(() => undefined)
      throw error
    }

    return {
      encPath: outPath,
      iv,
      authTag: cipher.getAuthTag(),
      checksum: hash.digest('hex')
    }
  }

  /**
   * Decrypts an AES-256-GCM ciphertext file with streaming I/O and verifies
   * the SHA-256 checksum of the recovered plaintext.
   *
   * @param encPath - Absolute path to the ciphertext file.
   * @param dek - 32-byte AES-256 DEK used at encryption time.
   * @param iv - 12-byte GCM IV.
   * @param authTag - 16-byte GCM authentication tag.
   * @param expectedChecksum - Lowercase hex SHA-256 of the original plaintext.
   * @param outPath - Optional plaintext output path; defaults beside `encPath`.
   * @returns Absolute path to the decrypted file.
   * @throws If GCM authentication fails or the checksum does not match.
   */
  async decryptFile(
    encPath: string,
    dek: Buffer,
    iv: Buffer,
    authTag: Buffer,
    expectedChecksum: string,
    outPath?: string
  ): Promise<string> {
    this.assertAes256Key(dek, 'DEK')

    if (iv.length !== GCM_IV_BYTES) {
      throw new Error(`IV must be ${GCM_IV_BYTES} bytes; got ${iv.length}`)
    }
    if (authTag.length !== GCM_AUTH_TAG_BYTES) {
      throw new Error(
        `Auth tag must be ${GCM_AUTH_TAG_BYTES} bytes; got ${authTag.length}`
      )
    }

    const destination =
      outPath ?? join(dirname(encPath), `${Date.now()}-decrypted.bin`)
    await mkdir(dirname(destination), { recursive: true })

    const decipher = createDecipheriv('aes-256-gcm', dek, iv)
    decipher.setAuthTag(authTag)

    const hash = createHash('sha256')
    const hashingTransform = new Transform({
      transform(chunk: Buffer, _encoding, callback): void {
        hash.update(chunk)
        callback(null, chunk)
      }
    })

    try {
      await pipeline(
        createReadStream(encPath),
        decipher,
        hashingTransform,
        createWriteStream(destination)
      )
    } catch (error) {
      await unlink(destination).catch(() => undefined)
      throw error
    }

    const actualChecksum = hash.digest('hex')
    const expected = Buffer.from(expectedChecksum.toLowerCase(), 'utf8')
    const actual = Buffer.from(actualChecksum, 'utf8')

    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      await unlink(destination).catch(() => undefined)
      throw new Error(
        'Checksum verification failed: decrypted plaintext does not match expected SHA-256'
      )
    }

    return destination
  }

  /**
   * Wraps (encrypts) a DEK with a KEK using AES-256-GCM.
   *
   * Wire format: `iv (12 bytes) || ciphertext || authTag (16 bytes)`.
   *
   * @param dek - 32-byte data encryption key to wrap.
   * @param kek - 32-byte key encryption key from {@link deriveKEK}.
   * @returns Opaque wrapped-key buffer.
   */
  wrapKey(dek: Buffer, kek: Buffer): WrappedKey {
    this.assertAes256Key(dek, 'DEK')
    this.assertAes256Key(kek, 'KEK')

    const iv = randomBytes(GCM_IV_BYTES)
    const cipher = createCipheriv('aes-256-gcm', kek, iv)
    const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()])
    const authTag = cipher.getAuthTag()

    return Buffer.concat([iv, ciphertext, authTag])
  }

  /**
   * Unwraps (decrypts) a DEK previously produced by {@link wrapKey}.
   *
   * @param wrappedDek - Buffer from {@link wrapKey}.
   * @param kek - 32-byte key encryption key.
   * @returns Recovered 32-byte DEK.
   * @throws If authentication fails or the payload is malformed.
   */
  unwrapKey(wrappedDek: Buffer, kek: Buffer): Buffer {
    this.assertAes256Key(kek, 'KEK')

    const minLength = GCM_IV_BYTES + AES_256_KEY_BYTES + GCM_AUTH_TAG_BYTES
    if (wrappedDek.length < minLength) {
      throw new Error(
        `Wrapped DEK too short: expected ≥ ${minLength} bytes, got ${wrappedDek.length}`
      )
    }

    const iv = wrappedDek.subarray(0, GCM_IV_BYTES)
    const authTag = wrappedDek.subarray(wrappedDek.length - GCM_AUTH_TAG_BYTES)
    const ciphertext = wrappedDek.subarray(
      GCM_IV_BYTES,
      wrappedDek.length - GCM_AUTH_TAG_BYTES
    )

    const decipher = createDecipheriv('aes-256-gcm', kek, iv)
    decipher.setAuthTag(authTag)

    const dek = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    this.assertAes256Key(dek, 'unwrapped DEK')
    return dek
  }

  /**
   * Hashes a per-file access password with Argon2id (encoded PHC string).
   * Never store the plaintext password.
   */
  async hashAccessPassword(password: string): Promise<string> {
    if (!password || password.trim().length < 1) {
      throw new Error('Access password is required.')
    }
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: ARGON2_MEMORY_COST_KIB,
      timeCost: ARGON2_TIME_COST,
      parallelism: ARGON2_PARALLELISM
    })
  }

  /**
   * Verifies a per-file access password against an Argon2id encoded hash.
   */
  async verifyAccessPassword(password: string, encodedHash: string): Promise<boolean> {
    if (!password || !encodedHash) return false
    try {
      return await argon2.verify(encodedHash, password)
    } catch {
      return false
    }
  }

  /**
   * Builds a portable password-locked share package (`.svault`).
   * Key = Argon2id(password, salt); payload = AES-256-GCM ciphertext.
   * Recipients need the password to decrypt (via SecureVault or compatible tool).
   */
  async createPasswordProtectedShare(
    plainPath: string,
    password: string,
    outPath: string,
    originalFileName: string
  ): Promise<string> {
    const salt = this.generateSalt(16)
    let key: Buffer | null = null
    const tempEnc = `${outPath}.part.enc`

    try {
      key = await this.deriveKEK(password, salt)
      const encrypted = await this.encryptFile(plainPath, key, tempEnc)

      const nameBuf = Buffer.from(originalFileName, 'utf8')
      if (nameBuf.length > 65535) {
        throw new Error('Original file name too long for share package.')
      }

      const header = Buffer.alloc(4 + 1 + 1 + 2 + nameBuf.length + 1 + salt.length)
      header.write('SVLT', 0, 4, 'ascii')
      header.writeUInt8(1, 4) // version
      header.writeUInt8(0, 5) // flags
      header.writeUInt16LE(nameBuf.length, 6)
      nameBuf.copy(header, 8)
      const saltOffset = 8 + nameBuf.length
      header.writeUInt8(salt.length, saltOffset)
      salt.copy(header, saltOffset + 1)

      const { readFile, writeFile } = await import('node:fs/promises')
      const ciphertext = await readFile(tempEnc)
      await writeFile(
        outPath,
        Buffer.concat([header, encrypted.iv, encrypted.authTag, ciphertext])
      )
      await unlink(tempEnc).catch(() => undefined)
      return outPath
    } catch (error) {
      await unlink(tempEnc).catch(() => undefined)
      await unlink(outPath).catch(() => undefined)
      throw error
    } finally {
      if (key) key.fill(0)
    }
  }

  /**
   * Serializes Argon2 parameters for persistence (e.g. User.argon2Params).
   */
  serializeArgon2Params(params: Argon2Params = DEFAULT_ARGON2_PARAMS): string {
    return JSON.stringify(params)
  }

  /**
   * Parses Argon2 parameters previously stored via {@link serializeArgon2Params}.
   */
  parseArgon2Params(json: string): Argon2Params {
    const parsed = JSON.parse(json) as Partial<Argon2Params>
    return {
      ...DEFAULT_ARGON2_PARAMS,
      ...parsed,
      type: 'argon2id'
    }
  }

  private assertAes256Key(key: Buffer, label: string): void {
    if (!Buffer.isBuffer(key) || key.length !== AES_256_KEY_BYTES) {
      throw new Error(
        `${label} must be a ${AES_256_KEY_BYTES}-byte Buffer; got ${key?.length ?? 'invalid'}`
      )
    }
  }
}

export default CryptoService
