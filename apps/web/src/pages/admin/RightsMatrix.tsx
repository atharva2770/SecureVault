import { Loader2, ShieldCheck, FolderOpen, Users } from 'lucide-react'

import type { AdminUserDto, FolderAclDto, FolderDto } from '@securevault/domain'
import { UserAvatar } from '@/components/UserAvatar'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { MatrixSkeleton } from '@/components/ui/skeleton'
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
  error?: boolean
  onRetry?: () => void
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
  error,
  onRetry,
  isPendingCell,
  onToggle
}: RightsMatrixProps): React.JSX.Element {
  if (loading) {
    return <MatrixSkeleton rows={5} cols={Math.max(modules.length, 6)} />
  }

  if (error) {
    return (
      <ErrorState
        title="Rights didn’t load"
        description="The access matrix couldn’t be fetched. Try again — no grants were changed."
        onRetry={onRetry}
      />
    )
  }

  if (users.length === 0 || modules.length === 0) {
    return (
      <EmptyState
        icon={modules.length === 0 ? FolderOpen : Users}
        title={modules.length === 0 ? 'No modules to assign yet' : 'No people to show'}
        description={
          modules.length === 0
            ? 'Modules appear here once category folders exist in the vault.'
            : 'Invite a user first, then grant them modules from this matrix.'
        }
      />
    )
  }

  return (
    <div>
      <p className="mb-2 text-xs text-sv-text-muted lg:hidden">
        Swipe sideways to see every module. The person column stays pinned.
      </p>
      <div className="sv-scroll-hint overflow-x-auto rounded-[var(--sv-radius)] border border-sv-border">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="bg-sv-surface-2">
              <th
                scope="col"
                className="sticky left-0 z-[1] min-w-[180px] border-b border-sv-border bg-sv-surface-2 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-sv-text-muted"
              >
                Person
              </th>
              {modules.map((mod) => {
                const accent = moduleThemeForCategory(mod.name).colorVar
                return (
                  <th
                    key={mod.folderId}
                    scope="col"
                    className="min-w-[7.5rem] border-b border-l border-sv-border px-3 py-3 text-center align-bottom"
                  >
                    <span className="flex flex-col items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: accent }}
                      />
                      <span className="max-w-[6.5rem] truncate text-xs font-medium text-sv-text">
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
              const role = admin ? 'Admin' : 'Member'
              return (
                <tr key={user.userId} className="group transition-colors duration-fast ease-sv hover:bg-sv-surface-2/60">
                  <th
                    scope="row"
                    className="sticky left-0 z-[1] border-b border-sv-border bg-sv-surface px-4 py-2.5 text-left font-normal transition-colors duration-fast ease-sv group-hover:bg-sv-surface-2/60"
                  >
                    <span className="flex items-center gap-2.5">
                      <UserAvatar username={user.username} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-sv-text">
                          {user.username}
                        </span>
                        <span className="block text-[11px] text-sv-text-muted">
                          {role}
                          {user.isDisabled ? ' · Disabled' : ''}
                        </span>
                      </span>
                    </span>
                  </th>
                  {modules.map((mod) => {
                    const checked = admin || hasAccess(aclsByFolder[mod.folderId], user.userId)
                    const pending = isPendingCell(user.userId, mod.folderId)
                    const label = `${role} ${user.username}, ${mod.name}`
                    return (
                      <td
                        key={mod.folderId}
                        className="border-b border-l border-sv-border px-1 py-1 text-center"
                      >
                        {admin ? (
                          <span className="inline-flex size-11 items-center justify-center">
                            <ShieldCheck
                              className="size-4 text-sv-text-faint"
                              aria-label={`${label}: admins have every module`}
                            />
                          </span>
                        ) : pending ? (
                          <span className="inline-flex size-11 items-center justify-center">
                            <Loader2 className="size-4 animate-spin text-sv-text-muted" />
                          </span>
                        ) : (
                          <label className="inline-flex size-11 cursor-pointer items-center justify-center rounded-md outline-none focus-within:ring-2 focus-within:ring-sv-accent focus-within:ring-offset-2 focus-within:ring-offset-sv-surface">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => onToggle(user.userId, mod.folderId, e.target.checked)}
                              aria-label={`${checked ? 'Revoke' : 'Grant'} ${label}`}
                              className={cn(
                                'size-4 cursor-pointer rounded border-sv-border accent-[var(--accent-primary)]'
                              )}
                            />
                          </label>
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
    </div>
  )
}

export default RightsMatrix
