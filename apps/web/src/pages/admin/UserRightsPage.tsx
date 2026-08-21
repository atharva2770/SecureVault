import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { AdminUserDto } from '@securevault/domain'
import { api } from '@/api/vault'
import { Button } from '@/components/ui/button'
import PageShell from '@/layout/PageShell'

export default function UserRightsPage(): React.JSX.Element {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const usersQuery = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.admin.listUsers()
  })
  const rolesQuery = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: () => api.admin.listRoles()
  })

  const setRolesMutation = useMutation({
    mutationFn: (payload: { userId: string; roleCodes: string[] }) =>
      api.admin.setUserRoles(payload),
    onSuccess: async (user) => {
      setStatus(`Updated roles for ${user.username}.`)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (err: Error) => setError(err.message || 'Could not update roles.')
  })

  function applyRole(user: AdminUserDto, roleCode: string): void {
    void setRolesMutation.mutateAsync({ userId: user.userId, roleCodes: [roleCode] })
  }

  return (
    <PageShell
      title="Change user rights"
      subtitle="Assign a vault role. Folder-level View / Edit / Copy / Delete is on Folder permissions."
    >
      {status || error ? (
        <p className={`mb-4 text-sm ${error ? 'text-sv-danger' : 'text-sv-text-muted'}`}>
          {error ?? status}
        </p>
      ) : null}

      <section className="rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface">
        <div className="border-b border-sv-border px-4 py-3">
          <h2 className="text-sm font-semibold text-sv-text">Roles</h2>
        </div>
        {usersQuery.isLoading ? (
          <div className="flex items-center gap-2 p-6 text-sv-text-muted">
            <Loader2 className="size-4 animate-spin" />
            Loading users…
          </div>
        ) : (
          <ul className="divide-y divide-sv-border">
            {(usersQuery.data ?? []).map((user) => (
              <li
                key={user.userId}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-sv-text">{user.username}</p>
                  <p className="text-xs text-sv-text-muted">
                    Current: {user.roles.join(', ') || user.role}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="h-9 rounded-md border border-sv-border bg-sv-bg px-2 text-sm text-sv-text"
                    value={user.roles[0] ?? user.role.toUpperCase()}
                    onChange={(e) => applyRole(user, e.target.value)}
                    disabled={setRolesMutation.isPending}
                  >
                    {(rolesQuery.data ?? []).map((role) => (
                      <option key={role.roleId} value={role.code}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                  <Button asChild size="sm" variant="secondary" className="h-9 text-xs">
                    <Link to="/admin/folders">Folder ACLs</Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  )
}
