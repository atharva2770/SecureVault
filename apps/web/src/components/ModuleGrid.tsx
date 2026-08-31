import { FolderOpen, Shield } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { FolderDto } from '@securevault/domain'

import { useAuth } from '@/auth/AuthProvider'
import { ModuleCard } from '@/components/ModuleCard'
import { CardSkeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { primaryRoleLabel } from '@/lib/roles'
import { MODULE_DISPLAY_ORDER, moduleThemeForCategory } from '@/theme/modules'

export interface ModuleGridItem {
  folder: FolderDto
  folderCount: number
  fileCount: number
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

export const MODULE_GRID = 'grid gap-5 sm:grid-cols-2 lg:grid-cols-3'

function displayRank(folderName: string): number {
  const id = moduleThemeForCategory(folderName).id
  const index = (MODULE_DISPLAY_ORDER as readonly string[]).indexOf(id)
  return index === -1 ? 99 : index
}

export function ModuleGrid({
  items,
  loading,
  error,
  onRetry,
  isAdmin,
  onOpen
}: ModuleGridProps): React.JSX.Element {
  const { user, canManageUsers } = useAuth()
  const roleLabel = user ? primaryRoleLabel(user) : 'user'

  if (error) {
    return (
      <ErrorState
        title="Modules didn’t load"
        description="We couldn’t reach the vault just now. Try again — nothing has been changed."
        onRetry={onRetry}
      />
    )
  }

  const visible = (isAdmin ? items : items.filter((item) => !item.restricted))
    .slice()
    .sort((a, b) => displayRank(a.folder.name) - displayRank(b.folder.name))

  return (
    <div className="aurora relative mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sv-text-muted">
            My vault
          </p>
          <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">Main folders</h1>
          <p className="mt-2 max-w-2xl text-sm text-sv-text-muted">
            {loading
              ? 'Loading modules available to your account.'
              : `${visible.length} module${visible.length === 1 ? '' : 's'} available to your ${roleLabel.toLowerCase()} account. Open one to browse its sub-folders.`}
          </p>
        </div>
        {canManageUsers ? (
          <Link
            to="/admin/users"
            className="mod-chip inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold"
          >
            <Shield className="h-4 w-4" /> Rights & users
          </Link>
        ) : null}
      </header>

      {loading ? (
        <ul className={`mt-8 ${MODULE_GRID}`} aria-busy="true" aria-label="Loading modules">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i}>
              <CardSkeleton className="h-46 rounded-3xl p-6" />
            </li>
          ))}
        </ul>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No modules assigned yet"
          description="You don’t have access to any department modules. Contact your admin to be granted a module."
        />
      ) : (
        <ul className={`mt-8 ${MODULE_GRID}`}>
          {visible.map(({ folder, folderCount, fileCount, restricted }) => {
            const theme = moduleThemeForCategory(folder.name)
            const locked = restricted && isAdmin
            return (
              <li key={folder.folderId}>
                <ModuleCard
                  moduleId={theme.id}
                  label={folder.name}
                  tagline={theme.tagline}
                  colorVar={theme.colorVar}
                  folderCount={folderCount}
                  fileCount={fileCount}
                  restricted={locked}
                  locked={locked}
                  onOpen={locked ? undefined : () => onOpen(folder)}
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default ModuleGrid
