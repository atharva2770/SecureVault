import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, UserPlus } from 'lucide-react'

import { api } from '@/api/vault'
import { Button } from '@/components/ui/button'
import PageShell from '@/layout/PageShell'

export default function UsersPage(): React.JSX.Element {
  const queryClient = useQueryClient()
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('MEMBER')
  const [grantRoots, setGrantRoots] = useState(true)
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

  const createUserMutation = useMutation({
    mutationFn: () =>
      api.admin.createUser({
        username: newUsername.trim(),
        password: newPassword,
        roleCode: newRole,
        grantAllCategoryRoots: grantRoots
      }),
    onSuccess: async (user) => {
      setNewUsername('')
      setNewPassword('')
      setStatus(`Created “${user.username}” with role ${user.roles.join(', ')}.`)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (err: Error) => setError(err.message || 'Could not create user.')
  })

  const disableMutation = useMutation({
    mutationFn: (payload: { userId: string; isDisabled: boolean }) =>
      api.admin.setUserDisabled(payload.userId, payload.isDisabled),
    onSuccess: async (user) => {
      setStatus(`${user.isDisabled ? 'Disabled' : 'Enabled'} ${user.username}.`)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (err: Error) => setError(err.message || 'Could not update account.')
  })

  return (
    <PageShell
      title="Add user rights"
      subtitle="Create vault accounts and grant a starting role. Use Change user rights to adjust roles later."
    >
      {status || error ? (
        <p className={`mb-4 text-sm ${error ? 'text-sv-danger' : 'text-sv-text-muted'}`}>
          {error ?? status}
        </p>
      ) : null}

      <section className="mb-6 rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface p-4">
        <div className="mb-3 flex items-center gap-2">
          <UserPlus className="size-4 text-sv-accent" />
          <h2 className="text-sm font-semibold text-sv-text">New user</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-xs">
            <span className="text-sv-text-muted">Username</span>
            <input
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="h-9 w-full rounded-md border border-sv-border bg-sv-bg px-2 text-sm text-sv-text outline-none focus:border-sv-accent"
              placeholder="new.user"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-sv-text-muted">Temp password</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="h-9 w-full rounded-md border border-sv-border bg-sv-bg px-2 text-sm text-sv-text outline-none focus:border-sv-accent"
              placeholder="min 8 characters"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-sv-text-muted">Starting role</span>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="h-9 w-full rounded-md border border-sv-border bg-sv-bg px-2 text-sm text-sv-text outline-none focus:border-sv-accent"
            >
              {(rolesQuery.data ?? []).map((role) => (
                <option key={role.roleId} value={role.code}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-xs text-sv-text-muted">
              <input
                type="checkbox"
                checked={grantRoots}
                onChange={(e) => setGrantRoots(e.target.checked)}
              />
              Grant all category folders
            </label>
            <Button
              size="sm"
              className="h-9 gap-1.5"
              disabled={!newUsername.trim() || newPassword.length < 8 || createUserMutation.isPending}
              onClick={() => void createUserMutation.mutateAsync()}
            >
              {createUserMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              Create user
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface">
        <div className="border-b border-sv-border px-4 py-3">
          <h2 className="text-sm font-semibold text-sv-text">Accounts</h2>
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
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-sv-text">
                    {user.username}
                    {user.isDisabled ? (
                      <span className="ml-2 text-[10px] uppercase text-sv-danger">Disabled</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-sv-text-muted">
                    {user.roles.join(', ') || user.role}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 text-xs"
                  onClick={() =>
                    void disableMutation.mutateAsync({
                      userId: user.userId,
                      isDisabled: !user.isDisabled
                    })
                  }
                >
                  {user.isDisabled ? 'Enable' : 'Disable'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  )
}
