import { Loader2, ShieldCheck } from 'lucide-react'

import type { AdminUserDto, FolderAclDto, FolderDto } from '@securevault/domain'
import { UserAvatar } from '@/components/UserAvatar'
import { cn } from '@/lib/utils'
import { moduleThemeForCategory } from '@/theme/modules'

function isAdminAccount(user: AdminUserDto): boolean {
  return user.roles.some((r) => r.toUpperCase() === 'ADMIN') || user.role.toLowerCase() === 'admin'
}

function hasAccess(acls: FolderAclDto[] | undefined, userId: string): boolean {
  return Boolean(
    acls?.some((a) => a.principalType === 'USER' && a.principalId === userId && a.canView)
  )
}

interface RightsMatrixProps {
  users: AdminUserDto[]
  modules: FolderDto[]
  aclsByFolder: Record<string, FolderAclDto[]>
  loading: boolean
  isPendingCell: (userId: string, folderId: string) => boolean
  onToggle: (userId: string, folderId: string, next: boolean) => void
}

/*
  Rights matrix — users (rows) × modules (columns). Each cell toggles read
  access to a module's category-root folder via the real ACL endpoints. Admins
  implicitly hold every folder, so their row is shown checked and locked.
*/
export function RightsMatrix({
  users,
  modules,
  aclsByFolder,
  loading,
  isPendingCell,
  onToggle
}: RightsMatrixProps): React.JSX.Element {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-sv-text-muted">
        <Loader2 className="size-4 animate-spin" />
        Loading rights…
      </div>
    )
  }

  if (users.length === 0 || modules.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-sv-text-muted">
        {modules.length === 0 ? 'No modules to assign yet.' : 'No people to show.'}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-[var(--sv-radius)] border border-sv-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-sv-surface-2">
            <th
              scope="col"
              className="sticky left-0 z-[1] min-w-[200px] border-b border-sv-border bg-sv-surface-2 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-sv-text-muted"
            >
              Person
            </th>
            {modules.map((mod) => {
              const accent = moduleThemeForCategory(mod.name).colorVar
              return (
                <th
                  key={mod.folderId}
                  scope="col"
                  className="border-b border-l border-sv-border px-3 py-3 text-center align-bottom"
                >
                  <span className="flex flex-col items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: accent }}
                    />
                    <span className="max-w-[92px] truncate text-xs font-medium text-sv-text">
                      {mod.name}
                    </span>
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const admin = isAdminAccount(user)
            return (
              <tr key={user.userId} className="group transition-colors hover:bg-sv-surface-2/60">
                <th
                  scope="row"
                  className="sticky left-0 z-[1] border-b border-sv-border bg-sv-surface px-4 py-2.5 text-left font-normal transition-colors group-hover:bg-sv-surface-2/60"
                >
                  <span className="flex items-center gap-2.5">
                    <UserAvatar username={user.username} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-sv-text">
                        {user.username}
                      </span>
                      <span className="block text-[11px] text-sv-text-muted">
                        {admin ? 'Admin' : 'Member'}
                        {user.isDisabled ? ' · Disabled' : ''}
                      </span>
                    </span>
                  </span>
                </th>
                {modules.map((mod) => {
                  const checked = admin || hasAccess(aclsByFolder[mod.folderId], user.userId)
                  const pending = isPendingCell(user.userId, mod.folderId)
                  return (
                    <td
                      key={mod.folderId}
                      className="border-b border-l border-sv-border px-3 py-2.5 text-center"
                    >
                      {admin ? (
                        <ShieldCheck
                          className="mx-auto size-4 text-sv-text-faint"
                          aria-label="Admins have every module"
                        />
                      ) : pending ? (
                        <Loader2 className="mx-auto size-4 animate-spin text-sv-text-muted" />
                      ) : (
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => onToggle(user.userId, mod.folderId, e.target.checked)}
                          aria-label={`${checked ? 'Remove' : 'Grant'} ${user.username} access to ${mod.name}`}
                          className={cn(
                            'size-4 cursor-pointer rounded border-sv-border accent-sv-accent',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sv-accent/50'
                          )}
                        />
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default RightsMatrix
