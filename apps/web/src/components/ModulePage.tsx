import { ChevronRight, FileStack, Folder, FolderOpen, Lock } from 'lucide-react'
import type { FolderDto } from '@securevault/domain'

import { ModuleBackdrop } from '@/components/ModuleBackdrop'
import { moduleIcon } from '@/components/module-icons'
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
  /** Nested folder counts keyed by folderId — visual only. */
  childCountById: Map<string, number>
  loading?: boolean
  denied?: boolean
  onOpenFolder: (folder: FolderDto) => void
  /** Name-verified retrieval on a leaf folder. */
  onPickFile: (folder: FolderDto) => void
}

export function ModulePage({
  theme,
  folderName,
  tagline,
  crumbs,
  subfolders,
  childCountById,
  loading = false,
  denied = false,
  onOpenFolder,
  onPickFile
}: ModulePageProps): React.JSX.Element {
  const Icon = moduleIcon(theme.id)

  function openCard(folder: FolderDto): void {
    const nested = childCountById.get(folder.folderId) ?? 0
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
    <div className="min-h-full" style={{ '--mod': theme.colorVar } as React.CSSProperties}>
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
            <h1 className="font-display text-3xl font-extrabold sm:text-4xl">{folderName}</h1>
            <p className="mt-1 text-sm text-sv-text-muted">{tagline}</p>
          </div>
          <span className="mod-chip ml-auto rounded-full px-4 py-2 text-xs font-semibold">
            {loading ? '…' : `${subfolders.length} sub-folder${subfolders.length === 1 ? '' : 's'}`}
          </span>
        </header>

        {loading ? (
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading folders">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i}>
                <SubfolderSkeleton />
              </li>
            ))}
          </ul>
        ) : subfolders.length > 0 ? (
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {subfolders.map((folder) => {
              const nested = childCountById.get(folder.folderId) ?? 0
              return (
                <li key={folder.folderId}>
                  <button
                    type="button"
                    onClick={() => openCard(folder)}
                    className="mod-tile group flex w-full items-center gap-4 rounded-2xl p-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-sv-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sv-bg"
                  >
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-mod text-sv-bg">
                      <Folder className="h-6 w-6" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-display text-base font-bold">
                        {folder.name}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-sv-text-muted">
                        <FileStack className="h-3.5 w-3.5" />
                        {nested > 0
                          ? `${nested} sub-folder${nested === 1 ? '' : 's'}`
                          : 'Retrieve a file by name'}
                      </span>
                    </span>
                    <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-sv-text-muted transition-transform group-hover:translate-x-1 group-hover:text-mod" />
                  </button>
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
