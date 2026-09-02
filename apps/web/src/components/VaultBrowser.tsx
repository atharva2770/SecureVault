import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useNavigate, useParams, useLocation } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Eye,
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Loader2,
  Lock,
  Menu,
  MoveRight,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Scissors,
  Search,
  Trash2,
  Upload,
  X
} from 'lucide-react'

import type { FileDto, FolderDto } from '@securevault/domain'
import { compareFoldersByOrder, EMPTY_RIGHTS } from '@securevault/domain'
import { api } from '@/api/vault'
import type { OpenedFileView } from '@/api/vault'
import { useAuth } from '@/auth/AuthProvider'
import FileNameModal from '@/components/FileNameModal'
import SecureFileViewer from '@/components/SecureFileViewer'
import ModuleGrid, { type ModuleGridItem } from '@/components/ModuleGrid'
import ModulePage from '@/components/ModulePage'
import { PageTransition } from '@/components/PageTransition'
import MoveFileModal from '@/components/MoveFileModal'
import BatchPasswordModal from '@/components/BatchPasswordModal'
import PasswordPromptModal from '@/components/PasswordPromptModal'
import RenameFileModal from '@/components/RenameFileModal'
import VaultContextMenu, {
  type ContextMenuTarget,
  type VaultContextMenuState
} from '@/components/VaultContextMenu'
import IngestSessionBar from '@/components/IngestSessionBar'
import { HighlightMatch } from '@/components/HighlightMatch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { FileRowSkeleton } from '@/components/ui/skeleton'
import { CLIENT_SCOPED_SEARCH_LIMIT, PrefixIndex } from '@/lib/prefixIndex'
import {
  GLOBAL_SEARCH_STALE_MS,
  SCOPED_SEARCH_GC_MS,
  SCOPED_SEARCH_STALE_MS
} from '@/lib/search'
import { cn } from '@/lib/utils'
import {
  displayNameFromFile,
  INGEST_UPLOAD_CONCURRENCY,
  isStagedId,
  namesTakenInFolder,
  newStagedId,
  stagedToFileDto,
  uniqueDisplayName,
  type StagedFile
} from '@/lib/ingest'
import { folderRightsOf, vaultActions } from '@/lib/vault-actions'
import { moduleThemeForCategory } from '@/theme/modules'

interface FolderNode extends FolderDto {
  children: FolderNode[]
}

type Selection =
  | { type: 'root' }
  | { type: 'folder'; folderId: string; categoryId: string | null }

/*
  URL addressing is name-based, never the DB folder id. A folder's location is
  encoded as its breadcrumb chain of slugs (module → subfolder → …), e.g.
  `/m/qa/action-plan`. The real folderId stays server-side / in memory; it is
  never exposed in the address bar. Slugs are resolved back to a folder against
  the already-loaded tree, so no extra API calls are needed.
*/
function slugifyName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'folder'
}

/** Old slugs after department / subfolder renames — first path segment and later segments. */
const FOLDER_SLUG_ALIASES: Record<string, string> = {
  engg: 'engineering',
  'customer-drawings': 'customer-drawing',
  'process-sheets': 'process-sheet',
  'gauge-poka': 'gauges-poka'
}

function slugEquals(folderName: string, segment: string): boolean {
  const slug = slugifyName(folderName)
  if (slug === segment) return true
  const canonical = FOLDER_SLUG_ALIASES[segment]
  return Boolean(canonical && slug === canonical)
}

function parsePathSegments(routePath: string | undefined): string[] {
  if (!routePath) return []
  return routePath
    .split('/')
    .map((s) => decodeURIComponent(s).trim().toLowerCase())
    .filter(Boolean)
}

/** Slug path (module-rooted) for a folder, used to build the address bar URL. */
function folderSlugPath(folderId: string, folders: FolderDto[]): string {
  const crumbs = buildBreadcrumbs(folderId, folders)
  if (crumbs.length === 0) return '/'
  return `/m/${crumbs.map((c) => slugifyName(c.name)).join('/')}`
}

/**
 * Walk name-slug segments down the tree and return the deepest folder that
 * resolves. Partial matches resolve as far as they can (a renamed leaf falls
 * back to its nearest surviving ancestor), and unknown roots resolve to null.
 */
function resolveSlugSegments(segments: string[], folders: FolderDto[]): FolderDto | null {
  if (segments.length === 0) return null
  let current =
    folders.find((f) => f.isCategoryRoot && slugEquals(f.name, segments[0])) ?? null
  if (!current) return null
  for (let i = 1; i < segments.length; i += 1) {
    const next = folders.find(
      (f) => f.parentFolderId === current!.folderId && slugEquals(f.name, segments[i])
    )
    if (!next) break
    current = next
  }
  return current
}

function syncVaultRoute(
  next: Selection,
  folders: FolderDto[],
  pathname: string,
  go: (path: string) => void
): void {
  if (next.type === 'root') {
    if (pathname !== '/') go('/')
    return
  }
  const folder = folders.find((f) => f.folderId === next.folderId)
  if (!folder) return
  const path = folderSlugPath(folder.folderId, folders)
  if (pathname !== path) go(path)
}

interface VaultClipboard {
  mode: 'copy' | 'cut'
  items: { fileId: string; categoryId: string | null }[]
}

function buildFolderTree(folders: FolderDto[]): FolderNode[] {
  const map = new Map<string, FolderNode>()
  for (const folder of folders) {
    map.set(folder.folderId, { ...folder, children: [] })
  }

  const roots: FolderNode[] = []
  for (const node of map.values()) {
    if (node.parentFolderId && map.has(node.parentFolderId)) {
      map.get(node.parentFolderId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  for (const node of map.values()) {
    node.children.sort(compareFoldersByOrder)
  }
  return roots.sort(compareFoldersByOrder)
}

function buildBreadcrumbs(folderId: string | null, folders: FolderDto[]): FolderDto[] {
  if (!folderId) return []
  const byId = new Map(folders.map((f) => [f.folderId, f]))
  const crumbs: FolderDto[] = []
  let cur = byId.get(folderId)
  while (cur) {
    crumbs.unshift(cur)
    cur = cur.parentFolderId ? byId.get(cur.parentFolderId) : undefined
  }
  return crumbs
}

function formatBytes(size: string): string {
  const n = Number(size)
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function fileTypeLabel(file: FileDto): string {
  const ext = file.originalFileName.includes('.')
    ? file.originalFileName.split('.').pop()?.toUpperCase()
    : null
  if (ext) return `${ext} File`
  if (file.mimeType) return file.mimeType
  return 'File'
}

function FileGlyph({ file }: { file: FileDto }): React.JSX.Element {
  const lower = `${file.mimeType ?? ''} ${file.originalFileName}`.toLowerCase()
  if (lower.includes('image') || /\.(png|jpe?g|gif|webp)$/i.test(file.originalFileName)) {
    return <FileImage className="size-5 text-sky-400" />
  }
  if (
    lower.includes('sheet') ||
    lower.includes('excel') ||
    /\.(xlsx?|csv)$/i.test(file.originalFileName)
  ) {
    return <FileSpreadsheet className="size-5 text-emerald-400" />
  }
  if (
    lower.includes('zip') ||
    lower.includes('archive') ||
    /\.(zip|rar|7z)$/i.test(file.originalFileName)
  ) {
    return <FileArchive className="size-5 text-amber-400" />
  }
  if (
    lower.includes('pdf') ||
    lower.includes('text') ||
    /\.(txt|md|pdf|docx?)$/i.test(file.originalFileName)
  ) {
    return <FileText className="size-5 text-sv-accent" />
  }
  return <File className="size-5 text-sv-text-muted" />
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  )
}

/** Preload must be fully restarted after API changes — prefer nested + flat bridges. */
function apiMoveFile(payload: { fileId: string; targetFolderId: string }): Promise<FileDto> {
  return api.moveFile(payload)
}

function apiCopyFile(payload: { fileId: string; targetFolderId: string }): Promise<FileDto> {
  return api.copyFile(payload)
}

function FolderTreeItem({
  node,
  depth,
  selectedId,
  onSelect
}: {
  node: FolderNode
  depth: number
  selectedId: string | null
  onSelect: (folder: FolderDto) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(true)
  const selected = selectedId === node.folderId

  return (
    <div>
      <button
        type="button"
        className={cn(
          'flex min-h-10 w-full items-center gap-1 rounded-md px-2 py-2 text-left text-sm transition md:min-h-0 md:py-1.5',
          selected
            ? 'bg-sv-accent/15 text-sv-accent'
            : 'text-sv-text-muted hover:bg-sv-surface-raised hover:text-sv-text'
        )}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => onSelect(node)}
      >
        <span
          className="inline-flex size-5 items-center justify-center md:size-4"
          onClick={(e) => {
            e.stopPropagation()
            setOpen((v) => !v)
          }}
        >
          {node.children.length > 0 ? (
            <ChevronRight className={cn('size-3.5 transition', open && 'rotate-90')} />
          ) : (
            <span className="size-3.5" />
          )}
        </span>
        {open || selected ? (
          <FolderOpen className="size-4 shrink-0" />
        ) : (
          <Folder className="size-4 shrink-0" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {open
        ? node.children.map((child) => (
            <FolderTreeItem
              key={child.folderId}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))
        : null}
    </div>
  )
}

export default function VaultBrowser(): React.JSX.Element {
  const queryClient = useQueryClient()
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams()
  const routeSlugPath = params['*'] ?? ''
  const [searchParams, setSearchParams] = useSearchParams()
  const [selection, setSelection] = useState<Selection>({ type: 'root' })
  const [fileNameFolder, setFileNameFolder] = useState<FolderDto | null>(null)
  const [navHistory, setNavHistory] = useState<Selection[]>([{ type: 'root' }])
  const search = searchParams.get('q') ?? ''
  const [folderFilter, setFolderFilter] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [ingestActive, setIngestActive] = useState(false)
  const [staged, setStaged] = useState<StagedFile[]>([])
  const uploadWait = useRef<StagedFile[]>([])
  const uploadInflight = useRef(0)
  const [passwordTarget, setPasswordTarget] = useState<FileDto | null>(null)
  const [viewer, setViewer] = useState<OpenedFileView | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [moveTarget, setMoveTarget] = useState<FileDto | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<FileDto | null>(null)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [pendingBatch, setPendingBatch] = useState<{ files: File[]; folderId: string } | null>(
    null
  )
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([])
  const [selectedFolderRowId, setSelectedFolderRowId] = useState<string | null>(null)
  const [clipboard, setClipboard] = useState<VaultClipboard | null>(null)
  const [contextMenu, setContextMenu] = useState<VaultContextMenuState | null>(null)
  const [pasteTargetFolderId, setPasteTargetFolderId] = useState<string | null>(null)

  function setSearch(value: string): void {
    const next = new URLSearchParams(searchParams)
    if (value) next.set('q', value)
    else next.delete('q')
    setSearchParams(next, { replace: true })
  }

  function broadenToGlobal(): void {
    const q = folderFilterTerm
    setFolderFilter('')
    setSearch(q)
    navigate({ pathname: '/', search: `?q=${encodeURIComponent(q)}` })
  }

  const sidebarQuery = useQuery({
    queryKey: ['sidebar'],
    queryFn: () => api.ensureSidebar()
  })

  const folders = sidebarQuery.data?.folders ?? []
  const categories = sidebarQuery.data?.categories ?? []

  // Which modules demand a per-file password. Everything else is governed by the
  // folder ACL alone, so those files open without a prompt.
  const requiresPasswordByCategoryId = useMemo(
    () => new Map(categories.map((c) => [c.categoryId, c.requiresFilePassword])),
    [categories]
  )

  function categoryRequiresPassword(categoryId: string | null | undefined): boolean {
    if (!categoryId) return true // Unknown policy — ask, rather than assume open.
    return requiresPasswordByCategoryId.get(categoryId) ?? true
  }

  function folderRequiresPassword(folderId: string | null | undefined): boolean {
    const folder = folders.find((f) => f.folderId === folderId)
    return categoryRequiresPassword(folder?.categoryId)
  }

  useEffect(() => {
    const segments = parsePathSegments(routeSlugPath)
    if (segments.length === 0) {
      setSelection((prev) => (prev.type === 'root' ? prev : { type: 'root' }))
      return
    }
    // Wait for the tree before trying to resolve a deep link on first paint.
    if (folders.length === 0) return
    const target = resolveSlugSegments(segments, folders)
    if (!target) return
    setSelection((prev) =>
      prev.type === 'folder' && prev.folderId === target.folderId
        ? prev
        : { type: 'folder', folderId: target.folderId, categoryId: target.categoryId }
    )
  }, [routeSlugPath, folders])

  const folderFilterTerm = folderFilter.trim()
  const isFolderFiltering = selection.type === 'folder' && folderFilterTerm.length >= 2
  const isSearching = search.trim().length > 0
  const currentFolderId = selection.type === 'folder' ? selection.folderId : ''
  const includeSubfolders =
    selection.type === 'folder' &&
    (Boolean(folders.find((f) => f.folderId === currentFolderId)?.isCategoryRoot) ||
      folders.some((f) => f.parentFolderId === currentFolderId))

  const filesQuery = useQuery({
    queryKey: ['files', selection],
    queryFn: () => {
      if (selection.type === 'folder') {
        return api.listFiles({ folderId: selection.folderId })
      }
      return Promise.resolve([] as FileDto[])
    },
    enabled: selection.type === 'folder' && !isSearching,
    staleTime: 30_000,
    gcTime: 5 * 60_000
  })

  const loadedCount = filesQuery.data?.length ?? 0
  const filePrefixIndex = useMemo(
    () => new PrefixIndex(filesQuery.data ?? [], (file) => file.displayName),
    [filesQuery.data]
  )
  const useClientFolderFilter =
    isFolderFiltering &&
    !includeSubfolders &&
    filesQuery.isSuccess &&
    loadedCount <= CLIENT_SCOPED_SEARCH_LIMIT
  const useServerFolderFilter = isFolderFiltering && !useClientFolderFilter

  const globalSearchQuery = useQuery({
    queryKey: ['search', 'global', search.trim()],
    queryFn: ({ signal }) => api.search(search.trim(), { limit: 50, signal }),
    enabled: isSearching,
    staleTime: GLOBAL_SEARCH_STALE_MS,
    gcTime: 5 * 60_000
  })

  const folderSearchQuery = useQuery({
    queryKey: ['search', 'folder', currentFolderId, folderFilterTerm, includeSubfolders],
    queryFn: ({ signal }) =>
      api.searchFolder({
        folderId: currentFolderId,
        q: folderFilterTerm,
        includeSubfolders,
        limit: 50,
        signal
      }),
    enabled: useServerFolderFilter,
    staleTime: SCOPED_SEARCH_STALE_MS,
    gcTime: SCOPED_SEARCH_GC_MS
  })

  const deleteMutation = useMutation({
    mutationFn: async (fileIds: string[]) => {
      for (const id of fileIds) {
        await api.deleteFile(id)
      }
    },
    onSuccess: async (_data, fileIds) => {
      setStatus(fileIds.length > 1 ? `Deleted ${fileIds.length} files.` : 'File deleted.')
      setSelectedFileIds([])
      await queryClient.invalidateQueries({ queryKey: ['files'] })
      await queryClient.invalidateQueries({ queryKey: ['search'] })
    },
    onError: (error: Error) => {
      setStatus(error.message || 'Delete failed.')
    }
  })

  const deleteFolderMutation = useMutation({
    mutationFn: (folderId: string) => api.deleteFolder(folderId),
    onSuccess: async (folder) => {
      setStatus(`Folder “${folder.name}” deleted.`)
      setSelectedFolderRowId(null)
      setContextMenu(null)
      await queryClient.invalidateQueries({ queryKey: ['sidebar'] })
      await queryClient.invalidateQueries({ queryKey: ['files'] })
      await queryClient.invalidateQueries({ queryKey: ['search'] })
    },
    onError: (error: Error) => {
      setStatus(error.message || 'Could not delete folder.')
    }
  })

  const createFolderMutation = useMutation({
    mutationFn: (payload: { name: string; parentFolderId: string }) =>
      api.createFolder(payload),
    onSuccess: async (folder) => {
      setNewFolderName('')
      setCreatingFolder(false)
      setStatus(`Folder “${folder.name}” created.`)
      await queryClient.invalidateQueries({ queryKey: ['sidebar'] })
    },
    onError: (error: Error) => {
      setStatus(error.message || 'Could not create folder.')
    }
  })

  const moveMutation = useMutation({
    mutationFn: (payload: { fileId: string; targetFolderId: string }) => apiMoveFile(payload),
    onSuccess: async (file) => {
      setMoveTarget(null)
      setMoveError(null)
      setStatus(`Moved “${file.displayName}”.`)
      await queryClient.invalidateQueries({ queryKey: ['files'] })
      await queryClient.invalidateQueries({ queryKey: ['search'] })
      void api.auth.touch()
    },
    onError: (error: Error) => {
      setMoveError(error.message || 'Move failed.')
    }
  })

  const renameMutation = useMutation({
    mutationFn: (payload: { fileId: string; displayName: string }) => api.renameFile(payload),
    onSuccess: async (file) => {
      setRenameTarget(null)
      setRenameError(null)
      setStatus(`Renamed to “${file.displayName}”.`)
      await queryClient.invalidateQueries({ queryKey: ['files'] })
      await queryClient.invalidateQueries({ queryKey: ['search'] })
      void api.auth.touch()
    },
    onError: (error: Error) => {
      setRenameError(error.message || 'Rename failed.')
    }
  })

  const pasteMutation = useMutation({
    mutationFn: async (payload: {
      mode: 'copy' | 'cut'
      fileIds: string[]
      targetFolderId: string
    }) => {
      const results: FileDto[] = []
      for (const fileId of payload.fileIds) {
        if (payload.mode === 'cut') {
          results.push(await apiMoveFile({ fileId, targetFolderId: payload.targetFolderId }))
        } else {
          results.push(await apiCopyFile({ fileId, targetFolderId: payload.targetFolderId }))
        }
      }
      return { mode: payload.mode, results }
    },
    onSuccess: async ({ mode, results }) => {
      setStatus(
        mode === 'cut'
          ? `Moved ${results.length} item(s).`
          : `Pasted ${results.length} item(s).`
      )
      if (mode === 'cut') setClipboard(null)
      setSelectedFileIds([])
      await queryClient.invalidateQueries({ queryKey: ['files'] })
      await queryClient.invalidateQueries({ queryKey: ['search'] })
      void api.auth.touch()
    },
    onError: (error: Error) => {
      setStatus(error.message || 'Paste failed.')
    }
  })

  /** Opens a file that needs no password, without showing the prompt. */
  const directOpenMutation = useMutation({
    mutationFn: async (file: FileDto) => api.openFile({ fileId: file.fileId }),
    onSuccess: (opened) => {
      setViewer(opened)
      setStatus(`Viewing “${opened.displayName}”.`)
      void api.auth.touch()
    },
    onError: (error: Error) => {
      setStatus(error.message || 'Could not open this file.')
    }
  })

  /**
   * Route an open request: prompt only where the module policy asks for it.
   */
  function requestOpen(file: FileDto): void {
    if (categoryRequiresPassword(file.categoryId)) {
      setPasswordError(null)
      setPasswordTarget(file)
      return
    }
    directOpenMutation.mutate(file)
  }

  const passwordMutation = useMutation({
    mutationFn: async (password: string) => {
      if (!passwordTarget) throw new Error('No file selected.')
      return api.openFile({ fileId: passwordTarget.fileId, password })
    },
    onSuccess: (opened) => {
      setViewer(opened)
      setStatus(`Viewing “${opened.displayName}”.`)
      setPasswordTarget(null)
      setPasswordError(null)
      void api.auth.touch()
    },
    onError: (error: Error) => {
      setPasswordError(error.message || 'Incorrect password.')
    }
  })

  const tree = useMemo(() => buildFolderTree(folders), [folders])
  const selectedFolderId = selection.type === 'folder' ? selection.folderId : null
  const selectedFolder = folders.find((f) => f.folderId === selectedFolderId) ?? null
  const breadcrumbs = useMemo(
    () => buildBreadcrumbs(selectedFolderId, folders),
    [selectedFolderId, folders]
  )

  const childFolders = useMemo(() => {
    if (selection.type === 'root') {
      return folders.filter((f) => f.isCategoryRoot).sort(compareFoldersByOrder)
    }
    return folders
      .filter((f) => f.parentFolderId === selection.folderId)
      .sort(compareFoldersByOrder)
  }, [folders, selection])

  const childCountById = useMemo(() => {
    const map = new Map<string, number>()
    for (const folder of folders) {
      if (!folder.parentFolderId) continue
      map.set(folder.parentFolderId, (map.get(folder.parentFolderId) ?? 0) + 1)
    }
    return map
  }, [folders])

  // Module cards for the dashboard (root view): one per category root, with the
  // number of folders in that module and an accessibility flag.
  const moduleItems = useMemo<ModuleGridItem[]>(() => {
    return folders
      .filter((f) => f.isCategoryRoot)
      .map((root) => {
        const inCategory = folders.filter(
          (f) => !f.isCategoryRoot && f.categoryId === root.categoryId
        )
        return {
          folder: root,
          folderCount: inCategory.length,
          fileCount:
            (root.fileCount ?? 0) + inCategory.reduce((n, f) => n + (f.fileCount ?? 0), 0),
          restricted: !root.rights.view || Boolean(root.traverseOnly)
        }
      })
  }, [folders])

  const folderPrefixIndex = useMemo(
    () => new PrefixIndex(childFolders, (folder) => folder.name),
    [childFolders]
  )

  const highlightQuery = isSearching ? search.trim() : isFolderFiltering ? folderFilterTerm : ''

  const vaultVisibleFiles = useMemo(() => {
    if (isSearching) return globalSearchQuery.data?.files ?? []
    if (useClientFolderFilter) return filePrefixIndex.prefix(folderFilterTerm)
    if (useServerFolderFilter) return folderSearchQuery.data?.items ?? []
    return filesQuery.data ?? []
  }, [
    filePrefixIndex,
    filesQuery.data,
    folderFilterTerm,
    folderSearchQuery.data,
    globalSearchQuery.data,
    isSearching,
    useClientFolderFilter,
    useServerFolderFilter
  ])

  const stagedInFolder = useMemo(() => {
    if (isSearching || !selectedFolderId) return []
    const q = isFolderFiltering ? folderFilterTerm.toLowerCase() : ''
    return staged
      .filter((s) => s.folderId === selectedFolderId)
      .filter((s) => !q || s.displayName.toLowerCase().startsWith(q) || s.originalName.toLowerCase().startsWith(q))
      .map((s) => stagedToFileDto(s, folders.find((f) => f.folderId === s.folderId)))
  }, [staged, selectedFolderId, folders, isSearching, isFolderFiltering, folderFilterTerm])

  const visibleFiles = useMemo(
    () => [...stagedInFolder, ...vaultVisibleFiles],
    [stagedInFolder, vaultVisibleFiles]
  )

  const visibleFolders = useMemo(() => {
    if (isSearching) {
      const g = globalSearchQuery.data
      if (!g) return []
      return [...g.modules, ...g.folders]
    }
    if (isFolderFiltering) return folderPrefixIndex.prefix(folderFilterTerm)
    return childFolders
  }, [
    childFolders,
    folderFilterTerm,
    folderPrefixIndex,
    globalSearchQuery.data,
    isFolderFiltering,
    isSearching
  ])

  const fileById = useMemo(() => {
    const map = new Map<string, FileDto>()
    for (const s of staged) {
      map.set(s.localId, stagedToFileDto(s, folders.find((f) => f.folderId === s.folderId)))
    }
    for (const f of visibleFiles) map.set(f.fileId, f)
    for (const f of filesQuery.data ?? []) map.set(f.fileId, f)
    for (const f of folderSearchQuery.data?.items ?? []) map.set(f.fileId, f)
    for (const f of globalSearchQuery.data?.files ?? []) map.set(f.fileId, f)
    return map
  }, [staged, folders, visibleFiles, filesQuery.data, folderSearchQuery.data, globalSearchQuery.data])

  const here = vaultActions(selectedFolder?.rights ?? EMPTY_RIGHTS)
  const canCreateSubfolder =
    selection.type === 'folder' && Boolean(selectedFolder?.categoryId) && here.newFolder
  const managing = isAdmin && ingestActive
  const encryptingCount = staged.filter((s) => s.status === 'encrypting').length
  const ingestErrorCount = staged.filter((s) => s.status === 'error').length
  const canUploadHere = managing
  const canPasteHere =
    managing && selection.type === 'folder' && Boolean(clipboard?.items.length)
  const canCopyHere = managing
  const canCutHere = managing

  function actionsForFile(file: FileDto) {
    return vaultActions(folderRightsOf(folders, file.folderId))
  }

  function selectedFilesHave(flag: 'copy' | 'cut' | 'delete' | 'rename'): boolean {
    if (!selectedFileIds.length) return false
    if ((flag === 'cut' || flag === 'copy') && !managing) return false
    if (
      (flag === 'cut' || flag === 'copy') &&
      selectedFileIds.some((id) => staged.find((s) => s.localId === id)?.status === 'encrypting')
    ) {
      return false
    }
    if (managing && (flag === 'cut' || flag === 'copy' || flag === 'delete' || flag === 'rename')) {
      return selectedFileIds.every((id) => Boolean(fileById.get(id)))
    }
    return selectedFileIds.every((id) => {
      const file = fileById.get(id)
      if (!file) return false
      const acts = actionsForFile(file)
      if (flag === 'copy') return acts.copy
      if (flag === 'cut' || flag === 'delete') return acts.delete
      return acts.rename
    })
  }

  const parentOfCurrent =
    selectedFolder?.parentFolderId != null
      ? folders.find((f) => f.folderId === selectedFolder.parentFolderId) ?? null
      : null

  function navigateTo(next: Selection, pushHistory = true): void {
    setSelection(next)
    setSelectedFileIds([])
    setSelectedFolderRowId(null)
    setContextMenu(null)
    setSearch('')
    setFolderFilter('')
    setSidebarOpen(false)
    if (pushHistory) {
      setNavHistory((prev) => [...prev, next])
    }
    syncVaultRoute(next, folders, location.pathname, navigate)
  }

  function goBack(): void {
    setNavHistory((prev) => {
      if (prev.length <= 1) return prev
      const nextHist = prev.slice(0, -1)
      const dest = nextHist[nextHist.length - 1]!
      setSelection(dest)
      setSelectedFileIds([])
      syncVaultRoute(dest, folders, location.pathname, navigate)
      return nextHist
    })
  }

  function goUp(): void {
    if (selection.type === 'root') return
    if (parentOfCurrent) {
      navigateTo({
        type: 'folder',
        folderId: parentOfCurrent.folderId,
        categoryId: parentOfCurrent.categoryId
      })
    } else {
      navigateTo({ type: 'root' })
    }
  }

  function openFolder(folder: FolderDto): void {
    navigateTo({
      type: 'folder',
      folderId: folder.folderId,
      categoryId: folder.categoryId
    })
  }

  function enterFolder(folder: FolderDto): void {
    if (isAdmin && !ingestActive && !folder.isCategoryRoot) {
      setFileNameFolder(folder)
      return
    }
    openFolder(folder)
  }

  function startIngest(folder?: FolderDto | null): void {
    if (!isAdmin) return
    setIngestActive(true)
    if (folder) openFolder(folder)
  }

  function selectFile(fileId: string, event: React.MouseEvent | React.KeyboardEvent): void {
    setSelectedFolderRowId(null)
    const multi = 'ctrlKey' in event && (event.ctrlKey || event.metaKey)
    if (multi) {
      setSelectedFileIds((prev) =>
        prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
      )
      return
    }
    setSelectedFileIds([fileId])
  }

  function selectFolderRow(folderId: string): void {
    setSelectedFileIds([])
    setSelectedFolderRowId(folderId)
  }

  function openContextMenu(
    event: React.MouseEvent,
    target: ContextMenuTarget,
    pasteFolderId?: string | null
  ): void {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ x: event.clientX, y: event.clientY, target })
    setPasteTargetFolderId(pasteFolderId ?? null)
    if (target.kind === 'file') {
      if (!selectedFileIds.includes(target.fileId)) {
        setSelectedFileIds([target.fileId])
        setSelectedFolderRowId(null)
      }
    } else if (target.kind === 'folder') {
      selectFolderRow(target.folderId)
    }
  }

  async function pasteIntoFolder(targetFolderId: string): Promise<void> {
    if (!clipboard?.items.length) {
      setStatus('Clipboard is empty.')
      return
    }
    const target = folders.find((f) => f.folderId === targetFolderId)
    if (!target?.categoryId) {
      setStatus('Invalid paste destination.')
      return
    }
    const incompatible =
      !isAdmin &&
      clipboard.items.some((item) => item.categoryId && item.categoryId !== target.categoryId)
    if (incompatible) {
      setStatus('Files can only be pasted into the same category.')
      return
    }

    const stagedIds = clipboard.items
      .map((i) => i.fileId)
      .filter((id) => {
        if (!isStagedId(id)) return false
        return staged.find((s) => s.localId === id)?.status !== 'encrypting'
      })
    const vaultIds = clipboard.items.map((i) => i.fileId).filter((id) => !isStagedId(id))

    if (stagedIds.length) {
      const clonesToEncrypt: StagedFile[] = []
      setStaged((prev) => {
        if (clipboard.mode === 'copy') {
          const clones = prev
            .filter((s) => stagedIds.includes(s.localId))
            .map((s) => {
              const taken = namesTakenInFolder(targetFolderId, prev, filesQuery.data ?? [])
              const clone: StagedFile = {
                ...s,
                localId: newStagedId(),
                folderId: targetFolderId,
                displayName: uniqueDisplayName(s.displayName, taken),
                status: 'encrypting',
                error: undefined
              }
              clonesToEncrypt.push(clone)
              return clone
            })
          return [...prev, ...clones]
        }
        return prev.map((s) =>
          stagedIds.includes(s.localId) ? { ...s, folderId: targetFolderId } : s
        )
      })
      if (clipboard.mode === 'copy') {
        for (const clone of clonesToEncrypt) uploadWait.current.push(clone)
        pumpUploads()
      }
    }

    if (vaultIds.length) {
      await pasteMutation.mutateAsync({
        mode: clipboard.mode,
        fileIds: vaultIds,
        targetFolderId
      })
    }

    if (clipboard.mode === 'cut') setClipboard(null)
    setContextMenu(null)
  }

  async function pasteClipboard(): Promise<void> {
    if (pasteTargetFolderId) {
      await pasteIntoFolder(pasteTargetFolderId)
      setPasteTargetFolderId(null)
      return
    }
    if (!clipboard?.items.length) {
      setStatus('Clipboard is empty.')
      return
    }
    if (selection.type !== 'folder' || !selection.folderId) {
      setStatus('Open a folder before pasting.')
      return
    }
    await pasteIntoFolder(selection.folderId)
  }

  function deleteSelectedFolder(folderId: string): void {
    const folder = folders.find((f) => f.folderId === folderId)
    if (!folder || folder.isCategoryRoot || !folder.rights.delete) return
    const ok = window.confirm(
      `Delete folder “${folder.name}”?\n\nThis removes it from the vault. The folder must be empty.`
    )
    if (ok) void deleteFolderMutation.mutateAsync(folderId)
  }

  function deleteSelectedFiles(fileIds = selectedFileIds): void {
    if (!fileIds.length) return
    const encryptingIds = fileIds.filter(
      (id) => staged.find((s) => s.localId === id)?.status === 'encrypting'
    )
    if (encryptingIds.length) {
      setStatus('Wait until files finish encrypting before removing them.')
    }
    const stagedIds = fileIds.filter((id) => isStagedId(id) && !encryptingIds.includes(id))
    const vaultIds = fileIds.filter((id) => !isStagedId(id))

    if (stagedIds.length) {
      setStaged((prev) => prev.filter((s) => !stagedIds.includes(s.localId)))
      setSelectedFileIds((prev) => prev.filter((id) => !stagedIds.includes(id)))
      setStatus(
        stagedIds.length === 1
          ? 'Removed a file that failed to lock.'
          : `Removed ${stagedIds.length} files that failed to lock.`
      )
    }

    if (!vaultIds.length) return
    const allowed = vaultIds.every((id) => {
      const file = fileById.get(id)
      return file ? actionsForFile(file).delete || managing : false
    })
    if (!allowed) {
      setStatus('You do not have Delete on this folder.')
      return
    }
    const ok = window.confirm(
      vaultIds.length === 1
        ? 'Delete this file from the vault?'
        : `Delete ${vaultIds.length} files from the vault?`
    )
    if (ok) void deleteMutation.mutateAsync(vaultIds)
  }

  function copySelection(): void {
    if (!selectedFileIds.length) {
      setStatus('Select a file first (Ctrl+C).')
      return
    }
    if (!selectedFilesHave('copy')) {
      setStatus('You do not have Copy on this folder.')
      return
    }
    const items = selectedFileIds
      .map((id) => fileById.get(id))
      .filter((f): f is FileDto => Boolean(f))
      .map((f) => ({ fileId: f.fileId, categoryId: f.categoryId }))
    if (!items.length) {
      setStatus('Select a file first (Ctrl+C).')
      return
    }
    setClipboard({ mode: 'copy', items })
    setStatus(
      items.length === 1
        ? 'Copied. Open a folder and press Ctrl+V to paste.'
        : `Copied ${items.length} files. Press Ctrl+V to paste.`
    )
  }

  function cutSelection(): void {
    if (!selectedFileIds.length) {
      setStatus('Select a file first (Ctrl+X).')
      return
    }
    if (!selectedFilesHave('cut')) {
      setStatus('You do not have Delete on this folder (needed to cut).')
      return
    }
    const items = selectedFileIds
      .map((id) => fileById.get(id))
      .filter((f): f is FileDto => Boolean(f))
      .map((f) => ({ fileId: f.fileId, categoryId: f.categoryId }))
    if (!items.length) {
      setStatus('Select a file first (Ctrl+X).')
      return
    }
    setClipboard({ mode: 'cut', items })
    setStatus(
      items.length === 1
        ? 'Cut. Open a folder and press Ctrl+V to move.'
        : `Cut ${items.length} files. Press Ctrl+V to move.`
    )
  }

  function stageIncomingFiles(files: FileList | File[] | null): void {
    if (!isAdmin) return
    if (!ingestActive) {
      setStatus('Start an ingest session first (Manage files, or No fetch, upload).')
      return
    }
    if (selection.type !== 'folder' || !selection.folderId) {
      setStatus('Open a folder before adding files.')
      return
    }
    const list = files instanceof FileList ? Array.from(files) : (files ?? [])
    if (!list.length) return
    const folderId = selection.folderId

    // Modules that require a password collect one per drop, not per file — this
    // path has to stay usable for thousands of documents.
    if (folderRequiresPassword(folderId)) {
      setPendingBatch({ files: list, folderId })
      return
    }
    stageBatch(list, folderId, null)
  }

  function stageBatch(list: File[], folderId: string, accessPassword: string | null): void {
    const jobs: StagedFile[] = []
    let working = [...staged]
    for (const file of list) {
      const taken = namesTakenInFolder(folderId, working, filesQuery.data ?? [])
      const job: StagedFile = {
        localId: newStagedId(),
        file,
        originalName: file.name,
        displayName: uniqueDisplayName(displayNameFromFile(file.name), taken),
        folderId,
        addedAt: new Date().toISOString(),
        status: 'encrypting',
        accessPassword
      }
      working.push(job)
      jobs.push(job)
    }
    setStaged(working)
    for (const job of jobs) uploadWait.current.push(job)
    pumpUploads()
    setStatus(
      list.length === 1
        ? 'Encrypting file now…'
        : `Encrypting ${list.length} files now. They lock as they land.`
    )
  }

  function pumpUploads(): void {
    while (uploadInflight.current < INGEST_UPLOAD_CONCURRENCY && uploadWait.current.length) {
      const job = uploadWait.current.shift()
      if (!job) break
      uploadInflight.current += 1
      void encryptOne(job).finally(() => {
        uploadInflight.current -= 1
        pumpUploads()
      })
    }
  }

  async function encryptOne(job: StagedFile): Promise<void> {
    const folder = folders.find((f) => f.folderId === job.folderId)
    try {
      await api.addFile({
        file: job.file,
        displayName: job.displayName,
        categoryId: folder?.categoryId ?? '',
        folderId: job.folderId,
        accessPassword: job.accessPassword ?? null
      })
      setStaged((prev) => prev.filter((s) => s.localId !== job.localId))
      await queryClient.invalidateQueries({ queryKey: ['files'] })
      await queryClient.invalidateQueries({ queryKey: ['search'] })
      void api.auth.touch()
    } catch (err) {
      setStaged((prev) =>
        prev.map((s) =>
          s.localId === job.localId
            ? {
                ...s,
                status: 'error',
                error: err instanceof Error ? err.message : 'Could not lock this file.'
              }
            : s
        )
      )
    }
  }

  function retryFailedIngest(localId: string, displayName?: string): void {
    const job = staged.find((s) => s.localId === localId && s.status === 'error')
    if (!job) return
    const next: StagedFile = {
      ...job,
      displayName: displayName ?? job.displayName,
      status: 'encrypting',
      error: undefined
    }
    setStaged((prev) => prev.map((s) => (s.localId === localId ? next : s)))
    uploadWait.current.push(next)
    pumpUploads()
  }

  function handleFileInput(files: FileList | null): void {
    stageIncomingFiles(files)
  }

  function handleDrop(event: React.DragEvent<HTMLElement>): void {
    event.preventDefault()
    setDragOver(false)
    if (!canUploadHere) return
    const dropped = Array.from(event.dataTransfer.files)
    if (!dropped.length) return
    stageIncomingFiles(dropped)
  }

  function finishIngest(message?: string): void {
    uploadWait.current = []
    setStaged([])
    setIngestActive(false)
    setClipboard(null)
    setSelectedFileIds([])
    setStatus(message ?? 'Back at modules.')
    navigateTo({ type: 'root' })
    void queryClient.invalidateQueries({ queryKey: ['files'] })
    void queryClient.invalidateQueries({ queryKey: ['search'] })
    void queryClient.invalidateQueries({ queryKey: ['sidebar'] })
  }

  function finishSession(): void {
    if (encryptingCount > 0) {
      setStatus('Wait for files to finish encrypting, then click Done.')
      return
    }
    if (ingestErrorCount > 0) {
      const ok = window.confirm(
        `${ingestErrorCount} file${ingestErrorCount === 1 ? '' : 's'} failed to lock and will be discarded. Leave anyway?`
      )
      if (!ok) return
    }
    finishIngest('Back at modules. Added files are already locked.')
  }

  async function moveFileToFolder(fileId: string, targetFolderId: string): Promise<void> {
    if (!managing) {
      setStatus('Start an ingest session to move files.')
      return
    }
    const target = folders.find((f) => f.folderId === targetFolderId)
    if (!target?.categoryId) {
      setStatus('Invalid destination folder.')
      return
    }
    if (isStagedId(fileId)) {
      const job = staged.find((s) => s.localId === fileId)
      if (job?.status === 'encrypting') {
        setStatus('Wait until this file is locked, then move it.')
        return
      }
      setStaged((prev) =>
        prev.map((s) => (s.localId === fileId ? { ...s, folderId: targetFolderId } : s))
      )
      setMoveTarget(null)
      return
    }
    try {
      await moveMutation.mutateAsync({ fileId, targetFolderId })
    } catch {
      // surfaced via mutation
    }
  }

  useEffect(() => {
    if (!staged.length) return
    function onBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [staged.length])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (isTypingTarget(event.target)) return
      if (passwordTarget || moveTarget || renameTarget) return

      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()

      if (mod && key === 'c') {
        if (!selectedFilesHave('copy')) return
        event.preventDefault()
        copySelection()
        return
      }
      if (mod && key === 'x') {
        if (!selectedFilesHave('cut')) return
        event.preventDefault()
        cutSelection()
        return
      }
      if (mod && key === 'v') {
        if (!canPasteHere) return
        event.preventDefault()
        void pasteClipboard()
        return
      }
      if (mod && key === 'a') {
        event.preventDefault()
        setSelectedFileIds(visibleFiles.map((f) => f.fileId))
        return
      }
      if (key === 'f2') {
        const fileId = selectedFileIds.length === 1 ? selectedFileIds[0] : null
        const file = fileId ? visibleFiles.find((f) => f.fileId === fileId) : null
        if (!file || !actionsForFile(file).rename) return
        event.preventDefault()
        setRenameError(null)
        setRenameTarget(file)
        return
      }
      if (key === 'delete' || key === 'backspace') {
        if (selectedFolderRowId) {
          const folder = folders.find((f) => f.folderId === selectedFolderRowId)
          if (!folder?.rights.delete) return
          event.preventDefault()
          deleteSelectedFolder(selectedFolderRowId)
          return
        }
        if (!selectedFileIds.length || !selectedFilesHave('delete')) return
        event.preventDefault()
        deleteSelectedFiles()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedFileIds,
    selectedFolderRowId,
    clipboard,
    selection,
    visibleFiles,
    passwordTarget,
    moveTarget,
    renameTarget
  ])

  const isEmpty =
    !isSearching && !isFolderFiltering && visibleFolders.length === 0 && visibleFiles.length === 0
  const loading = isSearching
    ? globalSearchQuery.isLoading
    : useServerFolderFilter
      ? folderSearchQuery.isLoading
      : useClientFolderFilter
        ? false
        : filesQuery.isLoading
  const listError = isSearching
    ? globalSearchQuery.isError
    : useServerFolderFilter
      ? folderSearchQuery.isError
      : filesQuery.isError
  const listErrorMessage = (
    (isSearching
      ? globalSearchQuery.error
      : useServerFolderFilter
        ? folderSearchQuery.error
        : filesQuery.error) as Error | undefined
  )?.message
  const refetchList = (): void => {
    if (isSearching) void globalSearchQuery.refetch()
    else if (useServerFolderFilter) void folderSearchQuery.refetch()
    else void filesQuery.refetch()
  }
  const moduleTheme = moduleThemeForCategory(
    breadcrumbs[0]?.name ?? selectedFolder?.name
  )
  const clipboardCount = clipboard?.items.length ?? 0
  const isDashboard = selection.type === 'root' && !isSearching
  const isFolderGrid =
    selection.type === 'folder' &&
    !isSearching &&
    !isFolderFiltering &&
    Boolean(selectedFolder?.isCategoryRoot) &&
    !ingestActive
  const isImmersive = isDashboard || isFolderGrid
  const cutFileIds = useMemo(
    () =>
      clipboard?.mode === 'cut' ? new Set(clipboard.items.map((i) => i.fileId)) : new Set<string>(),
    [clipboard]
  )

  const contextMenuCanPaste = useMemo(() => {
    if (!clipboard?.items.length) return false
    const targetId =
      pasteTargetFolderId ?? (selection.type === 'folder' ? selection.folderId : null)
    if (!targetId) return false
    const target = folders.find((f) => f.folderId === targetId)
    if (!target?.categoryId) return false
    if (isAdmin) return managing
    if (!target.rights.edit) return false
    return !clipboard.items.some(
      (item) => item.categoryId && item.categoryId !== target.categoryId
    )
  }, [clipboard, pasteTargetFolderId, selection, folders, isAdmin, managing])

  const contextMenuAllows = useMemo(() => {
    if (!contextMenu) {
      return { cut: false, copy: false, rename: false, paste: false, delete: false }
    }
    const file =
      contextMenu.target.kind === 'file' ? fileById.get(contextMenu.target.fileId) : undefined
    const fileActs = file ? actionsForFile(file) : null
    return {
      cut: managing,
      copy: managing,
      rename: managing || Boolean(fileActs?.rename),
      paste: managing,
      delete:
        contextMenu.target.kind === 'file'
          ? managing || Boolean(fileActs?.delete)
          : contextMenu.target.kind === 'folder' && contextMenu.target.deletable
    }
  }, [contextMenu, fileById, managing])

  const sidebar = (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-sv-border px-3 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sv-text-muted">
          Navigation
        </p>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation"
        >
          <X className="size-4" />
        </Button>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        <button
          type="button"
          className={cn(
            'mb-1 flex min-h-10 w-full items-center gap-2 rounded-md px-2 py-2 text-sm transition md:min-h-0 md:py-1.5',
            selection.type === 'root'
              ? 'bg-sv-accent/15 text-sv-accent'
              : 'text-sv-text-muted hover:bg-sv-surface-raised hover:text-sv-text'
          )}
          onClick={() => navigateTo({ type: 'root' })}
        >
          <HardDrive className="size-4" />
          My Vault
        </button>

        <p className="mt-3 mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-sv-text-muted">
          Categories
        </p>

        {sidebarQuery.isLoading ? (
          <p className="px-2 py-3 text-xs text-sv-text-muted">Loading…</p>
        ) : tree.length === 0 ? (
          <p className="px-2 py-3 text-xs text-sv-text-muted">No categories yet.</p>
        ) : (
          tree.map((node) => (
            <FolderTreeItem
              key={node.folderId}
              node={node}
              depth={0}
              selectedId={selectedFolderId}
              onSelect={enterFolder}
            />
          ))
        )}
      </nav>
    </>
  )

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {isAdmin ? (
        <input
          ref={uploadInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFileInput(e.target.files)
            e.target.value = ''
          }}
        />
      ) : null}
      {managing ? (
        <IngestSessionBar
          encryptingCount={encryptingCount}
          errorCount={ingestErrorCount}
          onAdd={() => uploadInputRef.current?.click()}
          onDone={finishSession}
        />
      ) : null}
      {isImmersive ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isDashboard ? (
            <PageTransition viewKey="dashboard">
              <ModuleGrid
                items={moduleItems}
                loading={sidebarQuery.isLoading}
                error={sidebarQuery.isError}
                onRetry={() => void sidebarQuery.refetch()}
                isAdmin={isAdmin}
                onOpen={(folder) => openFolder(folder)}
              />
            </PageTransition>
          ) : (
            <PageTransition viewKey={`module-${selectedFolderId ?? 'x'}`}>
              <ModulePage
                theme={moduleTheme}
                folderName={selectedFolder?.name ?? 'Module'}
                tagline={
                  selectedFolder?.isCategoryRoot
                    ? moduleTheme.tagline
                    : `${breadcrumbs[0]?.name ?? 'Module'} · folder`
                }
                crumbs={[
                  {
                    label: 'My Vault',
                    onSelect: () => navigateTo({ type: 'root' })
                  },
                  ...breadcrumbs.map((crumb, index) => ({
                    label: crumb.name,
                    onSelect:
                      index === breadcrumbs.length - 1 ? undefined : () => openFolder(crumb)
                  }))
                ]}
                subfolders={childFolders}
                fileCount={selectedFolder?.fileCount ?? 0}
                childCountById={childCountById}
                loading={sidebarQuery.isLoading}
                denied={Boolean(selectedFolder && !selectedFolder.rights.view && !selectedFolder.traverseOnly)}
                folderFilter={folderFilter}
                onFolderFilterChange={setFolderFilter}
                onOpenFolder={enterFolder}
                onPickFile={(folder) => {
                  if (isAdmin && ingestActive) openFolder(folder)
                  else setFileNameFolder(folder)
                }}
                isAdmin={isAdmin}
                ingestActive={ingestActive}
                onStartIngest={() => startIngest(selectedFolder)}
                onUpload={() => uploadInputRef.current?.click()}
                onPaste={() => {
                  if (selectedFolderId) void pasteIntoFolder(selectedFolderId)
                }}
                canPaste={canPasteHere}
                pasteCount={clipboardCount}
                pastePending={pasteMutation.isPending}
                onPasteIntoFolder={(folder) => void pasteIntoFolder(folder.folderId)}
                onFilesDropped={(files) => handleFileInput(files)}
              />
            </PageTransition>
          )}
        </div>
      ) : (
      <div className="relative flex min-h-0 flex-1">
        {/* Mobile drawer backdrop */}
        {sidebarOpen ? (
          <button
            type="button"
            className="absolute inset-0 z-30 bg-black/50 md:hidden"
            aria-label="Close navigation overlay"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        {/* Sidebar: drawer on mobile, static on md+ */}
        <aside
          className={cn(
            'z-40 flex w-[min(100%,var(--sv-sidebar-width))] shrink-0 flex-col border-r border-sv-border bg-sv-surface',
            'fixed inset-y-0 left-0 top-[var(--sv-header-height)] transition-transform duration-fast ease-sv motion-reduce:transition-none md:static md:translate-x-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
            sidebarCollapsed && 'md:hidden'
          )}
          onMouseMove={() => void api.auth.touch()}
        >
          {sidebar}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="titlebar-no-drag flex flex-col gap-2 border-b border-sv-border bg-sv-surface/60 px-2 py-2 sm:px-3">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <Button
                size="icon"
                variant="ghost"
                className="md:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open navigation"
              >
                <Menu className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="hidden md:inline-flex"
                onClick={() => setSidebarCollapsed((v) => !v)}
                aria-label={sidebarCollapsed ? 'Show navigation' : 'Hide navigation'}
                title={sidebarCollapsed ? 'Show navigation' : 'Hide navigation'}
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="size-4" />
                ) : (
                  <PanelLeftClose className="size-4" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                disabled={navHistory.length <= 1}
                onClick={goBack}
                aria-label="Back"
              >
                <ArrowLeft className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                disabled={selection.type === 'root'}
                onClick={goUp}
                aria-label="Up one level"
              >
                <ArrowUp className="size-4" />
              </Button>

              <nav
                className="order-last flex min-w-0 basis-full items-center gap-1 overflow-x-auto rounded-lg border border-sv-border bg-sv-bg px-2 py-1.5 text-sm sm:order-none sm:basis-auto sm:flex-1"
                aria-label="Breadcrumb"
              >
                <button
                  type="button"
                  className={cn(
                    'shrink-0 rounded px-1.5 py-1 outline-none transition focus-visible:ring-2 focus-visible:ring-sv-accent',
                    selection.type === 'root'
                      ? 'font-medium text-sv-text'
                      : 'text-sv-text-muted hover:bg-sv-surface-raised hover:text-sv-text'
                  )}
                  onClick={() => navigateTo({ type: 'root' })}
                >
                  My Vault
                </button>
                {breadcrumbs.map((crumb) => (
                  <span key={crumb.folderId} className="flex min-w-0 items-center gap-1">
                    <ChevronRight className="size-3.5 shrink-0 text-sv-text-muted" />
                    <button
                      type="button"
                      className={cn(
                        'max-w-[140px] truncate rounded px-1.5 py-1 outline-none transition focus-visible:ring-2 focus-visible:ring-sv-accent sm:max-w-[160px]',
                        crumb.folderId === selectedFolderId
                          ? 'font-medium text-sv-text'
                          : 'text-sv-text-muted hover:bg-sv-surface-raised hover:text-sv-text'
                      )}
                      onClick={() => openFolder(crumb)}
                    >
                      {crumb.name}
                    </button>
                  </span>
                ))}
              </nav>

              {selection.type === 'folder' && !isSearching ? (
              <div className="relative min-w-0 flex-1 basis-full sm:basis-auto sm:w-44 sm:flex-none md:w-52">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-sv-text-muted" />
                <input
                  value={folderFilter}
                  onChange={(e) => setFolderFilter(e.target.value)}
                  placeholder="Filter this folder…"
                  aria-label="Filter this folder"
                  className="h-11 w-full rounded-md border border-sv-border bg-sv-bg pr-2 pl-8 text-sm text-sv-text outline-none placeholder:text-sv-text-muted focus:border-sv-accent focus:ring-2 focus:ring-sv-accent focus:ring-offset-2 focus:ring-offset-sv-surface sm:h-9 sm:text-xs"
                />
              </div>
              ) : null}

              {canCreateSubfolder ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="hidden h-9 gap-1.5 sm:inline-flex sm:h-8"
                  onClick={() => setCreatingFolder((v) => !v)}
                >
                  <FolderPlus className="size-3.5" />
                  <span className="hidden md:inline">New folder</span>
                </Button>
              ) : null}

              {canUploadHere ? (
                <Button
                  size="sm"
                  className="h-9 gap-1.5 sm:h-8"
                  onClick={() => uploadInputRef.current?.click()}
                >
                  <Upload className="size-3.5" />
                  <span className="hidden xs:inline sm:inline">Upload</span>
                </Button>
              ) : null}
            </div>

            {/* Clipboard / selection actions — touch-friendly */}
            <div className="flex flex-wrap items-center gap-1">
              {canCutHere ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1 px-2 text-xs"
                  disabled={!selectedFileIds.length}
                  onClick={cutSelection}
                  title="Cut (Ctrl+X)"
                >
                  <Scissors className="size-3.5" />
                  Cut
                </Button>
              ) : null}
              {canCopyHere ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1 px-2 text-xs"
                  disabled={!selectedFileIds.length}
                  onClick={copySelection}
                  title="Copy (Ctrl+C)"
                >
                  <Copy className="size-3.5" />
                  Copy
                </Button>
              ) : null}
              {canPasteHere || managing ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1 px-2 text-xs"
                  disabled={!canPasteHere || pasteMutation.isPending}
                  onClick={() => void pasteClipboard()}
                  title="Paste (Ctrl+V)"
                >
                  <ClipboardPaste className="size-3.5" />
                  Paste{clipboardCount ? ` (${clipboardCount})` : ''}
                </Button>
              ) : null}
              {canCreateSubfolder ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1 px-2 text-xs sm:hidden"
                  onClick={() => setCreatingFolder((v) => !v)}
                >
                  <FolderPlus className="size-3.5" />
                  Folder
                </Button>
              ) : null}
              {clipboard ? (
                <span className="ml-auto text-[11px] text-sv-text-muted">
                  {clipboard.mode === 'cut' ? 'Cut' : 'Copied'}: {clipboardCount} ready to paste
                </span>
              ) : null}
            </div>

            {creatingFolder && canCreateSubfolder ? (
              <div className="flex flex-wrap items-center gap-2">
                <FolderPlus className="size-4 text-sv-accent" />
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newFolderName.trim() && selectedFolderId) {
                      void createFolderMutation.mutateAsync({
                        name: newFolderName.trim(),
                        parentFolderId: selectedFolderId
                      })
                    }
                    if (e.key === 'Escape') {
                      setCreatingFolder(false)
                      setNewFolderName('')
                    }
                  }}
                  placeholder="Folder name"
                  className="h-9 min-w-0 flex-1 rounded-md border border-sv-border bg-sv-bg px-2 text-sm text-sv-text outline-none focus:border-sv-accent sm:h-8 sm:max-w-xs"
                />
                <Button
                  size="sm"
                  className="h-9 sm:h-8"
                  disabled={!newFolderName.trim() || createFolderMutation.isPending}
                  onClick={() => {
                    if (!selectedFolderId) return
                    void createFolderMutation.mutateAsync({
                      name: newFolderName.trim(),
                      parentFolderId: selectedFolderId
                    })
                  }}
                >
                  {createFolderMutation.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    'Create'
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 sm:h-8"
                  onClick={() => {
                    setCreatingFolder(false)
                    setNewFolderName('')
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : null}
          </div>

          <main
            className={cn(
              'relative min-h-0 flex-1 overflow-y-auto transition',
              dragOver && 'bg-sv-accent/5'
            )}
            onDragOver={(e) => {
              if (!canUploadHere) return
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => {
              setSelectedFileIds([])
              setSelectedFolderRowId(null)
              setContextMenu(null)
            }}
            onContextMenu={(e) => {
              if (selection.type === 'folder' && selection.folderId) {
                openContextMenu(e, { kind: 'background' }, selection.folderId)
              }
            }}
          >
            {dragOver ? (
              <div className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-[var(--sv-radius)] border-2 border-dashed border-sv-accent bg-sv-accent/10">
                <p className="px-4 text-center text-sm font-medium text-sv-accent">
                  Drop files to encrypt into this location
                </p>
              </div>
            ) : null}

            {status ? (
              <p
                className="truncate border-b border-sv-border px-3 py-2 text-xs text-sv-text-muted sm:px-4"
                title={status}
              >
                {status}
              </p>
            ) : null}

            {isSearching ? (
              <p className="px-3 py-2 text-xs text-sv-text-muted sm:px-4">
                Search results across vault
                {globalSearchQuery.data?.fileTotal != null
                  ? ` · ${globalSearchQuery.data.fileTotal} file${globalSearchQuery.data.fileTotal === 1 ? '' : 's'}`
                  : ''}
              </p>
            ) : isFolderFiltering ? (
              <p className="px-3 py-2 text-xs text-sv-text-muted sm:px-4">
                Files in this folder starting with “{folderFilterTerm}”
                {useServerFolderFilter && folderSearchQuery.data?.total != null
                  ? ` · ${folderSearchQuery.data.total}`
                  : useClientFolderFilter
                    ? ` · ${visibleFiles.length}`
                    : ''}
              </p>
            ) : null}

            {selectedFolder?.traverseOnly && !isSearching ? (
              <p className="px-3 py-2 text-xs text-sv-text-muted sm:px-4">
                You can open this folder to reach folders you have access to. Files and other
                subfolders here stay hidden.
              </p>
            ) : null}

            {loading ? (
              <ul className="space-y-1 p-2 pb-24 md:space-y-0 md:p-0 md:pb-8" aria-busy="true" aria-label="Loading files">
                {Array.from({ length: 6 }).map((_, i) => (
                  <FileRowSkeleton key={i} />
                ))}
              </ul>
            ) : listError ? (
              <ErrorState
                title={
                  isSearching
                    ? 'Search didn’t finish'
                    : isFolderFiltering
                      ? 'Folder search didn’t finish'
                      : 'This folder didn’t load'
                }
                description={
                  listErrorMessage ||
                  'We couldn’t list files just now. Try again — nothing has been changed.'
                }
                onRetry={refetchList}
              />
            ) : (
              <PageTransition viewKey="folder">
                {isEmpty ? (
                  <EmptyState
                    icon={FolderOpen}
                    title="This folder is empty"
                    description={
                      managing
                        ? 'Add files here — each one encrypts as it lands. Then cut and paste into the right folders. Done returns to modules.'
                        : 'You can view files in this folder.'
                    }
                    action={
                      managing ? (
                        <Button
                          size="sm"
                          className="gap-1.5"
                          onClick={() => uploadInputRef.current?.click()}
                        >
                          <Upload className="size-3.5" />
                          Add files
                        </Button>
                      ) : isAdmin ? (
                        <Button size="sm" className="gap-1.5" onClick={() => startIngest(selectedFolder)}>
                          <Upload className="size-3.5" />
                          Manage files
                        </Button>
                      ) : null
                    }
                  />
                ) : (isSearching || isFolderFiltering) &&
                  visibleFiles.length === 0 &&
                  visibleFolders.length === 0 ? (
                  <EmptyState
                    icon={Search}
                    title="No matches"
                    description={
                      isSearching
                        ? `Nothing in the vault is named like “${search.trim()}”.`
                        : `No files in this folder start with “${folderFilterTerm}”. Broaden to search the whole vault?`
                    }
                    action={
                      isFolderFiltering ? (
                        <Button variant="secondary" size="sm" onClick={broadenToGlobal}>
                          Search whole vault
                        </Button>
                      ) : null
                    }
                  />
                ) : (
              <div>
                {/* Desktop column headers */}
                <div className="sticky top-0 z-[1] hidden grid-cols-[minmax(180px,2fr)_150px_120px_80px_180px] gap-2 border-b border-sv-border bg-sv-surface/95 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-sv-text-muted backdrop-blur md:grid">
                  <span>Name</span>
                  <span>Date modified</span>
                  <span>Type</span>
                  <span className="text-right">Size</span>
                  <span className="text-right">Actions</span>
                </div>

                <ul className="space-y-1 p-2 pb-24 md:space-y-0 md:p-0 md:pb-8">
                  {visibleFolders.map((folder) => {
                    const dropHover = dropTargetFolderId === folder.folderId
                    const rowSelected = selectedFolderRowId === folder.folderId
                    const deletable = !folder.isCategoryRoot && folder.rights.delete
                    return (
                      <li key={folder.folderId}>
                        <div
                          role="button"
                          tabIndex={0}
                          className={cn(
                            'flex cursor-default items-center gap-3 rounded-xl border border-sv-border/70 bg-sv-surface/60 px-3 py-3 transition md:grid md:grid-cols-[minmax(180px,2fr)_150px_120px_80px_180px] md:gap-2 md:rounded-none md:border-0 md:border-b md:border-sv-border/60 md:bg-transparent md:px-4 md:py-2',
                            rowSelected && 'border-sv-accent/50 bg-sv-accent/10',
                            dropHover && 'bg-sv-accent/20 ring-1 ring-sv-accent/40',
                            !rowSelected && !dropHover && 'hover:bg-sv-surface-raised/80'
                          )}
                          onClick={(e) => {
                            e.stopPropagation()
                            selectFolderRow(folder.folderId)
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            enterFolder(folder)
                          }}
                          onContextMenu={(e) => {
                            openContextMenu(
                              e,
                              { kind: 'folder', folderId: folder.folderId, deletable },
                              folder.folderId
                            )
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') enterFolder(folder)
                          }}
                          onDragOver={(e) => {
                            if (!e.dataTransfer.types.includes('application/x-sv-file')) return
                            if (!folder.rights.edit) return
                            e.preventDefault()
                            e.stopPropagation()
                            setDropTargetFolderId(folder.folderId)
                          }}
                          onDragLeave={() => {
                            setDropTargetFolderId((id) =>
                              id === folder.folderId ? null : id
                            )
                          }}
                          onDrop={(e) => {
                            const fileId = e.dataTransfer.getData('application/x-sv-file')
                            if (!fileId) return
                            e.preventDefault()
                            e.stopPropagation()
                            setDropTargetFolderId(null)
                            void moveFileToFolder(fileId, folder.folderId)
                          }}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2.5">
                            <Folder className="size-5 shrink-0 text-amber-400" />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-sv-text">
                                <HighlightMatch text={folder.name} query={highlightQuery} />
                              </p>
                              <p className="text-[11px] text-sv-text-muted md:hidden">
                                Folder · {formatDate(folder.createdAt)}
                              </p>
                            </div>
                          </div>
                          <span className="hidden truncate text-sm text-sv-text-muted md:block">
                            {formatDate(folder.createdAt)}
                          </span>
                          <span className="hidden truncate text-sm text-sv-text-muted md:block">
                            File folder
                          </span>
                          <span className="hidden text-right text-sm text-sv-text-muted md:block">
                            —
                          </span>
                          <div
                            className="flex shrink-0 justify-end gap-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-xs md:h-7"
                              onClick={() => enterFolder(folder)}
                            >
                              Open
                            </Button>
                            {deletable ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8 text-sv-danger hover:text-sv-danger md:size-7"
                                title="Delete folder"
                                onClick={() => deleteSelectedFolder(folder.folderId)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    )
                  })}

                  {visibleFiles.map((file) => {
                    const selected = selectedFileIds.includes(file.fileId)
                    const isCut = cutFileIds.has(file.fileId)
                    const acts = actionsForFile(file)
                    const stagedItem = isStagedId(file.fileId)
                      ? staged.find((s) => s.localId === file.fileId)
                      : undefined
                    const pending = Boolean(stagedItem)
                    return (
                      <li key={file.fileId}>
                        <div
                          role="button"
                          tabIndex={0}
                          draggable={managing && stagedItem?.status !== 'encrypting'}
                          className={cn(
                            'flex cursor-default items-center gap-3 rounded-xl border border-sv-border/70 bg-sv-surface/60 px-3 py-3 transition md:grid md:grid-cols-[minmax(180px,2fr)_150px_120px_80px_180px] md:gap-2 md:rounded-none md:border-0 md:border-b md:border-sv-border/60 md:bg-transparent md:px-4 md:py-2',
                            selected && 'border-sv-accent/50 bg-sv-accent/10 md:bg-sv-accent/10',
                            isCut && 'opacity-50',
                            pending && 'border-dashed',
                            !selected && 'hover:bg-sv-surface-raised/80'
                          )}
                          onClick={(e) => {
                            e.stopPropagation()
                            selectFile(file.fileId, e)
                          }}
                          onContextMenu={(e) => {
                            openContextMenu(e, { kind: 'file', fileId: file.fileId })
                          }}
                          onDoubleClick={() => {
                            if (stagedItem) {
                              setViewer({
                                fileId: stagedItem.localId,
                                displayName: stagedItem.displayName,
                                mimeType: stagedItem.file.type || null,
                                blob: stagedItem.file
                              })
                              return
                            }
                            requestOpen(file)
                          }}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/x-sv-file', file.fileId)
                            e.dataTransfer.effectAllowed = 'move'
                            if (!selectedFileIds.includes(file.fileId)) {
                              setSelectedFileIds([file.fileId])
                            }
                          }}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2.5">
                            <FileGlyph file={file} />
                            <div className="min-w-0">
                              <p className="flex min-w-0 items-center gap-2">
                                <span className="truncate font-medium text-sv-text">
                                  <HighlightMatch text={file.displayName} query={highlightQuery} />
                                </span>
                                {pending ? (
                                  <Badge
                                    variant={stagedItem?.status === 'error' ? 'danger' : 'warning'}
                                    size="sm"
                                  >
                                    {stagedItem?.status === 'error' ? 'Failed' : 'Encrypting'}
                                  </Badge>
                                ) : null}
                              </p>
                              <p className="flex items-center gap-1 truncate text-[11px] text-sv-text-muted">
                                {pending ? null : (
                                  <Lock className="size-2.5 shrink-0 text-sv-success" />
                                )}
                                <span className="truncate md:hidden">
                                  {formatBytes(file.sizeBytes)} · {fileTypeLabel(file)}
                                </span>
                                <span className="hidden truncate md:inline">
                                  {stagedItem?.error || file.originalFileName}
                                </span>
                              </p>
                            </div>
                          </div>
                          <span className="hidden truncate text-sm text-sv-text-muted md:block">
                            {pending ? (stagedItem?.status === 'error' ? 'Failed' : 'Encrypting') : formatDate(file.updatedAt)}
                          </span>
                          <span className="hidden truncate text-sm text-sv-text-muted md:block">
                            {fileTypeLabel(file)}
                          </span>
                          <span className="hidden text-right text-sm tabular-nums text-sv-text-muted md:block">
                            {formatBytes(file.sizeBytes)}
                          </span>
                          <div
                            className="flex shrink-0 justify-end gap-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {pending || acts.view ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8 md:size-7"
                                title="View"
                                onClick={() => {
                                  if (stagedItem) {
                                    setViewer({
                                      fileId: stagedItem.localId,
                                      displayName: stagedItem.displayName,
                                      mimeType: stagedItem.file.type || null,
                                      blob: stagedItem.file
                                    })
                                    return
                                  }
                                  requestOpen(file)
                                }}
                              >
                                <Eye className="size-3.5" />
                              </Button>
                            ) : null}
                            {managing && stagedItem?.status !== 'encrypting' ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="hidden size-7 sm:inline-flex"
                                title="Move"
                                onClick={() => {
                                  setMoveError(null)
                                  setMoveTarget(file)
                                }}
                              >
                                <MoveRight className="size-3.5" />
                              </Button>
                            ) : null}
                            {stagedItem?.status === 'error' ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2 text-xs md:h-7"
                                title="Retry encrypt"
                                onClick={() => retryFailedIngest(stagedItem.localId)}
                              >
                                Retry
                              </Button>
                            ) : null}
                            {(!stagedItem || stagedItem.status !== 'encrypting') &&
                            (managing || acts.rename) ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="hidden size-7 sm:inline-flex"
                                title="Rename"
                                onClick={() => {
                                  setRenameError(null)
                                  setRenameTarget(file)
                                }}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                            ) : null}
                            {managing || acts.delete ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8 text-sv-danger hover:text-sv-danger md:size-7"
                                title="Delete"
                                onClick={() => deleteSelectedFiles([file.fileId])}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
                )}
              </PageTransition>
            )}
          </main>
        </section>
      </div>
      )}

      {contextMenu ? (
        <VaultContextMenu
          state={contextMenu}
          canPaste={contextMenuCanPaste}
          allowCut={contextMenuAllows.cut}
          allowCopy={contextMenuAllows.copy}
          allowRename={contextMenuAllows.rename}
          allowPaste={contextMenuAllows.paste}
          allowDelete={contextMenuAllows.delete}
          onClose={() => {
            setContextMenu(null)
            setPasteTargetFolderId(null)
          }}
          onCut={() => {
            cutSelection()
            setContextMenu(null)
          }}
          onCopy={() => {
            copySelection()
            setContextMenu(null)
          }}
          onPaste={() => {
            void pasteClipboard()
            setContextMenu(null)
          }}
          onRename={
            contextMenu.target.kind === 'file'
              ? () => {
                  const target = contextMenu.target
                  const file = target.kind === 'file' ? fileById.get(target.fileId) : undefined
                  if (file) {
                    setRenameError(null)
                    setRenameTarget(file)
                  }
                  setContextMenu(null)
                }
              : undefined
          }
          onDelete={() => {
            if (contextMenu.target.kind === 'file') {
              deleteSelectedFiles([contextMenu.target.fileId])
            } else if (contextMenu.target.kind === 'folder') {
              deleteSelectedFolder(contextMenu.target.folderId)
            }
            setContextMenu(null)
          }}
        />
      ) : null}

      {passwordTarget ? (
        <PasswordPromptModal
          file={passwordTarget}
          submitting={passwordMutation.isPending}
          error={passwordError}
          onCancel={() => {
            setPasswordTarget(null)
            setPasswordError(null)
          }}
          onConfirm={(password) => {
            void passwordMutation.mutateAsync(password)
          }}
        />
      ) : null}

      {pendingBatch ? (
        <BatchPasswordModal
          folderName={
            folders.find((f) => f.folderId === pendingBatch.folderId)?.name ?? 'this folder'
          }
          fileCount={pendingBatch.files.length}
          onCancel={() => {
            setPendingBatch(null)
            setStatus('Upload cancelled.')
          }}
          onConfirm={(password) => {
            const batch = pendingBatch
            setPendingBatch(null)
            stageBatch(batch.files, batch.folderId, password)
          }}
        />
      ) : null}

      {moveTarget ? (
        <MoveFileModal
          file={moveTarget}
          folders={folders}
          currentFolderId={moveTarget.folderId}
          allowAnyFolder={isAdmin}
          submitting={moveMutation.isPending}
          error={moveError}
          onCancel={() => {
            setMoveTarget(null)
            setMoveError(null)
          }}
          onConfirm={(targetFolderId) => {
            void moveFileToFolder(moveTarget.fileId, targetFolderId)
          }}
        />
      ) : null}

      {renameTarget ? (
        <RenameFileModal
          file={renameTarget}
          submitting={renameMutation.isPending}
          error={renameError}
          onCancel={() => {
            setRenameTarget(null)
            setRenameError(null)
          }}
          onConfirm={(displayName) => {
            if (isStagedId(renameTarget.fileId)) {
              retryFailedIngest(renameTarget.fileId, displayName)
              setRenameTarget(null)
              setRenameError(null)
              return
            }
            void renameMutation.mutateAsync({ fileId: renameTarget.fileId, displayName })
          }}
        />
      ) : null}

      <FileNameModal
        open={fileNameFolder !== null}
        folder={fileNameFolder}
        moduleName={breadcrumbs[0]?.name ?? selectedFolder?.name ?? 'Module'}
        theme={moduleTheme}
        requiresFilePassword={categoryRequiresPassword(fileNameFolder?.categoryId)}
        onClose={() => setFileNameFolder(null)}
        onManageFiles={
          isAdmin
            ? () => {
                const folder = fileNameFolder
                setFileNameFolder(null)
                startIngest(folder)
              }
            : undefined
        }
      />
      <SecureFileViewer
        open={viewer !== null}
        fileName={viewer?.displayName ?? ''}
        mimeType={viewer?.mimeType ?? null}
        blob={viewer?.blob ?? null}
        onClose={() => setViewer(null)}
      />
    </div>
  )
}
