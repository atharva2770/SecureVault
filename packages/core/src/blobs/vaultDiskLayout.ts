import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, writeFile, rmdir } from 'node:fs/promises'
import { homedir, userInfo } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { DBService } from '@securevault/db'

import { folderRelativePath, type FolderPathRow } from './folderPath'
import { legacyWorkspaceBlobRoot, resolveVaultBlobRoot } from './vaultPaths'

const execFileAsync = promisify(execFile)

const README = `Docman files
============
This folder is the encrypted document store for SecureVault / Docman.
It mirrors categories and folders in the database.

You may click into folders. Do not open files from here.
Files are AES-256-GCM ciphertext (hidden system files named by id, not
the original document name). Open documents from the Docman web app
after signing in.
`

const DESKTOP_INI = `[.ShellClassInfo]
ConfirmFileOp=0
InfoTip=Docman encrypted store. Folders are browsable; open files only from the Docman app.
`

export function docmanFilesRoot(): string {
  return resolveVaultBlobRoot()
}

export async function ensureDocmanDiskLayout(root = docmanFilesRoot()): Promise<string> {
  const abs = resolve(root)
  await mkdir(abs, { recursive: true })
  await migrateLegacyBlobs(abs)
  await writeFile(join(abs, 'README.txt'), README, 'utf8')
  await writeFile(join(abs, 'desktop.ini'), DESKTOP_INI, 'utf8')
  await hardenRoot(abs)
  await syncVaultFoldersToDisk(abs)
  return abs
}

export async function ensureVaultFolderDirForId(folderId: string, root = docmanFilesRoot()): Promise<string> {
  const rel = await relativePathForFolderId(folderId)
  const abs = join(resolve(root), ...rel.split('/').filter(Boolean))
  await mkdir(abs, { recursive: true })
  return abs
}

export async function removeVaultFolderDirIfEmpty(
  folderId: string,
  root = docmanFilesRoot()
): Promise<void> {
  const rel = await relativePathForFolderId(folderId).catch(() => '')
  if (!rel) return
  const abs = join(resolve(root), ...rel.split('/').filter(Boolean))
  await rmdir(abs).catch(() => undefined)
}

export async function relativePathForFolderId(folderId: string): Promise<string> {
  const db = DBService.getInstance()
  const folders: FolderPathRow[] = await db.prisma.folder.findMany({
    select: { folderId: true, parentFolderId: true, name: true }
  })
  return folderRelativePath(folders, folderId)
}

async function migrateLegacyBlobs(newRoot: string): Promise<void> {
  const legacy = legacyWorkspaceBlobRoot()
  if (!existsSync(legacy) || resolve(legacy) === resolve(newRoot)) return
  await cp(legacy, newRoot, { recursive: true, force: false }).catch(() => undefined)
}

async function syncVaultFoldersToDisk(root: string): Promise<void> {
  const db = DBService.getInstance()
  const folders: FolderPathRow[] = await db.prisma.folder.findMany({
    where: { isDeleted: false },
    select: { folderId: true, parentFolderId: true, name: true }
  })
  for (const folder of folders) {
    const rel = folderRelativePath(folders, folder.folderId)
    if (!rel) continue
    await mkdir(join(root, ...rel.split('/')), { recursive: true })
  }
}

/** Hidden + system + not indexed. Explorer hides these unless protected OS files are shown. */
export async function protectCiphertextFile(absPath: string): Promise<void> {
  if (process.platform !== 'win32') return
  await runQuiet('attrib', ['+H', '+S', '+I', absPath])
}

async function hardenRoot(root: string): Promise<void> {
  if (process.platform !== 'win32') return
  await runQuiet('attrib', ['+S', root])
  await runQuiet('icacls', [root, '/inheritance:d'])
  await runQuiet('icacls', [root, '/grant:r', 'SYSTEM:(OI)(CI)F'])
  await runQuiet('icacls', [root, '/grant:r', 'Administrators:(OI)(CI)F'])
  const account = windowsAccount()
  if (account) {
    await runQuiet('icacls', [root, '/grant:r', `${account}:(OI)(CI)M`])
  }
  // (CI) without (OI): Users may list/open folders, not inherit read on files.
  await runQuiet('icacls', [root, '/grant:r', 'Users:(CI)(RX)'])
  await runQuiet('icacls', [join(root, 'desktop.ini'), '/inheritance:d'])
}

function windowsAccount(): string | null {
  try {
    const name = userInfo().username?.trim()
    if (name) return name
  } catch {
    /* ignore */
  }
  const home = homedir()
  const match = /[/\\]Users[/\\]([^/\\]+)/i.exec(home)
  return match?.[1] ?? null
}

async function runQuiet(cmd: string, args: string[]): Promise<void> {
  try {
    await execFileAsync(cmd, args, { windowsHide: true, timeout: 15_000 })
  } catch {
    /* best-effort on locked/non-domain machines */
  }
}
