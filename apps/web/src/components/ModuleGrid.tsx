import { FolderOpen } from 'lucide-react'
import type { FolderDto } from '@securevault/domain'

import { ModuleCard } from '@/components/ModuleCard'
import { CardSkeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
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
  error?: boolean
  onRetry?: () => void
  isAdmin: boolean
  onOpen: (folder: FolderDto) => void
}

export const MODULE_GRID = 'grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'

export function ModuleGrid({
  items,
  loading,
  error,
  onRetry,
  isAdmin,
  onOpen
}: ModuleGridProps): React.JSX.Element {
  if (loading) {
    return (
      <div className="p-4 sm:p-6" aria-busy="true" aria-label="Loading modules">
        <div className={MODULE_GRID}>
          {Array.from({ length: 8 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Modules didn’t load"
        description="We couldn’t reach the vault just now. Try again — nothing has been changed."
        onRetry={onRetry}
      />
    )
  }

  const visible = isAdmin ? items : items.filter((item) => !item.restricted)

  if (visible.length === 0) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="No modules assigned yet"
        description="You don’t have access to any department modules. Contact your admin to be granted a module."
      />
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <div className={MODULE_GRID}>
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
