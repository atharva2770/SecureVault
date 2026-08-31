import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  Search,
  ShieldCheck,
  UserPlus,
  Users
} from 'lucide-react'

import type { AdminUserDto, FolderAclDto, FolderDto } from '@securevault/domain'
import { compareFoldersByOrder } from '@securevault/domain'
import { api } from '@/api/vault'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { TableRowSkeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { UserAvatar } from '@/components/UserAvatar'
import PageShell from '@/layout/PageShell'
import { cn } from '@/lib/utils'
import InviteUserModal from './InviteUserModal'
import RightsMatrix from './RightsMatrix'
import { AdminTabs } from './AdminTabs'

type Tab = 'users' | 'rights'

const PAGE_SIZE = 10
const ACLS_KEY = ['admin', 'module-acls'] as const

type AclMap = Record<string, FolderAclDto[]>

function isAdminAccount(user: AdminUserDto): boolean {
  return user.roles.some((r) => r.toUpperCase() === 'ADMIN') || user.role.toLowerCase() === 'admin'
}

function cellKey(userId: string, folderId: string): string {
  return `${userId}:${folderId}`
}

export default function UsersPage(): React.JSX.Element {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const location = useLocation()

  const tab: Tab = location.pathname === '/admin/rights' ? 'rights' : 'users'

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [pendingCells, setPendingCells] = useState<ReadonlySet<string>>(new Set())

  const usersQuery = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.admin.listUsers(),
    staleTime: 15_000
  })
  const foldersQuery = useQuery({
    queryKey: ['admin', 'acl-folders'],
    queryFn: () => api.admin.listAclFolders(),
    staleTime: 60_000
  })

  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data])
  const modules = useMemo(
    () =>
      (foldersQuery.data ?? [])
        .filter((f) => f.isCategoryRoot)
        .sort(compareFoldersByOrder),
    [foldersQuery.data]
  )

  const aclsQuery = useQuery({
    queryKey: ACLS_KEY,
    enabled: modules.length > 0,
    staleTime: 15_000,
    queryFn: async (): Promise<AclMap> => {
      const entries = await Promise.all(
        modules.map(
          async (mod) => [mod.folderId, await api.admin.listFolderAcls(mod.folderId)] as const
        )
      )
      return Object.fromEntries(entries)
    }
  })
  const aclsByFolder = useMemo(() => aclsQuery.data ?? {}, [aclsQuery.data])

  const departmentsByUser = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const mod of modules) {
      for (const acl of aclsByFolder[mod.folderId] ?? []) {
        if (acl.principalType === 'USER' && acl.canView) {
          const list = map.get(acl.principalId) ?? []
          list.push(mod.name)
          map.set(acl.principalId, list)
        }
      }
    }
    return map
  }, [modules, aclsByFolder])

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => u.username.toLowerCase().includes(q))
  }, [users, search])

  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pagedUsers = filteredUsers.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  useEffect(() => {
    setPage(0)
  }, [search])

  const roleMutation = useMutation({
    mutationFn: (payload: { userId: string; isAdmin: boolean }) =>
      api.admin.setUserRoles({
        userId: payload.userId,
        roleCodes: [payload.isAdmin ? 'ADMIN' : 'MEMBER']
      }),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'users'] })
      const previous = queryClient.getQueryData<AdminUserDto[]>(['admin', 'users'])
      queryClient.setQueryData<AdminUserDto[]>(['admin', 'users'], (list) =>
        (list ?? []).map((u) =>
          u.userId === payload.userId
            ? {
                ...u,
                role: payload.isAdmin ? 'admin' : 'member',
                roles: [payload.isAdmin ? 'ADMIN' : 'MEMBER']
              }
            : u
        )
      )
      return { previous }
    },
    onError: (err: Error, _payload, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['admin', 'users'], ctx.previous)
      toast({ variant: 'error', title: 'Could not update role', description: err.message })
    },
    onSuccess: (user) => {
      queryClient.setQueryData<AdminUserDto[]>(['admin', 'users'], (list) =>
        (list ?? []).map((u) => (u.userId === user.userId ? user : u))
      )
      toast({
        variant: 'success',
        title: isAdminAccount(user) ? `${user.username} is now an Admin` : `${user.username} is a Member`
      })
    }
  })

  const disableMutation = useMutation({
    mutationFn: (payload: { userId: string; isDisabled: boolean }) =>
      api.admin.setUserDisabled(payload.userId, payload.isDisabled),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'users'] })
      const previous = queryClient.getQueryData<AdminUserDto[]>(['admin', 'users'])
      queryClient.setQueryData<AdminUserDto[]>(['admin', 'users'], (list) =>
        (list ?? []).map((u) =>
          u.userId === payload.userId ? { ...u, isDisabled: payload.isDisabled } : u
        )
      )
      return { previous }
    },
    onError: (err: Error, _payload, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['admin', 'users'], ctx.previous)
      toast({ variant: 'error', title: 'Could not update account', description: err.message })
    },
    onSuccess: (user) => {
      queryClient.setQueryData<AdminUserDto[]>(['admin', 'users'], (list) =>
        (list ?? []).map((u) => (u.userId === user.userId ? user : u))
      )
      toast({
        variant: 'success',
        title: `${user.isDisabled ? 'Disabled' : 'Enabled'} ${user.username}`
      })
    }
  })

  const toggleAcl = useMutation({
    mutationFn: async (vars: {
      userId: string
      username: string
      folderId: string
      next: boolean
    }): Promise<{ folderId: string; acls: FolderAclDto[] }> => {
      if (vars.next) {
        const acls = await api.admin.setFolderAcl({
          folderId: vars.folderId,
          principalType: 'USER',
          principalId: vars.userId,
          canView: true,
          canEdit: false,
          canCopy: true,
          canDelete: false,
          inherit: true
        })
        return { folderId: vars.folderId, acls }
      }
      const current = queryClient.getQueryData<AclMap>(ACLS_KEY)?.[vars.folderId] ?? []
      const acl = current.find(
        (a) => a.principalType === 'USER' && a.principalId === vars.userId
      )
      if (!acl) return { folderId: vars.folderId, acls: current }
      const acls = await api.admin.revokeFolderAcl(acl.folderAclId)
      return { folderId: vars.folderId, acls }
    },
    onMutate: async (vars) => {
      setPendingCells((prev) => new Set(prev).add(cellKey(vars.userId, vars.folderId)))
      await queryClient.cancelQueries({ queryKey: ACLS_KEY })
      const previous = queryClient.getQueryData<AclMap>(ACLS_KEY)
      queryClient.setQueryData<AclMap>(ACLS_KEY, (prev) => {
        const map: AclMap = { ...(prev ?? {}) }
        const list = (map[vars.folderId] ?? []).filter(
          (a) => !(a.principalType === 'USER' && a.principalId === vars.userId)
        )
        if (vars.next) {
          list.push({
            folderAclId: `optimistic:${cellKey(vars.userId, vars.folderId)}`,
            folderId: vars.folderId,
            principalType: 'USER',
            principalId: vars.userId,
            principalLabel: vars.username,
            canView: true,
            canEdit: false,
            canCopy: true,
            canDelete: false,
            inherit: true,
            grantedAt: new Date().toISOString()
          })
        }
        map[vars.folderId] = list
        return map
      })
      return { previous }
    },
    onError: (err: Error, vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(ACLS_KEY, ctx.previous)
      toast({
        variant: 'error',
        title: 'Could not update access',
        description: err.message || `Reverted ${vars.username}.`
      })
    },
    onSuccess: ({ folderId, acls }) => {
      queryClient.setQueryData<AclMap>(ACLS_KEY, (prev) => ({ ...(prev ?? {}), [folderId]: acls }))
    },
    onSettled: (_data, _err, vars) => {
      setPendingCells((prev) => {
        const next = new Set(prev)
        next.delete(cellKey(vars.userId, vars.folderId))
        return next
      })
    }
  })

  const isPendingCell = useCallback(
    (userId: string, folderId: string) => pendingCells.has(cellKey(userId, folderId)),
    [pendingCells]
  )

  return (
    <PageShell
      wide
      title="Users & rights"
      subtitle="Manage people, roles, and which modules each person can open."
    >
      <AdminTabs />

      {tab === 'users' ? (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-sv-text-muted" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search people"
                aria-label="Search people"
                className="pl-9"
              />
            </div>
            <Button onClick={() => setInviteOpen(true)} className="w-full sm:w-auto">
              <UserPlus />
              Invite user
            </Button>
          </div>

          <div className="overflow-x-auto rounded-[var(--sv-radius)] border border-sv-border">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="bg-sv-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-sv-text-muted">
                  <th scope="col" className="px-4 py-3">Person</th>
                  <th scope="col" className="px-4 py-3">Role</th>
                  <th scope="col" className="hidden px-4 py-3 md:table-cell">Departments</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {usersQuery.isPending ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRowSkeleton key={i} columns={5} />
                  ))
                ) : usersQuery.isError ? (
                  <tr>
                    <td colSpan={5}>
                      <ErrorState
                        className="py-12"
                        title="People didn’t load"
                        description={
                          usersQuery.error instanceof Error
                            ? usersQuery.error.message
                            : 'Couldn’t reach the directory. Try again in a moment.'
                        }
                        onRetry={() => void usersQuery.refetch()}
                      />
                    </td>
                  </tr>
                ) : pagedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState
                        className="py-12"
                        icon={Users}
                        title={search.trim() ? 'No people match that search' : 'No people yet'}
                        description={
                          search.trim()
                            ? 'Try a different name, or clear the search.'
                            : 'Invite someone so they can sign in and receive module access.'
                        }
                        action={
                          search.trim() ? undefined : (
                            <Button onClick={() => setInviteOpen(true)}>
                              <UserPlus />
                              Invite user
                            </Button>
                          )
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  pagedUsers.map((user) => {
                    const admin = isAdminAccount(user)
                    const departments = admin
                      ? ['All modules']
                      : departmentsByUser.get(user.userId) ?? []
                    return (
                      <tr
                        key={user.userId}
                        className="border-t border-sv-border transition-colors duration-fast ease-sv hover:bg-sv-surface-2/60"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <UserAvatar username={user.username} size="sm" />
                            <span className="font-medium text-sv-text">{user.username}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={admin ? 'accent' : 'neutral'} size="sm">
                            {admin ? <ShieldCheck /> : null}
                            {admin ? 'Admin' : 'Member'}
                          </Badge>
                        </td>
                        <td className="hidden px-4 py-3 md:table-cell">
                          {departments.length === 0 ? (
                            <span className="text-xs text-sv-text-faint">None</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {departments.slice(0, 3).map((dept) => (
                                <Badge key={dept} variant="outline" size="sm">
                                  {dept}
                                </Badge>
                              ))}
                              {departments.length > 3 ? (
                                <Badge variant="outline" size="sm">
                                  +{departments.length - 3}
                                </Badge>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-2 text-xs text-sv-text-muted">
                            <span
                              aria-hidden="true"
                              className={cn(
                                'size-2 rounded-full',
                                user.isDisabled ? 'bg-sv-text-faint' : 'bg-sv-success'
                              )}
                            />
                            {user.isDisabled ? 'Disabled' : 'Active'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={roleMutation.isPending}
                              onClick={() =>
                                roleMutation.mutate({ userId: user.userId, isAdmin: !admin })
                              }
                            >
                              {admin ? 'Make member' : 'Make admin'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={disableMutation.isPending}
                              onClick={() =>
                                disableMutation.mutate({
                                  userId: user.userId,
                                  isDisabled: !user.isDisabled
                                })
                              }
                            >
                              {user.isDisabled ? 'Enable' : 'Disable'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {filteredUsers.length > PAGE_SIZE ? (
            <div className="mt-3 flex items-center justify-between text-sm text-sv-text-muted">
              <span>
                {safePage * PAGE_SIZE + 1}–{Math.min(filteredUsers.length, (safePage + 1) * PAGE_SIZE)}{' '}
                of {filteredUsers.length}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft />
                  Prev
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                >
                  Next
                  <ChevronRight />
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p className="mb-4 max-w-2xl text-sm text-sv-text-muted">
            Tick a box to grant a person read access to a module. Changes save instantly and revert
            with a note if the server rejects them.
          </p>
          <RightsMatrix
            users={users}
            modules={modules}
            aclsByFolder={aclsByFolder}
            loading={foldersQuery.isPending || (modules.length > 0 && aclsQuery.isPending)}
            error={foldersQuery.isError || aclsQuery.isError}
            onRetry={() => {
              void foldersQuery.refetch()
              void aclsQuery.refetch()
            }}
            isPendingCell={isPendingCell}
            onToggle={(userId, folderId, next) => {
              const user = users.find((u) => u.userId === userId)
              toggleAcl.mutate({
                userId,
                username: user?.username ?? 'user',
                folderId,
                next
              })
            }}
          />
        </>
      )}

      <InviteUserModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        modules={modules}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
          void queryClient.invalidateQueries({ queryKey: ACLS_KEY })
        }}
      />
    </PageShell>
  )
}

