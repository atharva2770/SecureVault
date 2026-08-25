import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, Plus, Shield, UserPlus, Users } from 'lucide-react'

import type { AdminUserDto, FolderGrantDto, UserFolderAccessDto } from '@securevault/domain'
import { folderGrantsEqual } from '@securevault/domain'
import { api } from '@/api/vault'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/UserAvatar'
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback'
import PageShell from '@/layout/PageShell'
import { cn } from '@/lib/utils'
import FolderAccessPicker from './FolderAccessPicker'

type DraftKind = { type: 'new' } | { type: 'user'; userId: string }
type PersistPhase = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

const ACCESS_STALE_MS = 30_000
const FOLDER_SAVE_DEBOUNCE_MS = 400

function accessKey(userId: string) {
  return ['admin', 'folder-access', userId] as const
}

function isAdminAccount(user: AdminUserDto): boolean {
  return user.roles.some((r) => r.toUpperCase() === 'ADMIN') || user.role.toLowerCase() === 'admin'
}

function roleLabel(user: AdminUserDto): string {
  return isAdminAccount(user) ? 'Admin' : 'Member'
}

export default function UsersPage(): React.JSX.Element {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<DraftKind>({ type: 'new' })
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const listPending = search !== deferredSearch

  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newIsAdmin, setNewIsAdmin] = useState(false)
  const [newGrants, setNewGrants] = useState<FolderGrantDto[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [persistPhase, setPersistPhase] = useState<PersistPhase>('idle')

  const selectedUserId = draft.type === 'user' ? draft.userId : null
  const selectedUserIdRef = useRef(selectedUserId)
  selectedUserIdRef.current = selectedUserId
  const lastPersisted = useRef<{ userId: string; grants: FolderGrantDto[] } | null>(null)
  const saveInFlight = useRef(false)
  const saveQueued = useRef<{ userId: string; grants: FolderGrantDto[] } | null>(null)

  const setPhaseFor = useCallback((userId: string, phase: PersistPhase) => {
    if (selectedUserIdRef.current === userId) setPersistPhase(phase)
  }, [])

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
  const accessQuery = useQuery({
    queryKey: ['admin', 'folder-access', selectedUserId],
    queryFn: () => api.admin.getUserFolderAccess(selectedUserId!),
    enabled: Boolean(selectedUserId),
    staleTime: ACCESS_STALE_MS
  })

  const users = usersQuery.data ?? []
  const folders = foldersQuery.data ?? []
  const selectedUser = users.find((u) => u.userId === selectedUserId) ?? null
  const grants = accessQuery.data?.grants ?? []
  const editIsAdmin = Boolean(
    accessQuery.data?.isAdmin || (selectedUser ? isAdminAccount(selectedUser) : false)
  )

  const visibleUsers = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => u.username.toLowerCase().includes(q))
  }, [users, deferredSearch])

  const persistGrantsNow = useCallback(
    async (userId: string, nextGrants: FolderGrantDto[]) => {
      saveQueued.current = { userId, grants: nextGrants }
      if (saveInFlight.current) return
      saveInFlight.current = true

      try {
        while (saveQueued.current) {
          const job = saveQueued.current
          saveQueued.current = null

          const last = lastPersisted.current
          if (last && last.userId === job.userId && folderGrantsEqual(last.grants, job.grants)) {
            setPhaseFor(job.userId, 'saved')
            continue
          }

          setPhaseFor(job.userId, 'saving')
          try {
            const result = await api.admin.setUserFolderAccess(job.userId, job.grants)
            if (saveQueued.current) continue
            lastPersisted.current = { userId: job.userId, grants: result.grants }
            queryClient.setQueryData(accessKey(job.userId), result)
            setPhaseFor(job.userId, 'saved')
          } catch (err) {
            if (saveQueued.current) continue
            setPhaseFor(job.userId, 'error')
            if (selectedUserIdRef.current === job.userId) {
              setError(err instanceof Error ? err.message : 'Could not save folder rights.')
            }
            await queryClient.invalidateQueries({ queryKey: accessKey(job.userId) })
          }
        }
      } finally {
        saveInFlight.current = false
      }
    },
    [queryClient, setPhaseFor]
  )

  const persistGrants = useDebouncedCallback(persistGrantsNow, FOLDER_SAVE_DEBOUNCE_MS, {
    flushOnUnmount: true
  })

  useEffect(() => {
    if (persistPhase !== 'saved') return
    const t = window.setTimeout(() => setPersistPhase('idle'), 1600)
    return () => window.clearTimeout(t)
  }, [persistPhase])

  const createMutation = useMutation({
    mutationFn: () =>
      api.admin.createUser({
        username: newUsername.trim(),
        password: newPassword,
        roleCode: newIsAdmin ? 'ADMIN' : 'MEMBER',
        folderGrants: newIsAdmin ? [] : newGrants
      }),
    onSuccess: async (user) => {
      setNewUsername('')
      setNewPassword('')
      setNewIsAdmin(false)
      setNewGrants([])
      setStatus(`Created ${user.username}.`)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      startTransition(() => setDraft({ type: 'user', userId: user.userId }))
    },
    onError: (err: Error) => setError(err.message || 'Could not create this person.')
  })

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
            ? { ...u, role: payload.isAdmin ? 'admin' : 'member', roles: [payload.isAdmin ? 'ADMIN' : 'MEMBER'] }
            : u
        )
      )
      queryClient.setQueryData<UserFolderAccessDto>(accessKey(payload.userId), (prev) =>
        prev ? { ...prev, isAdmin: payload.isAdmin } : prev
      )
      return { previous }
    },
    onError: (err: Error, payload, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['admin', 'users'], ctx.previous)
      void queryClient.invalidateQueries({ queryKey: accessKey(payload.userId) })
      setError(err.message || 'Could not update role.')
    },
    onSuccess: (user) => {
      setStatus(
        isAdminAccount(user)
          ? `${user.username} is now an Admin and can open every folder.`
          : `${user.username} is a Member. Set View / Edit / Copy / Delete on the folders they may use.`
      )
      setError(null)
      queryClient.setQueryData<AdminUserDto[]>(['admin', 'users'], (list) =>
        (list ?? []).map((u) => (u.userId === user.userId ? user : u))
      )
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
      setError(err.message || 'Could not update account.')
    },
    onSuccess: (user) => {
      setStatus(`${user.isDisabled ? 'Disabled' : 'Enabled'} ${user.username}.`)
      queryClient.setQueryData<AdminUserDto[]>(['admin', 'users'], (list) =>
        (list ?? []).map((u) => (u.userId === user.userId ? user : u))
      )
    }
  })

  const prefetchAccess = useCallback(
    (userId: string) => {
      void queryClient.prefetchQuery({
        queryKey: accessKey(userId),
        queryFn: () => api.admin.getUserFolderAccess(userId),
        staleTime: ACCESS_STALE_MS
      })
    },
    [queryClient]
  )

  const applyGrants = useCallback(
    (nextGrants: FolderGrantDto[]) => {
      if (!selectedUserId) return
      queryClient.setQueryData<UserFolderAccessDto>(accessKey(selectedUserId), (prev) => ({
        userId: selectedUserId,
        isAdmin: prev?.isAdmin ?? editIsAdmin,
        grants: nextGrants
      }))
      setPersistPhase('pending')
      setError(null)
      persistGrants(selectedUserId, nextGrants)
    },
    [editIsAdmin, persistGrants, queryClient, selectedUserId]
  )

  function openUser(user: AdminUserDto): void {
    persistGrants.flush()
    lastPersisted.current = null
    setStatus(null)
    setError(null)
    setPersistPhase('idle')
    startTransition(() => setDraft({ type: 'user', userId: user.userId }))
  }

  function startNew(): void {
    persistGrants.flush()
    setStatus(null)
    setError(null)
    setPersistPhase('idle')
    startTransition(() => setDraft({ type: 'new' }))
  }

  function saveRole(nextAdmin: boolean): void {
    if (!selectedUser || nextAdmin === editIsAdmin) return
    persistGrants.flush()
    void roleMutation.mutateAsync({ userId: selectedUser.userId, isAdmin: nextAdmin })
  }

  const creating = draft.type === 'new'
  const showFolderSkeleton = Boolean(selectedUserId) && accessQuery.isPending && !accessQuery.data

  return (
    <PageShell
      wide
      title="People & folders"
      subtitle="Pick a person, then set View, Edit, Copy, Delete, and Subfolders for each folder."
    >
      {status || error ? (
        <p className={`mb-4 text-sm ${error ? 'text-sv-danger' : 'text-sv-text-muted'}`}>
          {error ?? status}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex flex-col overflow-hidden rounded-2xl border border-sv-border bg-sv-surface">
          <div className="border-b border-sv-border p-3">
            <div className="relative">
              <Users className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-sv-text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find a person"
                className="h-9 w-full rounded-lg border border-sv-border bg-sv-bg pr-3 pl-8 text-sm text-sv-text outline-none focus:border-sv-accent"
              />
            </div>
            <Button size="sm" className="mt-3 h-9 w-full gap-1.5" onClick={startNew}>
              <Plus className="size-3.5" />
              Add person
            </Button>
          </div>
          <ul
            className={cn(
              'max-h-[min(560px,70vh)] flex-1 overflow-y-auto p-1.5 transition-opacity duration-150',
              listPending && 'opacity-70'
            )}
          >
            {usersQuery.isPending ? (
              <li className="flex items-center gap-2 px-3 py-6 text-sm text-sv-text-muted">
                <Loader2 className="size-4 animate-spin" />
                Loading…
              </li>
            ) : visibleUsers.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-sv-text-muted">No people found.</li>
            ) : (
              visibleUsers.map((user) => {
                const active = selectedUserId === user.userId
                return (
                  <li key={user.userId}>
                    <button
                      type="button"
                      onPointerEnter={() => prefetchAccess(user.userId)}
                      onFocus={() => prefetchAccess(user.userId)}
                      onClick={() => openUser(user)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors',
                        active ? 'bg-sv-accent/15' : 'hover:bg-sv-surface-raised'
                      )}
                    >
                      <UserAvatar username={user.username} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-sv-text">
                          {user.username}
                        </span>
                        <span className="block text-[11px] text-sv-text-muted">
                          {roleLabel(user)}
                          {user.isDisabled ? ' · Disabled' : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </aside>

        <section className="min-h-[420px] rounded-2xl border border-sv-border bg-sv-surface p-5 sm:p-6">
          {creating ? (
            <>
              <div className="mb-5 flex items-start gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-sv-accent/15 text-sv-accent">
                  <UserPlus className="size-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-sv-text">New person</h2>
                  <p className="text-sm text-sv-text-muted">
                    They sign in with this username and temporary password. Then set folder rights
                    below.
                  </p>
                </div>
              </div>

              <div className="mb-5 grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-xs">
                  <span className="font-medium text-sv-text-muted">Username</span>
                  <input
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="h-10 w-full rounded-lg border border-sv-border bg-sv-bg px-3 text-sm text-sv-text outline-none focus:border-sv-accent"
                    placeholder="e.g. priya"
                    autoComplete="off"
                  />
                </label>
                <label className="space-y-1.5 text-xs">
                  <span className="font-medium text-sv-text-muted">Temporary password</span>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-10 w-full rounded-lg border border-sv-border bg-sv-bg px-3 text-sm text-sv-text outline-none focus:border-sv-accent"
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                  />
                </label>
              </div>

              <RoleCards
                isAdmin={newIsAdmin}
                onChange={setNewIsAdmin}
                disabled={createMutation.isPending}
              />

              <div className="mt-6">
                <h3 className="mb-1 text-sm font-semibold text-sv-text">Folder rights</h3>
                <p className="mb-3 text-xs text-sv-text-muted">
                  {newIsAdmin
                    ? 'Admins automatically have every right on every folder. You do not need to tick anything.'
                    : 'View = read. Edit = upload and new folders. Copy = copy/download. Delete = delete/cut. Subfolders = inherit those rights inside the folder.'}
                </p>
                <FolderAccessPicker
                  folders={folders}
                  grants={newGrants}
                  onChange={setNewGrants}
                  lockedAll={newIsAdmin}
                  disabled={createMutation.isPending}
                />
              </div>

              {!newIsAdmin && newGrants.length === 0 ? (
                <p className="mt-3 text-xs text-amber-400">
                  No rights set — they will not see anything in My Vault until you tick at least
                  View on one folder.
                </p>
              ) : null}

              <div className="mt-6 flex justify-end">
                <Button
                  className="h-10 gap-1.5 px-4"
                  disabled={
                    !newUsername.trim() || newPassword.length < 8 || createMutation.isPending
                  }
                  onClick={() => {
                    if (createMutation.isPending) return
                    void createMutation.mutateAsync()
                  }}
                >
                  {createMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  Create person
                </Button>
              </div>
            </>
          ) : selectedUser ? (
            <>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <UserAvatar username={selectedUser.username} size="md" />
                  <div>
                    <h2 className="text-lg font-semibold text-sv-text">{selectedUser.username}</h2>
                    <p className="text-xs text-sv-text-muted">
                      {roleLabel(selectedUser)}
                      {selectedUser.isDisabled ? ' · This account is disabled' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <PersistBadge phase={persistPhase} />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 text-xs"
                    disabled={disableMutation.isPending}
                    onClick={() =>
                      void disableMutation.mutateAsync({
                        userId: selectedUser.userId,
                        isDisabled: !selectedUser.isDisabled
                      })
                    }
                  >
                    {selectedUser.isDisabled ? 'Enable account' : 'Disable account'}
                  </Button>
                </div>
              </div>

              <RoleCards
                isAdmin={editIsAdmin}
                onChange={saveRole}
                disabled={roleMutation.isPending}
              />

              <div className="mt-6">
                <h3 className="mb-1 text-sm font-semibold text-sv-text">Folder rights</h3>
                <p className="mb-3 text-xs text-sv-text-muted">
                  {editIsAdmin
                    ? 'Admins can open every folder with full rights. These boxes are only used for members.'
                    : 'Each column maps to FolderAcls (CanView, CanEdit, CanCopy, CanDelete, Inherit). Saves a moment after you stop clicking.'}
                </p>
                {showFolderSkeleton ? (
                  <div className="flex items-center gap-2 py-8 text-sm text-sv-text-muted">
                    <Loader2 className="size-4 animate-spin" />
                    Loading folder rights…
                  </div>
                ) : (
                  <FolderAccessPicker
                    folders={folders}
                    grants={grants}
                    onChange={applyGrants}
                    lockedAll={editIsAdmin}
                    disabled={roleMutation.isPending}
                  />
                )}
              </div>

              {!editIsAdmin && !showFolderSkeleton && grants.length === 0 ? (
                <p className="mt-3 text-xs text-amber-400">
                  No FolderAcls rows for this person — they currently have no vault folders.
                </p>
              ) : null}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Shield className="mb-3 size-8 text-sv-text-muted" />
              <p className="text-sm font-medium text-sv-text">Select a person</p>
              <p className="mt-1 max-w-sm text-sm text-sv-text-muted">
                Or add someone new, then set View / Edit / Copy / Delete on the folders they should
                use.
              </p>
            </div>
          )}
        </section>
      </div>
    </PageShell>
  )
}

function PersistBadge({ phase }: { phase: PersistPhase }): React.JSX.Element | null {
  if (phase === 'idle' || phase === 'error') return null
  const saving = phase === 'pending' || phase === 'saving'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[11px] font-medium transition-opacity duration-200',
        saving ? 'text-sv-text-muted' : 'text-emerald-400'
      )}
      aria-live="polite"
    >
      {saving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
      {phase === 'pending' ? 'Waiting…' : phase === 'saving' ? 'Saving…' : 'Saved'}
    </span>
  )
}

function RoleCards({
  isAdmin,
  onChange,
  disabled
}: {
  isAdmin: boolean
  onChange: (isAdmin: boolean) => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-sv-text-muted">Who they are</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (!isAdmin) return
            onChange(false)
          }}
          className={cn(
            'rounded-xl border px-4 py-3 text-left transition-colors',
            !isAdmin
              ? 'border-sv-accent bg-sv-accent/10'
              : 'border-sv-border hover:border-sv-text-muted/40'
          )}
        >
          <p className="text-sm font-semibold text-sv-text">Member</p>
          <p className="mt-0.5 text-xs text-sv-text-muted">
            Only the folder rights you set below.
          </p>
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (isAdmin) return
            onChange(true)
          }}
          className={cn(
            'rounded-xl border px-4 py-3 text-left transition-colors',
            isAdmin
              ? 'border-sv-accent bg-sv-accent/10'
              : 'border-sv-border hover:border-sv-text-muted/40'
          )}
        >
          <p className="text-sm font-semibold text-sv-text">Admin</p>
          <p className="mt-0.5 text-xs text-sv-text-muted">Every folder, plus adding people.</p>
        </button>
      </div>
    </div>
  )
}
