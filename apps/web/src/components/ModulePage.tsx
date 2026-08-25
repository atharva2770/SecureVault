import { ChevronRight, Folder, FolderOpen, Layers } from 'lucide-react'
import type { FolderDto } from '@securevault/domain'

import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { ModuleTheme } from '@/theme/modules'

/*
  Per-module background patterns. Each is a pure CSS `background-image`
  combination coloured by the `--card-accent-soft` custom property (set inline
  per module on the hero). Opacity of that property is tuned per theme in
  globals.css via `--card-pattern-strength`, so the same pattern reads correctly
  on both dark and light surfaces.
*/
function patternStyle(moduleId: string): React.CSSProperties {
  switch (moduleId) {
    case 'engineering': // fine grid
      return {
        backgroundImage:
          'linear-gradient(var(--card-accent-soft) 1px, transparent 1px), linear-gradient(90deg, var(--card-accent-soft) 1px, transparent 1px)',
        backgroundSize: '22px 22px'
      }
    case 'hr': // soft blob shapes
      return {
        backgroundImage:
          'radial-gradient(circle at 18% 32%, var(--card-accent-soft), transparent 55%), radial-gradient(circle at 76% 62%, var(--card-accent-soft), transparent 55%), radial-gradient(circle at 62% 12%, var(--card-accent-soft), transparent 50%)',
        backgroundSize: '340px 260px'
      }
    case 'accounts': // dotted ledger
      return {
        backgroundImage:
          'radial-gradient(var(--card-accent-soft) 1.5px, transparent 1.6px), repeating-linear-gradient(0deg, transparent 0 27px, var(--card-accent-soft) 27px 28px)',
        backgroundSize: '28px 28px, 100% 28px'
      }
    case 'qa': // hex lattice
      return {
        backgroundImage:
          'repeating-linear-gradient(60deg, var(--card-accent-soft) 0 1px, transparent 1px 20px), repeating-linear-gradient(-60deg, var(--card-accent-soft) 0 1px, transparent 1px 20px), repeating-linear-gradient(0deg, var(--card-accent-soft) 0 1px, transparent 1px 20px)'
      }
    case 'defence': // diagonal chevrons
      return {
        backgroundImage:
          'repeating-linear-gradient(45deg, var(--card-accent-soft) 0 2px, transparent 2px 16px)'
      }
    case 'railway': // rails + ties
      return {
        backgroundImage:
          'repeating-linear-gradient(90deg, var(--card-accent-soft) 0 2px, transparent 2px 26px), repeating-linear-gradient(0deg, var(--card-accent-soft) 0 3px, transparent 3px 13px)',
        backgroundSize: '26px 26px'
      }
    case 'npd': // idea dots
      return {
        backgroundImage: 'radial-gradient(var(--card-accent-soft) 2px, transparent 2.5px)',
        backgroundSize: '26px 26px'
      }
    default: // subtle dots
      return {
        backgroundImage: 'radial-gradient(var(--card-accent-soft) 1px, transparent 1.5px)',
        backgroundSize: '18px 18px'
      }
  }
}

interface ModulePageProps {
  theme: ModuleTheme
  folderName: string
  subfolders: FolderDto[]
  onOpenFolder: (folder: FolderDto) => void
  /** Retrieve a file by name from a subfolder (name-verified retrieval). */
  onPickFile: (folder: FolderDto) => void
  onBackToDashboard: () => void
}

export function ModulePage({
  theme,
  folderName,
  subfolders,
  onOpenFolder,
  onPickFile,
  onBackToDashboard
}: ModulePageProps): React.JSX.Element {
  const accentVars = {
    '--card-accent': theme.colorVar,
    '--card-accent-soft': `color-mix(in srgb, ${theme.colorVar} var(--card-pattern-strength), transparent)`
  } as React.CSSProperties

  return (
    <div className="p-4 sm:p-6">
      {/* Hero */}
      <section
        className="module-hero relative overflow-hidden rounded-[calc(var(--sv-radius)+4px)] border border-sv-border bg-sv-surface shadow-card"
        style={accentVars}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(180deg,#000,transparent)]"
          style={patternStyle(theme.id)}
        />
        {/* Accent wash from the module colour */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--card-accent) 14%, transparent), transparent 55%)'
          }}
        />

        <div className="relative p-5 sm:p-7">
          {/* Breadcrumb back to dashboard */}
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
              className="flex size-14 items-center justify-center rounded-[var(--sv-radius)] ring-1 ring-sv-border"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--card-accent) 16%, transparent)',
                color: 'var(--card-accent)'
              }}
            >
              <Layers className="size-7" />
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
        </div>
      </section>

      {/* Subfolder cards */}
      {subfolders.length > 0 ? (
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
        <p className={cn('mt-6 text-center text-sm text-sv-text-muted')}>
          No subfolders in this module yet.
        </p>
      )}
    </div>
  )
}

export default ModulePage
