/**
 * ACL enforcement, end to end, through the real HTTP surface.
 *
 * Every case here is a security regression if it ever flips. The suite drives the
 * Fastify app built by `buildApi()` with `app.inject()` (no network listener) and a
 * real SQL Server, so route guards, the CSRF hook, the auth guard, the ACL engine
 * and the service layer are all exercised together.
 *
 * The suite is SKIPPED unless TEST_DATABASE_URL points at a disposable database.
 *
 * Start a throwaway SQL Server:
 *
 *   docker run -e ACCEPT_EULA=Y -e MSSQL_SA_PASSWORD=<pw> -p 1433:1433 \
 *     -d mcr.microsoft.com/mssql/server:2022-latest
 *
 * Then create the database and apply the schema, and run the suite:
 *
 *   TEST_DATABASE_URL="sqlserver://localhost:1433;database=SecureVaultTest;user=sa;password=<pw>;trustServerCertificate=true" \
 *     npm run db:deploy
 *   TEST_DATABASE_URL="sqlserver://localhost:1433;database=SecureVaultTest;user=sa;password=<pw>;trustServerCertificate=true" \
 *     npm test -w @securevault/api
 *
 * Encrypted blobs are written under a per-run temp directory, never the real vault
 * root, and everything the fixture creates is removed in afterAll.
 */
import { createHash, randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { PrismaClient } from '@securevault/db'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const DB = process.env.TEST_DATABASE_URL
const describeIfDb = DB ? describe : describe.skip

const SUFFIX = randomUUID().slice(0, 8)
const BLOB_ROOT = join(tmpdir(), `securevault-acl-it-${SUFFIX}`)

// Must happen before ../app (and therefore ../config) is imported. loadWorkspaceEnv()
// reads the repo .env with override:false, so anything set here wins.
if (DB) {
  process.env.DATABASE_URL = DB
  process.env.USE_TRUSTED_CONNECTION = 'false'
  process.env.VAULT_BLOB_ROOT = BLOB_ROOT
  process.env.PASSWORD_BREACH_CHECK = 'false'
  process.env.API_RATE_LIMIT_DEFAULT = '5000'
  process.env.NODE_ENV = process.env.NODE_ENV || 'test'
  process.env.API_COOKIE_SECRET =
    process.env.API_COOKIE_SECRET || 'acl-integration-suite-cookie-secret'
  process.env.VAULT_KMS_WRAP_KEY =
    process.env.VAULT_KMS_WRAP_KEY ||
    '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1ff'
}

/** Paths the auth guard documents as public (plugins/auth.ts PUBLIC_PATHS). */
const PUBLIC_PATHS = new Set([
  '/health',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
  '/api/auth/session'
])

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

const PASSWORD = `Acl-Integration-Passphrase-${SUFFIX}`
const NEW_PASSWORD = `Rotated-Integration-Passphrase-${SUFFIX}`

/** A minimal PDF: passes the upload content sniffer and is not downgraded on read. */
const PDF_BYTES = Buffer.from(
  `%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n${SUFFIX}\n`,
  'utf8'
)

type Jar = Record<string, string>

interface Fixture {
  users: Record<'admin' | 'manager' | 'member' | 'viewer', { userId: string; username: string }>
  categoryIds: string[]
  folderIds: string[]
  folderADept: string
  folderAFresh: string
  folderBDept: string
  seedFileId: string
  seedFileName: string
}

let app: FastifyInstance
let prisma: PrismaClient
let cookieName: string
let csrfCookieName: string
let fixture: Fixture
let memberPassword = PASSWORD
/** Highest audit LogId that predates this run; anything above it is ours. */
let auditWatermark = 0n

function cookieHeader(jar: Jar): string {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
}

function absorb(jar: Jar, res: { cookies: unknown }): void {
  const cookies = res.cookies as Array<{ name: string; value: string }>
  for (const cookie of cookies) {
    if (!cookie.value) delete jar[cookie.name]
    else jar[cookie.name] = cookie.value
  }
}

interface CallOptions {
  method: string
  url: string
  payload?: unknown
  headers?: Record<string, string>
  /** Set false to deliberately omit the x-csrf-token header. */
  csrf?: boolean
}

async function call(jar: Jar, options: CallOptions) {
  const headers: Record<string, string> = { ...(options.headers ?? {}) }
  const cookie = cookieHeader(jar)
  if (cookie) headers.cookie = cookie
  if (options.csrf !== false && !SAFE_METHODS.has(options.method) && jar[csrfCookieName]) {
    headers['x-csrf-token'] = jar[csrfCookieName]
  }

  const res = await app.inject({
    method: options.method as 'GET',
    url: options.url,
    headers,
    ...(options.payload === undefined ? {} : { payload: options.payload as never })
  })
  absorb(jar, res)
  return res
}

/** A cookie jar holding a CSRF token but no session — the pre-login browser state. */
async function anonymousJar(): Promise<Jar> {
  const jar: Jar = {}
  await call(jar, { method: 'GET', url: '/api/auth/session' })
  return jar
}

async function signIn(username: string, password: string): Promise<Jar> {
  const jar = await anonymousJar()
  const res = await call(jar, {
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password }
  })
  if (res.statusCode !== 200) {
    throw new Error(`Login failed for ${username}: ${res.statusCode} ${res.payload}`)
  }
  return jar
}

function multipart(
  fields: Record<string, string>,
  file: { field: string; filename: string; contentType: string; content: Buffer }
): { body: Buffer; contentType: string } {
  const boundary = `----securevault${randomUUID().replace(/-/g, '')}`
  const parts: Buffer[] = []
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        'utf8'
      )
    )
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\n` +
        `Content-Type: ${file.contentType}\r\n\r\n`,
      'utf8'
    )
  )
  parts.push(file.content)
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'))

  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` }
}

async function upload(
  jar: Jar,
  input: { displayName: string; folderId: string; content?: Buffer }
) {
  const { body, contentType } = multipart(
    { displayName: input.displayName, folderId: input.folderId },
    {
      field: 'file',
      filename: 'acl-integration.pdf',
      contentType: 'application/pdf',
      content: input.content ?? PDF_BYTES
    }
  )
  return call(jar, {
    method: 'POST',
    url: '/api/files',
    payload: body,
    headers: { 'content-type': contentType }
  })
}

/** Parses `app.printRoutes()` into a flat {method, path} list. */
function parseRouteTree(tree: string): Array<{ method: string; path: string }> {
  const stack: string[] = []
  const routes: Array<{ method: string; path: string }> = []

  for (const line of tree.split('\n')) {
    const node = /^([^├└]*)[├└]──\s(.*)$/.exec(line)
    if (!node) continue

    const depth = Math.floor(node[1].length / 4)
    let fragment = node[2]
    let methods: string[] = []

    const withMethods = /^(.*?)\s\(([A-Z,\s]+)\)$/.exec(fragment)
    if (withMethods) {
      fragment = withMethods[1]
      methods = withMethods[2].split(',').map((m) => m.trim())
    }

    const path = (depth > 0 ? (stack[depth - 1] ?? '') : '') + fragment
    stack[depth] = path
    stack.length = depth + 1

    for (const method of methods) {
      if (method === 'HEAD' || method === 'OPTIONS') continue
      routes.push({ method, path })
    }
  }

  return routes
}

/**
 * Schema validation runs before the auth preHandler, so an unauthenticated probe
 * needs a well-formed request to reach the 401. One entry per route that needs
 * more than a UUID-shaped path parameter.
 */
const PROBES: Record<string, { url?: string; payload?: unknown; headers?: Record<string, string> }> =
  {
    'POST /api/auth/change-password': {
      payload: { currentPassword: 'probe-password', newPassword: 'probe-password-2' }
    },
    'POST /api/admin/users': {
      payload: { username: `probe-${SUFFIX}`, password: 'Probe-Passphrase-987654' }
    },
    'PATCH /api/admin/users/:userId/roles': { payload: { roleCodes: ['MEMBER'] } },
    'PATCH /api/admin/users/:userId/disabled': { payload: { isDisabled: true } },
    'PUT /api/admin/users/:userId/folder-access': { payload: { folderIds: [] } },
    'PUT /api/admin/folders/:folderId/acls': {
      payload: { principalType: 'USER', principalId: randomUUID(), canView: true }
    },
    'POST /api/folders': { payload: { name: 'probe', parentFolderId: randomUUID() } },
    'POST /api/categories': { payload: { name: 'probe' } },
    'POST /api/files/:fileId/download': { payload: { password: 'probe', intent: 'view' } },
    'POST /api/files/:fileId/move': { payload: { targetFolderId: randomUUID() } },
    'POST /api/files/:fileId/copy': { payload: { targetFolderId: randomUUID() } },
    'POST /api/files/:fileId/rename': { payload: { displayName: 'probe' } },
    'GET /api/search': { url: '/api/search?q=probe' },
    'GET /api/search/folder': { url: `/api/search/folder?folderId=${randomUUID()}&q=probe` }
  }

describeIfDb('ACL enforcement over HTTP', () => {
  beforeAll(async () => {
    const [{ buildApi }, { apiConfig }, { DBService }, core] = await Promise.all([
      import('../app'),
      import('../config'),
      import('@securevault/db'),
      import('@securevault/core')
    ])

    cookieName = apiConfig.cookieName
    csrfCookieName = apiConfig.csrfCookieName

    prisma = DBService.getInstance().prisma
    app = await buildApi()
    await app.ready()

    const newest = await prisma.auditLog.findFirst({
      orderBy: { logId: 'desc' },
      select: { logId: true }
    })
    auditWatermark = newest?.logId ?? 0n

    const crypto = core.CryptoService.getInstance()

    async function createUser(kind: string, roleCode: string) {
      const username = `aclit_${kind}_${SUFFIX}`
      const salt = crypto.generateSalt(32)
      const params = crypto.getDefaultArgon2Params()
      const kek = await crypto.deriveKEK(PASSWORD, salt, params)
      const argon2Params = JSON.stringify({ ...params, kekVerifier: core.sha256Hex(kek) })
      core.secureZero(kek)

      const user = await prisma.user.create({
        data: {
          username,
          passwordSalt: new Uint8Array(salt),
          argon2Params,
          role: roleCode.toLowerCase()
        }
      })
      const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } })
      await prisma.userRole.create({ data: { userId: user.userId, roleId: role.roleId } })
      return { userId: user.userId, username }
    }

    const admin = await createUser('admin', 'ADMIN')
    const manager = await createUser('manager', 'MANAGER')
    const member = await createUser('member', 'MEMBER')
    const viewer = await createUser('viewer', 'VIEWER')

    const categoryA = await prisma.fileCategory.create({
      data: { code: `ACLITA${SUFFIX}`.toUpperCase(), name: `ACL IT A ${SUFFIX}`, sortOrder: 9001 }
    })
    const categoryB = await prisma.fileCategory.create({
      data: { code: `ACLITB${SUFFIX}`.toUpperCase(), name: `ACL IT B ${SUFFIX}`, sortOrder: 9002 }
    })

    async function createFolder(
      name: string,
      categoryId: string,
      parentFolderId: string | null,
      isCategoryRoot = false
    ) {
      const folder = await prisma.folder.create({
        data: { userId: admin.userId, categoryId, parentFolderId, name, isCategoryRoot }
      })
      return folder.folderId
    }

    // Two departments that must never see each other, plus a folder with no ACL rows.
    const rootA = await createFolder(`ACL IT A ${SUFFIX}`, categoryA.categoryId, null, true)
    const folderADept = await createFolder('Department A', categoryA.categoryId, rootA)
    const folderAFresh = await createFolder('Fresh No ACL', categoryA.categoryId, rootA)
    const rootB = await createFolder(`ACL IT B ${SUFFIX}`, categoryB.categoryId, null, true)
    const folderBDept = await createFolder('Department B', categoryB.categoryId, rootB)

    async function grant(
      folderId: string,
      userId: string,
      rights: { canView: boolean; canEdit: boolean; canCopy: boolean; canDelete: boolean }
    ) {
      await prisma.folderAcl.create({
        data: {
          folderId,
          principalType: 'USER',
          principalId: userId,
          inherit: true,
          grantedBy: admin.userId,
          ...rights
        }
      })
    }

    const full = { canView: true, canEdit: true, canCopy: true, canDelete: true }
    await grant(folderADept, member.userId, full)
    await grant(folderBDept, manager.userId, full)
    // Deliberately over-granted: the VIEWER role cap must still win over canDelete.
    await grant(folderADept, viewer.userId, full)

    const adminJar = await signIn(admin.username, PASSWORD)
    const seedFileName = `ACL IT Seed ${SUFFIX}`
    const seeded = await upload(adminJar, { displayName: seedFileName, folderId: folderADept })
    if (seeded.statusCode !== 201) {
      throw new Error(`Fixture upload failed: ${seeded.statusCode} ${seeded.payload}`)
    }

    fixture = {
      users: { admin, manager, member, viewer },
      categoryIds: [categoryA.categoryId, categoryB.categoryId],
      folderIds: [rootA, folderADept, folderAFresh, rootB, folderBDept],
      folderADept,
      folderAFresh,
      folderBDept,
      seedFileId: JSON.parse(seeded.payload).fileId as string,
      seedFileName
    }
  }, 120_000)

  afterAll(async () => {
    if (!fixture) {
      if (app) await app.close()
      return
    }

    const userIds = Object.values(fixture.users).map((u) => u.userId)

    // GET /api/folders back-fills a root folder for any category that lacks one,
    // owned by the caller, so the fixture users may own folders beyond the tree
    // this suite created. Those are collateral of the run and go too.
    const owned = await prisma.folder.findMany({
      where: { userId: { in: userIds } },
      select: { folderId: true }
    })
    const folderIds = [...new Set([...fixture.folderIds, ...owned.map((f) => f.folderId)])]

    const files = await prisma.file.findMany({
      where: { folderId: { in: folderIds } },
      select: { fileId: true }
    })
    const fileIds = files.map((f) => f.fileId)

    // AuditLogs hold the only FK onto Files. On a database with the append-only
    // trigger installed this delete is refused; the rest of the teardown still runs.
    try {
      await prisma.auditLog.deleteMany({ where: { fileId: { in: fileIds } } })
      await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } })
      // Denials recorded before a session exists carry no user id; bound them by
      // the watermark so only rows this run produced are removed. recordAudit is
      // fire-and-forget, so a write that lands after this point simply survives.
      await prisma.auditLog.deleteMany({
        where: { userId: null, logId: { gt: auditWatermark } }
      })
    } catch {
      /* audit rows are immutable here — leave them and keep cleaning up */
    }

    await prisma.file.deleteMany({ where: { fileId: { in: fileIds } } })
    await prisma.folderAcl.deleteMany({ where: { folderId: { in: folderIds } } })
    await prisma.folderAcl.deleteMany({
      where: { principalType: 'USER', principalId: { in: userIds } }
    })

    // Folders are self-referential: peel the tree leaves-first.
    for (let pass = 0; pass < 8; pass += 1) {
      const remaining = await prisma.folder.findMany({
        where: { folderId: { in: folderIds } },
        select: { folderId: true, parentFolderId: true }
      })
      if (!remaining.length) break
      const parents = new Set(remaining.map((f) => f.parentFolderId).filter(Boolean) as string[])
      const leaves = remaining.filter((f) => !parents.has(f.folderId)).map((f) => f.folderId)
      if (!leaves.length) break
      await prisma.folder.deleteMany({ where: { folderId: { in: leaves } } })
    }

    await prisma.fileCategory.deleteMany({ where: { categoryId: { in: fixture.categoryIds } } })
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.user.deleteMany({ where: { userId: { in: userIds } } })

    await app.close()
    await rm(BLOB_ROOT, { recursive: true, force: true })
  }, 120_000)

  it('1. denies a MEMBER granted on Department A any access to Department B', async () => {
    const jar = await signIn(fixture.users.member.username, memberPassword)

    const own = await call(jar, { method: 'GET', url: `/api/files?folderId=${fixture.folderADept}` })
    expect(own.statusCode).toBe(200)

    const crossDepartment = await call(jar, {
      method: 'GET',
      url: `/api/files?folderId=${fixture.folderBDept}`
    })
    expect(crossDepartment.statusCode).toBe(403)
  })

  it('2. caps a VIEWER at read-only even when the ACL row says canDelete', async () => {
    const acl = await prisma.folderAcl.findFirstOrThrow({
      where: {
        folderId: fixture.folderADept,
        principalType: 'USER',
        principalId: fixture.users.viewer.userId
      }
    })
    expect(acl.canDelete).toBe(true)

    const jar = await signIn(fixture.users.viewer.username, PASSWORD)
    const listed = await call(jar, {
      method: 'GET',
      url: `/api/files?folderId=${fixture.folderADept}`
    })
    expect(listed.statusCode).toBe(200)

    const deleted = await call(jar, {
      method: 'DELETE',
      url: `/api/files/${fixture.seedFileId}`
    })
    expect(deleted.statusCode).toBe(403)

    const stillThere = await prisma.file.findUniqueOrThrow({
      where: { fileId: fixture.seedFileId },
      select: { isDeleted: true }
    })
    expect(stillThere.isDeleted).toBe(false)
  })

  it('3. refuses a MEMBER at the admin route gate', async () => {
    const jar = await signIn(fixture.users.member.username, memberPassword)
    const res = await call(jar, { method: 'GET', url: '/api/admin/users' })
    expect(res.statusCode).toBe(403)
  })

  it('4. hides a brand new folder with no ACL rows from a non-admin', async () => {
    const aclRows = await prisma.folderAcl.count({ where: { folderId: fixture.folderAFresh } })
    expect(aclRows).toBe(0)

    const jar = await signIn(fixture.users.member.username, memberPassword)

    const listed = await call(jar, { method: 'GET', url: '/api/folders' })
    expect(listed.statusCode).toBe(200)
    const visible = JSON.parse(listed.payload) as Array<{ folderId: string }>
    expect(visible.map((f) => f.folderId)).not.toContain(fixture.folderAFresh)

    const files = await call(jar, {
      method: 'GET',
      url: `/api/files?folderId=${fixture.folderAFresh}`
    })
    expect(files.statusCode).toBe(403)

    const adminJar = await signIn(fixture.users.admin.username, PASSWORD)
    const adminFiles = await call(adminJar, {
      method: 'GET',
      url: `/api/files?folderId=${fixture.folderAFresh}`
    })
    expect(adminFiles.statusCode).toBe(200)
  })

  it('5. answers 401 on every non-public /api route without a session cookie', async () => {
    const routes = parseRouteTree(app.printRoutes({ commonPrefix: false })).filter(
      (route) => route.path.startsWith('/api/') && !PUBLIC_PATHS.has(route.path)
    )
    expect(routes.length).toBeGreaterThan(20)

    for (const route of routes) {
      const jar = await anonymousJar()
      const probe = PROBES[`${route.method} ${route.path}`] ?? {}
      const url = probe.url ?? route.path.replace(/:[^/]+/g, () => randomUUID())

      let payload = probe.payload
      let headers = probe.headers
      if (route.method === 'POST' && route.path === '/api/files') {
        const form = multipart(
          { displayName: 'probe', folderId: randomUUID() },
          {
            field: 'file',
            filename: 'probe.pdf',
            contentType: 'application/pdf',
            content: PDF_BYTES
          }
        )
        payload = form.body
        headers = { 'content-type': form.contentType }
      }

      const res = await call(jar, { method: route.method, url, payload, headers })
      expect(`${route.method} ${route.path} -> ${res.statusCode}`).toBe(
        `${route.method} ${route.path} -> 401`
      )
    }
  })

  it('6. rejects a state-changing request that omits the CSRF header', async () => {
    const jar = await signIn(fixture.users.member.username, memberPassword)

    const withToken = await call(jar, { method: 'POST', url: '/api/auth/touch' })
    expect(withToken.statusCode).toBe(200)

    const withoutToken = await call(jar, {
      method: 'POST',
      url: '/api/auth/touch',
      csrf: false
    })
    expect(withoutToken.statusCode).toBe(403)
    expect(jar[cookieName]).toBeTruthy()
  })

  it('7. round-trips an upload and a download byte for byte', async () => {
    const jar = await signIn(fixture.users.admin.username, PASSWORD)
    const displayName = `ACL IT Roundtrip ${SUFFIX}`
    const content = Buffer.concat([PDF_BYTES, Buffer.from(`roundtrip-${SUFFIX}\n`, 'utf8')])

    const uploaded = await upload(jar, { displayName, folderId: fixture.folderADept, content })
    expect(uploaded.statusCode).toBe(201)
    const record = JSON.parse(uploaded.payload) as { fileId: string; checksum: string }

    const expectedChecksum = createHash('sha256').update(content).digest('hex')
    expect(record.checksum).toBe(expectedChecksum)

    const downloaded = await call(jar, {
      method: 'POST',
      url: `/api/files/${record.fileId}/download`,
      payload: { password: displayName, intent: 'view' }
    })
    expect(downloaded.statusCode).toBe(200)
    expect(downloaded.headers['x-checksum-sha256']).toBe(expectedChecksum)
    expect(Buffer.compare(downloaded.rawPayload, content)).toBe(0)
  })

  // EXPECTED TO FAIL — regression test for finding F6, fixed in P0-04.
  //
  // The per-file "open" password is the Argon2 hash of the display name
  // (VaultFileService.addFile hashes displayName; renameFile re-hashes it).
  // copyFile renames the copy through uniqueCopyName() when the target folder
  // already holds that name, but carries the SOURCE row's accessPasswordHash
  // across unchanged (VaultFileService.ts:372), so the copy can never be opened
  // with its own name. Do not fix VaultFileService here.
  it.fails('8. round-trips a copy into a second folder and opens the COPY', async () => {
    const jar = await signIn(fixture.users.admin.username, PASSWORD)

    const first = await call(jar, {
      method: 'POST',
      url: `/api/files/${fixture.seedFileId}/copy`,
      payload: { targetFolderId: fixture.folderBDept }
    })
    expect(first.statusCode).toBe(200)

    // Second copy collides with the first, so it is renamed — the case that trips F6.
    const second = await call(jar, {
      method: 'POST',
      url: `/api/files/${fixture.seedFileId}/copy`,
      payload: { targetFolderId: fixture.folderBDept }
    })
    expect(second.statusCode).toBe(200)
    const copy = JSON.parse(second.payload) as { fileId: string; displayName: string }
    expect(copy.displayName).not.toBe(fixture.seedFileName)

    const opened = await call(jar, {
      method: 'POST',
      url: `/api/files/${copy.fileId}/download`,
      payload: { password: copy.displayName, intent: 'view' }
    })
    expect(opened.statusCode).toBe(200)
  })

  // Runs last: it rotates the MEMBER password the earlier cases sign in with.
  it('9. revokes every other session when a password is changed', async () => {
    const first = await signIn(fixture.users.member.username, memberPassword)
    const second = await signIn(fixture.users.member.username, memberPassword)

    expect((await call(second, { method: 'GET', url: '/api/files' })).statusCode).toBe(200)

    const changed = await call(first, {
      method: 'POST',
      url: '/api/auth/change-password',
      payload: { currentPassword: memberPassword, newPassword: NEW_PASSWORD }
    })
    expect(changed.statusCode).toBe(200)
    memberPassword = NEW_PASSWORD

    expect((await call(second, { method: 'GET', url: '/api/files' })).statusCode).toBe(401)
    expect((await call(first, { method: 'GET', url: '/api/files' })).statusCode).toBe(200)
  })
})
