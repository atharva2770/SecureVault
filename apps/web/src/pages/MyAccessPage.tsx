import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'

import { api } from '@/api/vault'
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
          <div className="flex items-center gap-2 p-6 text-sv-text-muted">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        ) : (query.data ?? []).length === 0 ? (
          <p className="p-4 text-sm text-sv-text-muted">
            No folders with View access. Ask an admin to grant folder permissions.
          </p>
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
