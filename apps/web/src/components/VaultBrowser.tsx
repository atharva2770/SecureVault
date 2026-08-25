import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Download,
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
import { EMPTY_RIGHTS } from '@securevault/domain'
import { api } from '@/api/vault'
import { useAuth } from '@/auth/AuthProvider'
import FileNameModal from '@/components/FileNameModal'
import ModuleGrid, { type ModuleGridItem } from '@/components/ModuleGrid'
import ModulePage from '@/components/ModulePage'
import MoveFileModal from '@/components/MoveFileModal'
import PasswordPromptModal from '@/components/PasswordPromptModal'
import RenameFileModal from '@/components/RenameFileModal'
import VaultContextMenu, {
  type ContextMenuTarget,
  type VaultContextMenuState
} from '@/components/VaultContextMenu'
import UploadLockModal, { type PendingUpload } from '@/components/UploadLockModal'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { folderRightsOf, vaultActions } from '@/lib/vault-actions'
import { moduleThemeForCategory } from '@/theme/modules'

interface FolderNode extends FolderDto {
  children: FolderNode[]
}

type Selection =
  | { type: 'root' }
  | { type: 'folder'; folderId: string; categoryId: string | null }

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
    node.children.sort((a, b) => a.name.localeCompare(b.name))
  }
  return roots.sort((a, b) => a.name.localeCompare(b.name))
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [selection, setSelection] = useState<Selection>({ type: 'root' })
  const [fileNameFolder, setFileNameFolder] = useState<FolderDto | null>(null)
  const [navHistory, setNavHistory] = useState<Selection[]>([{ type: 'root' }])
  const search = searchParams.get('q') ?? ''
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null)
  const [uploadQueue, setUploadQueue] = useState<PendingUpload[]>([])
  const [passwordTarget, setPasswordTarget] = useState<{
    file: FileDto
    mode: 'open' | 'download'
  } | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [moveTarget, setMoveTarget] = useState<FileDto | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<FileDto | null>(null)
  const [renameError, setRenameError] = useState<string | null>(null)
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

  const sidebarQuery = useQuery({
    queryKey: ['sidebar'],
    queryFn: () => api.ensureSidebar()
  })

  const categories = sidebarQuery.data?.categories ?? []
  const folders = sidebarQuery.data?.folders ?? []

  const filesQuery = useQuery({
    queryKey: ['files', selection],
    queryFn: () => {
      if (selection.type === 'folder') {
        return api.listFiles({ folderId: selection.folderId })
      }
      return Promise.resolve([] as FileDto[])
    }
  })

  const searchAllQuery = useQuery({
    queryKey: ['files', 'search-all'],
    queryFn: () => api.listFiles({}),
    enabled: search.trim().length > 0
  })

  const uploadMutation = useMutation({
    mutationFn: (payload: {
      file: File
      displayName: string
      categoryId: string
      folderId?: string | null
    }) => api.addFile(payload),
    onSuccess: async (file) => {
      setStatus(`Locked “${file.displayName}” in ${file.categoryName ?? 'vault'}.`)
      await queryClient.invalidateQueries({ queryKey: ['files'] })
      await queryClient.invalidateQueries({ queryKey: ['sidebar'] })
      void api.auth.touch()
    },
    onError: (error: Error) => {
      setStatus(error.message || 'Upload failed.')
    }
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
      void api.auth.touch()
    },
    onError: (error: Error) => {
      setStatus(error.message || 'Paste failed.')
    }
  })

  const passwordMutation = useMutation({
    mutationFn: async (password: string) => {
      if (!passwordTarget) throw new Error('No file selected.')
      const payload = { fileId: passwordTarget.file.fileId, password }
      if (passwordTarget.mode === 'open') {
        return api.openFile(payload)
      }
      return api.downloadFile(payload)
    },
    onSuccess: (result) => {
      if ('savedPath' in result) {
        setStatus(`Downloaded “${result.savedPath}”.`)
      } else {
        setStatus(`Viewing “${result.displayName}”.`)
      }
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
      return folders
        .filter((f) => f.isCategoryRoot)
        .sort((a, b) => a.name.localeCompare(b.name))
    }
    return folders
      .filter((f) => f.parentFolderId === selection.folderId)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [folders, selection])

  // Module cards for the dashboard (root view): one per category root, with the
  // number of folders in that module and an accessibility flag.
  const moduleItems = useMemo<ModuleGridItem[]>(() => {
    return folders
      .filter((f) => f.isCategoryRoot)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((root) => ({
        folder: root,
        folderCount: folders.filter(
          (f) => !f.isCategoryRoot && f.categoryId === root.categoryId
        ).length,
        restricted: !root.rights.view || Boolean(root.traverseOnly)
      }))
  }, [folders])

  const q = search.trim().toLowerCase()
  const isSearching = q.length > 0

  const visibleFiles = useMemo(() => {
    const source = isSearching ? (searchAllQuery.data ?? []) : (filesQuery.data ?? [])
    if (!q) return source
    return source.filter(
      (f) =>
        f.displayName.toLowerCase().includes(q) ||
        f.originalFileName.toLowerCase().includes(q) ||
        (f.categoryName?.toLowerCase().includes(q) ?? false)
    )
  }, [filesQuery.data, searchAllQuery.data, isSearching, q])

  const visibleFolders = useMemo(() => {
    if (isSearching) return []
    if (!q) return childFolders
    return childFolders.filter((f) => f.name.toLowerCase().includes(q))
  }, [childFolders, isSearching, q])

  const fileById = useMemo(() => {
    const map = new Map<string, FileDto>()
    for (const f of visibleFiles) map.set(f.fileId, f)
    for (const f of filesQuery.data ?? []) map.set(f.fileId, f)
    for (const f of searchAllQuery.data ?? []) map.set(f.fileId, f)
    return map
  }, [visibleFiles, filesQuery.data, searchAllQuery.data])

  const here = vaultActions(selectedFolder?.rights ?? EMPTY_RIGHTS)
  const canCreateSubfolder =
    selection.type === 'folder' && Boolean(selectedFolder?.categoryId) && here.newFolder
  const canUploadHere = selection.type === 'folder' && here.upload
  const canPasteHere =
    selection.type === 'folder' && Boolean(clipboard?.items.length) && here.paste
  const canCopyHere = here.copy
  const canCutHere = here.cut

  function actionsForFile(file: FileDto) {
    return vaultActions(folderRightsOf(folders, file.folderId))
  }

  function selectedFilesHave(flag: 'copy' | 'cut' | 'delete' | 'rename'): boolean {
    if (!selectedFileIds.length) return false
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
    setSidebarOpen(false)
    if (pushHistory) {
      setNavHistory((prev) => [...prev, next])
    }
  }

  function goBack(): void {
    setNavHistory((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.slice(0, -1)
      setSelection(next[next.length - 1])
      setSelectedFileIds([])
      return next
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
    const incompatible = clipboard.items.some(
      (item) => item.categoryId && item.categoryId !== target.categoryId
    )
    if (incompatible) {
      setStatus('Files can only be pasted into the same category.')
      return
    }
    await pasteMutation.mutateAsync({
      mode: clipboard.mode,
      fileIds: clipboard.items.map((i) => i.fileId),
      targetFolderId
    })
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
    if (selection.type !== 'folder' || !selection.folderId || !selection.categoryId) {
      setStatus('Open a category folder before pasting.')
      return
    }

    const incompatible = clipboard.items.some(
      (item) => item.categoryId && item.categoryId !== selection.categoryId
    )
    if (incompatible) {
      setStatus('Files can only be pasted into the same category.')
      return
    }

    await pasteMutation.mutateAsync({
      mode: clipboard.mode,
      fileIds: clipboard.items.map((i) => i.fileId),
      targetFolderId: selection.folderId
    })
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
    const allowed = fileIds.every((id) => {
      const file = fileById.get(id)
      return file ? actionsForFile(file).delete : false
    })
    if (!allowed) {
      setStatus('You do not have Delete on this folder.')
      return
    }
    const ok = window.confirm(
      fileIds.length === 1
        ? 'Delete this file from the vault?'
        : `Delete ${fileIds.length} files from the vault?`
    )
    if (ok) void deleteMutation.mutateAsync(fileIds)
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

  function enqueueUploads(items: PendingUpload[]): void {
    if (!items.length) return
    setUploadQueue((prev) => {
      const next = [...prev, ...items.slice(1)]
      setPendingUpload(items[0])
      return next
    })
  }

  function advanceUploadQueue(): void {
    setUploadQueue((prev) => {
      const [next, ...rest] = prev
      setPendingUpload(next ?? null)
      return rest
    })
  }

  function handleFileInput(files: FileList | null): void {
    if (!canUploadHere) return
    if (!files?.length) return
    enqueueUploads(
      Array.from(files).map((file) => ({
        file,
        originalName: file.name
      }))
    )
  }

  function handleDrop(event: React.DragEvent<HTMLElement>): void {
    event.preventDefault()
    setDragOver(false)
    if (!canUploadHere) return
    const dropped = Array.from(event.dataTransfer.files)
    if (!dropped.length) return
    enqueueUploads(
      dropped.map((file) => ({
        file,
        originalName: file.name
      }))
    )
  }

  async function confirmUpload(input: {
    displayName: string
    categoryId: string
  }): Promise<void> {
    if (!pendingUpload) return

    let folderId: string | null = null
    if (selection.type === 'folder' && selection.categoryId === input.categoryId) {
      folderId = selection.folderId
    }

    try {
      await uploadMutation.mutateAsync({
        file: pendingUpload.file,
        displayName: input.displayName,
        categoryId: input.categoryId,
        folderId
      })
      advanceUploadQueue()
    } catch {
      // surfaced via mutation
    }
  }

  async function moveFileToFolder(fileId: string, targetFolderId: string): Promise<void> {
    const target = folders.find((f) => f.folderId === targetFolderId)
    if (!target?.rights.edit) {
      setStatus('You do not have Edit on that folder.')
      return
    }
    try {
      await moveMutation.mutateAsync({ fileId, targetFolderId })
    } catch {
      // surfaced via mutation
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (isTypingTarget(event.target)) return
      if (passwordTarget || pendingUpload || moveTarget || renameTarget) return

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
        if (!here.paste) return
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
    pendingUpload,
    moveTarget,
    renameTarget
  ])

  const isEmpty = !isSearching && visibleFolders.length === 0 && visibleFiles.length === 0
  const loading = filesQuery.isLoading || (isSearching && searchAllQuery.isLoading)
  const isModuleRoot =
    selection.type === 'folder' && Boolean(selectedFolder?.isCategoryRoot) && !isSearching
  const moduleTheme = moduleThemeForCategory(selectedFolder?.name)
  const clipboardCount = clipboard?.items.length ?? 0
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
    if (!target?.categoryId || !target.rights.edit) return false
    return !clipboard.items.some(
      (item) => item.categoryId && item.categoryId !== target.categoryId
    )
  }, [clipboard, pasteTargetFolderId, selection, folders])

  const contextMenuAllows = useMemo(() => {
    if (!contextMenu) {
      return { cut: false, copy: false, rename: false, paste: false, delete: false }
    }
    const file =
      contextMenu.target.kind === 'file' ? fileById.get(contextMenu.target.fileId) : undefined
    const fileActs = file ? actionsForFile(file) : null
    const folderId =
      contextMenu.target.kind === 'folder'
        ? contextMenu.target.folderId
        : (pasteTargetFolderId ?? (selection.type === 'folder' ? selection.folderId : null))
    const pasteActs = vaultActions(folderRightsOf(folders, folderId))
    return {
      cut: Boolean(fileActs?.cut),
      copy: Boolean(fileActs?.copy),
      rename: Boolean(fileActs?.rename),
      paste: pasteActs.paste,
      delete:
        contextMenu.target.kind === 'file'
          ? Boolean(fileActs?.delete)
          : contextMenu.target.kind === 'folder' && contextMenu.target.deletable
    }
  }, [contextMenu, fileById, folders, pasteTargetFolderId, selection])

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
              onSelect={openFolder}
            />
          ))
        )}
      </nav>
    </>
  )

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
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
            'fixed inset-y-0 left-0 top-[var(--sv-header-height)] transition-transform duration-200 md:static md:translate-x-0',
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
                className="size-9 md:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open navigation"
              >
                <Menu className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="hidden size-8 md:inline-flex"
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
                className="size-9 sm:size-8"
                disabled={navHistory.length <= 1}
                onClick={goBack}
                aria-label="Back"
              >
                <ArrowLeft className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-9 sm:size-8"
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
                    'shrink-0 rounded px-1.5 py-0.5 transition',
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
                        'max-w-[140px] truncate rounded px-1.5 py-0.5 transition sm:max-w-[160px]',
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

              <div className="relative min-w-0 flex-1 sm:w-44 sm:flex-none md:w-52">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-sv-text-muted" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="h-9 w-full rounded-md border border-sv-border bg-sv-bg pr-2 pl-8 text-sm text-sv-text outline-none placeholder:text-sv-text-muted focus:border-sv-accent sm:h-8 sm:text-xs"
                />
              </div>

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
                <label>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      handleFileInput(e.target.files)
                      e.target.value = ''
                    }}
                  />
                  <Button asChild size="sm" className="h-9 gap-1.5 sm:h-8">
                    <span className="cursor-pointer">
                      <Upload className="size-3.5" />
                      <span className="hidden xs:inline sm:inline">Upload</span>
                    </span>
                  </Button>
                </label>
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
              {here.paste ? (
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
              </p>
            ) : null}

            {selectedFolder?.traverseOnly && !isSearching ? (
              <p className="px-3 py-2 text-xs text-sv-text-muted sm:px-4">
                You can open this folder to reach folders you have access to. Files and other
                subfolders here stay hidden.
              </p>
            ) : null}

            {selection.type === 'root' && !isSearching ? (
              <ModuleGrid
                items={moduleItems}
                loading={sidebarQuery.isLoading}
                isAdmin={isAdmin}
                onOpen={(folder) => openFolder(folder)}
              />
            ) : loading ? (
              <div className="flex h-40 items-center justify-center gap-2 text-sv-text-muted">
                <Loader2 className="size-5 animate-spin" />
                Loading…
              </div>
            ) : filesQuery.isError ? (
              <p className="p-4 text-sm text-sv-danger">
                {(filesQuery.error as Error).message || 'Failed to load.'}
              </p>
            ) : (
              <>
                {isModuleRoot ? (
                  <ModulePage
                    theme={moduleTheme}
                    folderName={selectedFolder?.name ?? 'Module'}
                    subfolders={visibleFolders}
                    onOpenFolder={openFolder}
                    onPickFile={(folder) => setFileNameFolder(folder)}
                    onBackToDashboard={() => navigateTo({ type: 'root' })}
                  />
                ) : null}

                {isEmpty && !isModuleRoot ? (
                  <div className="flex h-64 flex-col items-center justify-center gap-2 px-4 text-center">
                    <FolderOpen className="size-12 text-sv-text-muted/50" />
                    <p className="text-sm font-medium text-sv-text">This folder is empty</p>
                    <p className="max-w-sm text-xs text-sv-text-muted">
                      {here.upload
                        ? 'Upload files, create a folder, or paste with Ctrl+V.'
                        : here.copy
                          ? 'You can open and copy files in this folder.'
                          : 'You can browse files in this folder.'}
                    </p>
                  </div>
                ) : isModuleRoot && visibleFiles.length === 0 ? null : (
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
                  {!isModuleRoot &&
                    visibleFolders.map((folder) => {
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
                            openFolder(folder)
                          }}
                          onContextMenu={(e) => {
                            openContextMenu(
                              e,
                              { kind: 'folder', folderId: folder.folderId, deletable },
                              folder.folderId
                            )
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') openFolder(folder)
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
                              <p className="truncate font-medium text-sv-text">{folder.name}</p>
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
                              onClick={() => openFolder(folder)}
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
                    return (
                      <li key={file.fileId}>
                        <div
                          role="button"
                          tabIndex={0}
                          draggable={acts.move}
                          className={cn(
                            'flex cursor-default items-center gap-3 rounded-xl border border-sv-border/70 bg-sv-surface/60 px-3 py-3 transition md:grid md:grid-cols-[minmax(180px,2fr)_150px_120px_80px_180px] md:gap-2 md:rounded-none md:border-0 md:border-b md:border-sv-border/60 md:bg-transparent md:px-4 md:py-2',
                            selected && 'border-sv-accent/50 bg-sv-accent/10 md:bg-sv-accent/10',
                            isCut && 'opacity-50',
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
                            setPasswordError(null)
                            setPasswordTarget({ file, mode: 'open' })
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
                              <p className="truncate font-medium text-sv-text">{file.displayName}</p>
                              <p className="flex items-center gap-1 truncate text-[11px] text-sv-text-muted">
                                <Lock className="size-2.5 shrink-0 text-sv-success" />
                                <span className="truncate md:hidden">
                                  {formatBytes(file.sizeBytes)} · {fileTypeLabel(file)}
                                </span>
                                <span className="hidden truncate md:inline">
                                  {file.originalFileName}
                                </span>
                              </p>
                            </div>
                          </div>
                          <span className="hidden truncate text-sm text-sv-text-muted md:block">
                            {formatDate(file.updatedAt)}
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
                            {acts.view ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8 md:size-7"
                                title="View"
                                onClick={() => {
                                  setPasswordError(null)
                                  setPasswordTarget({ file, mode: 'open' })
                                }}
                              >
                                <Eye className="size-3.5" />
                              </Button>
                            ) : null}
                            {acts.download ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8 md:size-7"
                                title="Download"
                                onClick={() => {
                                  setPasswordError(null)
                                  setPasswordTarget({ file, mode: 'download' })
                                }}
                              >
                                <Download className="size-3.5" />
                              </Button>
                            ) : null}
                            {acts.move ? (
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
                            {acts.rename ? (
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
                            {acts.delete ? (
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
              </>
            )}
          </main>
        </section>
      </div>

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

      {pendingUpload ? (
        <UploadLockModal
          pending={pendingUpload}
          categories={categories}
          defaultCategoryId={
            selection.type === 'folder' ? selection.categoryId : categories[0]?.categoryId
          }
          submitting={uploadMutation.isPending}
          onCancel={() => advanceUploadQueue()}
          onConfirm={(input) => {
            void confirmUpload(input)
          }}
        />
      ) : null}

      {uploadQueue.length > 0 && pendingUpload ? (
        <p className="pointer-events-none fixed bottom-3 left-1/2 z-40 -translate-x-1/2 rounded-full bg-sv-surface px-3 py-1 text-xs text-sv-text-muted shadow">
          {uploadQueue.length} more file(s) waiting after this one
        </p>
      ) : null}

      {passwordTarget ? (
        <PasswordPromptModal
          file={passwordTarget.file}
          mode={passwordTarget.mode}
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

      {moveTarget ? (
        <MoveFileModal
          file={moveTarget}
          folders={folders}
          currentFolderId={moveTarget.folderId}
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
            void renameMutation.mutateAsync({ fileId: renameTarget.fileId, displayName })
          }}
        />
      ) : null}

      <FileNameModal
        open={fileNameFolder !== null}
        folder={fileNameFolder}
        moduleName={selectedFolder?.name ?? 'Module'}
        theme={moduleTheme}
        onClose={() => setFileNameFolder(null)}
      />
    </div>
  )
}
