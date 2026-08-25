import { FolderOpen } from 'lucide-react'
import type { FolderDto } from '@securevault/domain'

import { ModuleCard } from '@/components/ModuleCard'
import { Card } from '@/components/ui/card'
import { moduleThemeForCategory } from '@/theme/modules'

export interface ModuleGridItem {
  folder: FolderDto
  folderCount: number
  /** Current user can't actually enter this module (view=false / traverse-only). */
  restricted: boolean
}

interface ModuleGridProps {
  items: ModuleGridItem[]
  loading: boolean
  isAdmin: boolean
  onOpen: (folder: FolderDto) => void
}

const GRID = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'

function ModuleSkeleton(): React.JSX.Element {
  return (
    <div className="rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface p-5 shadow-card">
      <div className="size-11 animate-pulse rounded-[calc(var(--sv-radius)-2px)] bg-sv-surface-2 motion-reduce:animate-none" />
      <div className="mt-4 h-4 w-2/3 animate-pulse rounded bg-sv-surface-2 motion-reduce:animate-none" />
      <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-sv-surface-2 motion-reduce:animate-none" />
    </div>
  )
}

export function ModuleGrid({ items, loading, isAdmin, onOpen }: ModuleGridProps): React.JSX.Element {
  if (loading) {
    return (
      <div className="p-4 sm:p-6">
        <div className={GRID}>
          {Array.from({ length: 8 }).map((_, i) => (
            <ModuleSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  // Non-admins never see restricted modules; admins see them locked for awareness.
  const visible = isAdmin ? items : items.filter((item) => !item.restricted)

  if (visible.length === 0) {
    return (
      <div className="p-4 sm:p-6">
        <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-sv-surface-2 text-sv-text-muted">
            <FolderOpen className="size-6" />
          </div>
          <p className="text-sm font-medium text-sv-text">No modules available</p>
          <p className="max-w-sm text-xs text-sv-text-muted">
            You haven&apos;t been granted access to any modules yet. Ask an administrator to grant
            your role access.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <div className={GRID}>
        {visible.map(({ folder, folderCount, restricted }) => {
          const theme = moduleThemeForCategory(folder.name)
          const locked = restricted && isAdmin
          return (
            <ModuleCard
              key={folder.folderId}
              moduleId={theme.id}
              label={folder.name}
              colorVar={theme.colorVar}
              folderCount={folderCount}
              restricted={locked}
              locked={locked}
              onOpen={locked ? undefined : () => onOpen(folder)}
            />
          )
        })}
      </div>
    </div>
  )
}

export default ModuleGrid
