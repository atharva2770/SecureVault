import { ChevronRight, Folder, FolderOpen } from 'lucide-react'
import type { FolderDto } from '@securevault/domain'

import { ModuleHero } from '@/components/module-identity'
import { moduleIcon } from '@/components/module-icons'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { SubfolderSkeleton } from '@/components/ui/skeleton'
import type { ModuleTheme } from '@/theme/modules'

interface ModulePageProps {
  theme: ModuleTheme
  folderName: string
  subfolders: FolderDto[]
  loading?: boolean
  onOpenFolder: (folder: FolderDto) => void
  /** Retrieve a file by name from a subfolder (name-verified retrieval). */
  onPickFile: (folder: FolderDto) => void
  onBackToDashboard: () => void
}

export function ModulePage({
  theme,
  folderName,
  subfolders,
  loading = false,
  onOpenFolder,
  onPickFile,
  onBackToDashboard
}: ModulePageProps): React.JSX.Element {
  const Icon = moduleIcon(theme.id)

  return (
    <div className="p-4 sm:p-6">
      <ModuleHero theme={theme}>
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-sv-text-muted">
          <button
            type="button"
            onClick={onBackToDashboard}
            className="min-h-11 rounded px-1.5 py-0.5 outline-none transition hover:bg-sv-surface-2 hover:text-sv-text focus-visible:ring-2 focus-visible:ring-sv-accent motion-reduce:transition-none sm:min-h-0"
          >
            My Vault
          </button>
          <ChevronRight className="size-3.5" />
          <span className="font-medium text-sv-text">{folderName}</span>
        </nav>

        <div className="mt-4 flex items-center gap-4">
          <div
            className="flex size-14 items-center justify-center rounded-(--sv-radius) ring-1 ring-sv-border"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--card-accent) 16%, transparent)',
              color: 'var(--card-accent)'
            }}
          >
            <Icon className="size-7" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-sv-text">
              {folderName}
            </h1>
            <p className="mt-0.5 text-sm text-sv-text-muted">
              {subfolders.length} {subfolders.length === 1 ? 'folder' : 'folders'} in this module
            </p>
          </div>
        </div>
      </ModuleHero>

      {/* Subfolder cards */}
      {loading ? (
        <div
          className="mt-5 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          aria-busy="true"
          aria-label="Loading folders"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <SubfolderSkeleton key={i} />
          ))}
        </div>
      ) : subfolders.length > 0 ? (
        <div className="mt-5 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {subfolders.map((folder) => (
            <Card key={folder.folderId} className="flex items-center gap-1 p-1.5">
              <button
                type="button"
                onClick={() => onPickFile(folder)}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-[calc(var(--sv-radius)-4px)] p-2.5 text-left outline-none transition hover:bg-sv-surface-2 focus-visible:ring-2 focus-visible:ring-sv-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sv-surface motion-reduce:transition-none"
              >
                <div
                  className="flex size-10 shrink-0 items-center justify-center rounded-[calc(var(--sv-radius)-2px)]"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${theme.colorVar} 16%, transparent)`,
                    color: theme.colorVar
                  }}
                >
                  <Folder className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-sv-text">{folder.name}</p>
                  <p className="text-xs text-sv-text-muted">Retrieve a file by name</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => onOpenFolder(folder)}
                aria-label={`Browse ${folder.name}`}
                title="Browse folder"
                className="flex size-11 shrink-0 items-center justify-center rounded-[calc(var(--sv-radius)-4px)] text-sv-text-muted outline-none transition hover:bg-sv-surface-2 hover:text-sv-text focus-visible:ring-2 focus-visible:ring-sv-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sv-surface motion-reduce:transition-none"
              >
                <FolderOpen className="size-4" />
              </button>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          className="mt-4"
          icon={FolderOpen}
          title="No folders in this module"
          description="This module has no subfolders yet. Files at the module root appear below when they exist."
        />
      )}
    </div>
  )
}

export default ModulePage
