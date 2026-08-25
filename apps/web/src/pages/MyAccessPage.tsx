import { useQuery } from '@tanstack/react-query'
import { FolderLock } from 'lucide-react'

import { api } from '@/api/vault'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { TableRowSkeleton } from '@/components/ui/skeleton'
import PageShell from '@/layout/PageShell'

function rightsLabel(rights: {
  view: boolean
  edit: boolean
  copy: boolean
  delete: boolean
}): string {
  return [
    rights.view && 'View',
    rights.edit && 'Edit',
    rights.copy && 'Copy',
    rights.delete && 'Delete'
  ]
    .filter(Boolean)
    .join(' · ')
}

export default function MyAccessPage(): React.JSX.Element {
  const query = useQuery({
    queryKey: ['my-access'],
    queryFn: () => api.admin.getMyAccess()
  })

  return (
    <PageShell
      title="My folder access"
      subtitle="Effective rights after role caps, inheritance, and folder ACL overrides."
    >
      <section className="rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface">
        {query.isLoading ? (
          <table className="w-full" aria-busy="true" aria-label="Loading access">
            <tbody>
              {Array.from({ length: 4 }).map((_, i) => (
                <TableRowSkeleton key={i} columns={2} />
              ))}
            </tbody>
          </table>
        ) : query.isError ? (
          <ErrorState
            className="py-12"
            title="Access didn’t load"
            description="We couldn’t list your folder rights. Try again in a moment."
            onRetry={() => void query.refetch()}
          />
        ) : (query.data ?? []).length === 0 ? (
          <EmptyState
            icon={FolderLock}
            title="No folders assigned yet"
            description="You don’t have View access on any folder. Contact your admin to be granted a module."
          />
        ) : (
          <ul className="divide-y divide-sv-border">
            {(query.data ?? []).map((entry) => (
              <li
                key={entry.folderId}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-sv-text">
                    {entry.path}
                    {entry.isCategoryRoot ? (
                      <span className="ml-2 text-[10px] uppercase text-sv-text-muted">
                        Category
                      </span>
                    ) : null}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-sv-text-muted">{rightsLabel(entry.rights)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  )
}
