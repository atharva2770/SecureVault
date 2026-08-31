import { ChevronRight, ClipboardPaste, FileStack, Folder, FolderOpen, Lock, Search, Upload } from 'lucide-react'
import type { FolderDto } from '@securevault/domain'
import { formatContentCounts } from '@securevault/domain'

import { ModuleBackdrop } from '@/components/ModuleBackdrop'
import { moduleIcon } from '@/components/module-icons'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SubfolderSkeleton } from '@/components/ui/skeleton'
import type { ModuleTheme } from '@/theme/modules'

export interface ModuleCrumb {
  label: string
  onSelect?: () => void
}

interface ModulePageProps {
  theme: ModuleTheme
  folderName: string
  tagline: string
  crumbs: ModuleCrumb[]
  subfolders: FolderDto[]
  /** Direct files in the open folder (for the header chip). */
  fileCount?: number
  /** Nested folder counts keyed by folderId — visual only. */
  childCountById: Map<string, number>
  loading?: boolean
  denied?: boolean
  folderFilter?: string
  onFolderFilterChange?: (value: string) => void
  onOpenFolder: (folder: FolderDto) => void
  /** Name-verified retrieval on a leaf folder. */
  onPickFile: (folder: FolderDto) => void
  isAdmin?: boolean
  ingestActive?: boolean
  onStartIngest?: () => void
  onUpload?: () => void
  onPaste?: () => void
  canPaste?: boolean
  pasteCount?: number
  pastePending?: boolean
  onPasteIntoFolder?: (folder: FolderDto) => void
  onFilesDropped?: (files: FileList) => void
}

export function ModulePage({
  theme,
  folderName,
  tagline,
  crumbs,
  subfolders,
  fileCount = 0,
  childCountById,
  loading = false,
  denied = false,
  folderFilter = '',
  onFolderFilterChange,
  onOpenFolder,
  onPickFile,
  isAdmin = false,
  ingestActive = false,
  onStartIngest,
  onUpload,
  onPaste,
  canPaste = false,
  pasteCount = 0,
  pastePending = false,
  onPasteIntoFolder,
  onFilesDropped
}: ModulePageProps): React.JSX.Element {
  const Icon = moduleIcon(theme.id)

  function openCard(folder: FolderDto): void {
    if (isAdmin && !ingestActive) {
      onPickFile(folder)
      return
    }
    const nested = folder.childFolderCount ?? childCountById.get(folder.folderId) ?? 0
    if (nested > 0) onOpenFolder(folder)
    else onPickFile(folder)
  }

  if (denied) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
          <Lock className="h-6 w-6 text-sv-text-muted" />
        </span>
        <h1 className="mt-6 font-display text-2xl font-bold">You don&apos;t have rights to this module</h1>
        <p className="mt-2 text-sm text-sv-text-muted">
          Ask an administrator to grant access from Rights management.
        </p>
        {crumbs[0]?.onSelect ? (
          <button
            type="button"
            onClick={crumbs[0].onSelect}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Back to modules
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div
      className="min-h-full"
      style={{ '--mod': theme.colorVar } as React.CSSProperties}
      onDragOver={
        isAdmin && ingestActive && onFilesDropped
          ? (e) => {
              e.preventDefault()
            }
          : undefined
      }
      onDrop={
        isAdmin && ingestActive && onFilesDropped
          ? (e) => {
              e.preventDefault()
              if (e.dataTransfer.files.length) onFilesDropped(e.dataTransfer.files)
            }
          : undefined
      }
    >
      <div className="aurora-mod relative mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <ModuleBackdrop pattern={theme.pattern} />

        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs font-semibold text-sv-text-muted">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1
            return (
              <span key={`${crumb.label}-${index}`} className="flex items-center gap-2">
                {index > 0 ? <ChevronRight className="h-3.5 w-3.5" /> : null}
                {last || !crumb.onSelect ? (
                  <span className={last ? 'text-mod' : undefined}>{crumb.label}</span>
                ) : (
                  <button
                    type="button"
                    onClick={crumb.onSelect}
                    className="rounded px-0.5 outline-none transition hover:text-sv-text focus-visible:ring-2 focus-visible:ring-sv-accent"
                  >
                    {crumb.label}
                  </button>
                )}
              </span>
            )
          })}
        </nav>

        <header className="mt-6 flex flex-wrap items-center gap-5">
          <span className="mod-icon grid h-16 w-16 shrink-0 place-items-center rounded-3xl">
            <Icon className="h-8 w-8" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-4xl font-extrabold sm:text-5xl">{folderName}</h1>
            <p className="mt-1 text-sm text-sv-text-muted">{tagline}</p>
            <p className="mt-2 max-w-xl text-sm font-medium text-sv-text">
              Enter the exact file name to view the file.
            </p>
          </div>
          <span className="mod-chip ml-auto rounded-full px-4 py-2 text-xs font-semibold">
            {loading
              ? '…'
              : formatContentCounts(fileCount, subfolders.length, 'sub-folder')}
          </span>
        </header>

        {isAdmin ? (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {ingestActive ? (
              <>
                <Button type="button" size="sm" className="h-10 gap-1.5" onClick={onUpload}>
                  <Upload className="size-4" />
                  Add files
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-10 gap-1.5"
                  disabled={!canPaste || pastePending}
                  onClick={onPaste}
                  title="Paste into this folder (Ctrl+V)"
                >
                  <ClipboardPaste className="size-4" />
                  Paste{pasteCount ? ` (${pasteCount})` : ''}
                </Button>
                <p className="text-xs text-sv-text-muted">
                  Drop files here. Each one encrypts immediately. Cut and paste locked files into
                  subfolders, then Done.
                </p>
              </>
            ) : (
              <>
                <Button type="button" size="sm" className="h-10 gap-1.5" onClick={onStartIngest}>
                  <Upload className="size-4" />
                  Manage files
                </Button>
                <p className="text-xs text-sv-text-muted">
                  Open a subfolder to retrieve a file by name, or start managing files to add and
                  sort them.
                </p>
              </>
            )}
          </div>
        ) : null}

        {onFolderFilterChange ? (
          <div className="relative mt-6 max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-sv-text-muted" />
            <input
              value={folderFilter}
              onChange={(e) => onFolderFilterChange(e.target.value)}
              placeholder="Filter this folder…"
              aria-label="Filter this folder"
              className="h-11 w-full rounded-xl border border-sv-border bg-sv-bg pr-3 pl-10 text-sm text-sv-text outline-none placeholder:text-sv-text-muted focus:border-sv-accent focus:ring-2 focus:ring-sv-accent focus:ring-offset-2 focus:ring-offset-sv-bg"
            />
          </div>
        ) : null}

        {loading ? (
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading folders">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i}>
                <SubfolderSkeleton />
              </li>
            ))}
          </ul>
        ) : subfolders.length > 0 ? (
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {subfolders.map((folder) => {
              const nested = folder.childFolderCount ?? childCountById.get(folder.folderId) ?? 0
              const files = folder.fileCount ?? 0
              return (
                <li key={folder.folderId}>
                  <div className="mod-tile group relative flex h-full w-full items-start gap-3 rounded-xl p-4">
                    <button
                      type="button"
                      onClick={() => openCard(folder)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-sv-accent"
                    >
                      <span className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-mod text-sv-bg">
                        <Folder className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-[30px] font-bold leading-snug text-pretty break-words">
                          {folder.name}
                        </span>
                        <span className="mt-1.5 flex items-center gap-1.5 text-xs text-sv-text-muted">
                          <FileStack className="h-3.5 w-3.5 shrink-0" />
                          {formatContentCounts(files, nested)}
                        </span>
                      </span>
                      <ChevronRight className="mt-2 h-5 w-5 shrink-0 text-sv-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-mod" />
                    </button>
                    {isAdmin && ingestActive && canPaste && onPasteIntoFolder ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 shrink-0 gap-1 px-2 text-xs"
                        disabled={pastePending}
                        onClick={(e) => {
                          e.stopPropagation()
                          onPasteIntoFolder(folder)
                        }}
                        title={`Paste into ${folder.name}`}
                      >
                        <ClipboardPaste className="size-3.5" />
                        Paste
                      </Button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <EmptyState
            className="mt-10"
            icon={FolderOpen}
            title="No folders in this module"
            description="This location has no subfolders yet."
          />
        )}
      </div>
    </div>
  )
}

export default ModulePage
