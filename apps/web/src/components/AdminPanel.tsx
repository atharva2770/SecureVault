import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Eye,
  Folder,
  Loader2,
  Plus,
  Shield,
  Trash2,
  UserPlus,
  Users
} from 'lucide-react'

import type { AdminUserDto, FolderAclDto, FolderDto } from '@securevault/domain'
import { api } from '@/api/vault'
import TitleBar from '@/components/TitleBar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type AdminTab = 'users' | 'folders' | 'myaccess'
type AclPrincipalKind = 'USER' | 'ROLE'

interface AdminPanelProps {
  username: string
  onBack: () => void
  onLocked: () => void
}

function folderPathLabel(folder: FolderDto, byId: Map<string, FolderDto>): string {
  const parts: string[] = []
  let cur: FolderDto | undefined = folder
  while (cur) {
    parts.unshift(cur.name)
    cur = cur.parentFolderId ? byId.get(cur.parentFolderId) : undefined
  }
  return parts.join(' / ')
}

export default function AdminPanel({
  username,
  onBack,
  onLocked
}: AdminPanelProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<AdminTab>('users')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('MEMBER')
  const [grantRoots, setGrantRoots] = useState(true)

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [aclPrincipalType, setAclPrincipalType] = useState<AclPrincipalKind>('USER')
  const [aclPrincipalId, setAclPrincipalId] = useState('')
  const [aclView, setAclView] = useState(true)
  const [aclEdit, setAclEdit] = useState(false)
  const [aclCopy, setAclCopy] = useState(false)
  const [aclDelete, setAclDelete] = useState(false)
  const [aclInherit, setAclInherit] = useState(true)

  const usersQuery = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.admin.listUsers()
  })

  const rolesQuery = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: () => api.admin.listRoles()
  })

  const foldersQuery = useQuery({
    queryKey: ['admin', 'acl-folders'],
    queryFn: () => api.admin.listAclFolders(),
    enabled: tab === 'folders'
  })

  const aclsQuery = useQuery({
    queryKey: ['admin', 'folder-acls', selectedFolderId],
    queryFn: () => api.admin.listFolderAcls(selectedFolderId!),
    enabled: Boolean(selectedFolderId)
  })

  const myAccessQuery = useQuery({
    queryKey: ['admin', 'my-access'],
    queryFn: () => api.admin.getMyAccess(),
    enabled: tab === 'myaccess'
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
      setStatus(`Created user “${user.username}” with role ${user.roles.join(', ')}.`)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (err: Error) => {
      setError(err.message || 'Could not create user.')
    }
  })

  const setRolesMutation = useMutation({
    mutationFn: (payload: { userId: string; roleCodes: string[] }) =>
      api.admin.setUserRoles(payload),
    onSuccess: async (user) => {
      setStatus(`Updated roles for ${user.username}.`)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (err: Error) => {
      setError(err.message || 'Could not update roles.')
    }
  })

  const disableMutation = useMutation({
    mutationFn: (payload: { userId: string; isDisabled: boolean }) =>
      api.admin.setUserDisabled(payload.userId, payload.isDisabled),
    onSuccess: async (user) => {
      setStatus(`${user.isDisabled ? 'Disabled' : 'Enabled'} ${user.username}.`)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (err: Error) => {
      setError(err.message || 'Could not update account.')
    }
  })

  const setAclMutation = useMutation({
    mutationFn: () =>
      api.admin.setFolderAcl({
        folderId: selectedFolderId!,
        principalType: aclPrincipalType,
        principalId: aclPrincipalId,
        canView: aclView,
        canEdit: aclEdit,
        canCopy: aclCopy,
        canDelete: aclDelete,
        inherit: aclInherit
      }),
    onSuccess: async () => {
      setStatus('Folder permissions saved.')
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'folder-acls'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'my-access'] })
      await queryClient.invalidateQueries({ queryKey: ['folders'] })
    },
    onError: (err: Error) => {
      setError(err.message || 'Could not save ACL.')
    }
  })

  const revokeAclMutation = useMutation({
    mutationFn: (folderAclId: string) => api.admin.revokeFolderAcl(folderAclId),
    onSuccess: async () => {
      setStatus('Permission revoked.')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'folder-acls'] })
    },
    onError: (err: Error) => {
      setError(err.message || 'Could not revoke ACL.')
    }
  })

  const folderById = useMemo(() => {
    const map = new Map<string, FolderDto>()
    for (const f of foldersQuery.data ?? []) map.set(f.folderId, f)
    return map
  }, [foldersQuery.data])

  const rootFolders = useMemo(() => {
    return (foldersQuery.data ?? [])
      .filter((f) => f.isCategoryRoot)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [foldersQuery.data])

  const childFolders = useMemo(() => {
    if (!selectedFolderId) return []
    return (foldersQuery.data ?? [])
      .filter((f) => f.parentFolderId === selectedFolderId || f.folderId === selectedFolderId)
      .sort((a, b) => Number(b.isCategoryRoot) - Number(a.isCategoryRoot) || a.name.localeCompare(b.name))
  }, [foldersQuery.data, selectedFolderId])

  async function handleMasterLock(): Promise<void> {
    await api.auth.lockVault()
    onLocked()
  }

  function applyRole(user: AdminUserDto, roleCode: string): void {
    void setRolesMutation.mutateAsync({ userId: user.userId, roleCodes: [roleCode] })
  }

  function loadAclIntoForm(acl: FolderAclDto): void {
    setAclPrincipalType(acl.principalType === 'ROLE' ? 'ROLE' : 'USER')
    setAclPrincipalId(acl.principalId)
    setAclView(acl.canView)
    setAclEdit(acl.canEdit)
    setAclCopy(acl.canCopy)
    setAclDelete(acl.canDelete)
    setAclInherit(acl.inherit)
  }

  function rightsBadges(rights: {
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

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TitleBar
        title="SecureVault · Admin"
        unlocked
        username={username}
        onMasterLock={() => {
          void handleMasterLock()
        }}
      />

      <div className="flex items-center gap-2 border-b border-sv-border bg-sv-surface/80 px-3 py-2">
        <Button size="sm" variant="ghost" className="h-8 gap-1.5" onClick={onBack}>
          <ArrowLeft className="size-3.5" />
          Back to vault
        </Button>
        <div className="ml-2 flex gap-1 rounded-lg border border-sv-border bg-sv-bg p-0.5">
          <button
            type="button"
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition',
              tab === 'users'
                ? 'bg-sv-accent/20 text-sv-accent'
                : 'text-sv-text-muted hover:text-sv-text'
            )}
            onClick={() => setTab('users')}
          >
            <Users className="size-3.5" />
            Users & roles
          </button>
          <button
            type="button"
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition',
              tab === 'folders'
                ? 'bg-sv-accent/20 text-sv-accent'
                : 'text-sv-text-muted hover:text-sv-text'
            )}
            onClick={() => setTab('folders')}
          >
            <Folder className="size-3.5" />
            Folder permissions
          </button>
          <button
            type="button"
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition',
              tab === 'myaccess'
                ? 'bg-sv-accent/20 text-sv-accent'
                : 'text-sv-text-muted hover:text-sv-text'
            )}
            onClick={() => setTab('myaccess')}
          >
            <Eye className="size-3.5" />
            My access
          </button>
        </div>
      </div>

      {(status || error) && (
        <p
          className={cn(
            'border-b border-sv-border px-4 py-2 text-xs',
            error ? 'text-sv-danger' : 'text-sv-text-muted'
          )}
        >
          {error ?? status}
        </p>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'myaccess' ? (
          <div className="mx-auto max-w-4xl">
            <section className="rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface">
              <div className="border-b border-sv-border px-4 py-3">
                <h2 className="text-sm font-semibold text-sv-text">Folders you can access</h2>
                <p className="mt-1 text-xs text-sv-text-muted">
                  Effective rights after role caps, inheritance, and exact overrides.
                </p>
              </div>
              {myAccessQuery.isLoading ? (
                <div className="flex items-center gap-2 p-6 text-sv-text-muted">
                  <Loader2 className="size-4 animate-spin" />
                  Loading…
                </div>
              ) : (myAccessQuery.data ?? []).length === 0 ? (
                <p className="p-4 text-xs text-sv-text-muted">
                  No folders with View access. Ask an admin to grant folder permissions.
                </p>
              ) : (
                <ul className="divide-y divide-sv-border">
                  {(myAccessQuery.data ?? []).map((entry) => (
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
                      <p className="shrink-0 text-xs text-sv-text-muted">
                        {rightsBadges(entry.rights)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : tab === 'users' ? (
          <div className="mx-auto flex max-w-5xl flex-col gap-6">
            <section className="rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface p-4">
              <div className="mb-3 flex items-center gap-2">
                <UserPlus className="size-4 text-sv-accent" />
                <h2 className="text-sm font-semibold text-sv-text">Add user</h2>
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
                  <span className="text-sv-text-muted">Role</span>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="h-9 w-full rounded-md border border-sv-border bg-sv-bg px-2 text-sm text-sv-text outline-none focus:border-sv-accent"
                  >
                    {(rolesQuery.data ?? []).map((r) => (
                      <option key={r.roleId} value={r.code}>
                        {r.name}
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
                    disabled={
                      !newUsername.trim() ||
                      newPassword.length < 8 ||
                      createUserMutation.isPending
                    }
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
              <p className="mt-3 text-[11px] text-sv-text-muted">
                Tip: leave “Grant all category folders” off, then set exact folder rights on the
                Folder permissions tab.
              </p>
            </section>

            <section className="rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface">
              <div className="border-b border-sv-border px-4 py-3">
                <h2 className="text-sm font-semibold text-sv-text">Users</h2>
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
                        <p className="truncate text-sm font-medium text-sv-text">
                          {user.username}
                          {user.isDisabled ? (
                            <span className="ml-2 text-[10px] uppercase text-sv-danger">
                              Disabled
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-sv-text-muted">
                          Roles: {user.roles.join(', ') || user.role}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          className="h-8 rounded-md border border-sv-border bg-sv-bg px-2 text-xs text-sv-text"
                          value={user.roles[0] ?? user.role.toUpperCase()}
                          onChange={(e) => applyRole(user, e.target.value)}
                          disabled={setRolesMutation.isPending}
                        >
                          {(rolesQuery.data ?? []).map((r) => (
                            <option key={r.roleId} value={r.code}>
                              {r.name}
                            </option>
                          ))}
                        </select>
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
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : (
          <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[260px_1fr]">
            <aside className="rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface">
              <div className="border-b border-sv-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-sv-text-muted">
                Categories
              </div>
              <nav className="max-h-[70vh] overflow-y-auto p-2">
                {foldersQuery.isLoading ? (
                  <p className="px-2 py-3 text-xs text-sv-text-muted">Loading…</p>
                ) : (
                  rootFolders.map((folder) => (
                    <button
                      key={folder.folderId}
                      type="button"
                      className={cn(
                        'mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm',
                        selectedFolderId === folder.folderId
                          ? 'bg-sv-accent/15 text-sv-accent'
                          : 'text-sv-text-muted hover:bg-sv-surface-raised hover:text-sv-text'
                      )}
                      onClick={() => setSelectedFolderId(folder.folderId)}
                    >
                      <Folder className="size-4 shrink-0" />
                      <span className="truncate">{folder.name}</span>
                    </button>
                  ))
                )}
              </nav>
            </aside>

            <section className="space-y-4">
              {!selectedFolderId ? (
                <div className="flex h-48 items-center justify-center rounded-[var(--sv-radius)] border border-dashed border-sv-border text-sm text-sv-text-muted">
                  Select a category folder to edit who can View / Edit / Copy / Delete.
                </div>
              ) : (
                <>
                  <div className="rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Shield className="size-4 text-sv-accent" />
                      <h2 className="text-sm font-semibold text-sv-text">
                        Grant access —{' '}
                        {folderById.get(selectedFolderId)?.name ?? 'Folder'}
                      </h2>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1 text-xs">
                        <span className="text-sv-text-muted">Grant to</span>
                        <select
                          value={aclPrincipalType}
                          onChange={(e) => {
                            setAclPrincipalType(e.target.value as AclPrincipalKind)
                            setAclPrincipalId('')
                          }}
                          className="h-9 w-full rounded-md border border-sv-border bg-sv-bg px-2 text-sm text-sv-text"
                        >
                          <option value="USER">User</option>
                          <option value="ROLE">Role (all users with this role)</option>
                        </select>
                      </label>
                      <label className="space-y-1 text-xs">
                        <span className="text-sv-text-muted">
                          {aclPrincipalType === 'ROLE' ? 'Role' : 'User'}
                        </span>
                        <select
                          value={aclPrincipalId}
                          onChange={(e) => setAclPrincipalId(e.target.value)}
                          className="h-9 w-full rounded-md border border-sv-border bg-sv-bg px-2 text-sm text-sv-text"
                        >
                          <option value="">
                            {aclPrincipalType === 'ROLE' ? 'Select role…' : 'Select user…'}
                          </option>
                          {aclPrincipalType === 'ROLE'
                            ? (rolesQuery.data ?? []).map((r) => (
                                <option key={r.roleId} value={r.roleId}>
                                  {r.name} ({r.code})
                                </option>
                              ))
                            : (usersQuery.data ?? []).map((u) => (
                                <option key={u.userId} value={u.userId}>
                                  {u.username}
                                </option>
                              ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-2 text-sm text-sv-text">
                        <input
                          type="checkbox"
                          checked={aclView}
                          onChange={(e) => {
                            setAclView(e.target.checked)
                            if (!e.target.checked) {
                              setAclEdit(false)
                              setAclCopy(false)
                              setAclDelete(false)
                            }
                          }}
                        />
                        View
                      </label>
                      <label className="flex items-center gap-2 text-sm text-sv-text">
                        <input
                          type="checkbox"
                          checked={aclEdit}
                          disabled={!aclView}
                          onChange={(e) => setAclEdit(e.target.checked)}
                        />
                        Edit (upload / folders)
                      </label>
                      <label className="flex items-center gap-2 text-sm text-sv-text">
                        <input
                          type="checkbox"
                          checked={aclCopy}
                          disabled={!aclView}
                          onChange={(e) => setAclCopy(e.target.checked)}
                        />
                        Copy / Download
                      </label>
                      <label className="flex items-center gap-2 text-sm text-sv-text">
                        <input
                          type="checkbox"
                          checked={aclDelete}
                          disabled={!aclView}
                          onChange={(e) => setAclDelete(e.target.checked)}
                        />
                        Delete / Cut
                      </label>
                      <label className="flex items-center gap-2 text-sm text-sv-text sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={aclInherit}
                          onChange={(e) => setAclInherit(e.target.checked)}
                        />
                        Inherit to subfolders
                      </label>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        disabled={
                          !aclPrincipalId || !selectedFolderId || setAclMutation.isPending
                        }
                        onClick={() => void setAclMutation.mutateAsync()}
                      >
                        {setAclMutation.isPending ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : null}
                        Save permissions
                      </Button>
                      {childFolders.length > 1 ? (
                        <select
                          className="h-8 rounded-md border border-sv-border bg-sv-bg px-2 text-xs text-sv-text"
                          value={selectedFolderId}
                          onChange={(e) => setSelectedFolderId(e.target.value)}
                        >
                          {childFolders.map((f) => (
                            <option key={f.folderId} value={f.folderId}>
                              {folderPathLabel(f, folderById)}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface">
                    <div className="border-b border-sv-border px-4 py-3 text-sm font-semibold text-sv-text">
                      Current grants
                    </div>
                    {aclsQuery.isLoading ? (
                      <p className="p-4 text-xs text-sv-text-muted">Loading…</p>
                    ) : (aclsQuery.data ?? []).length === 0 ? (
                      <p className="p-4 text-xs text-sv-text-muted">
                        No grants yet. Users without VIEW cannot see this folder.
                      </p>
                    ) : (
                      <ul className="divide-y divide-sv-border">
                        {(aclsQuery.data ?? []).map((acl) => (
                          <li
                            key={acl.folderAclId}
                            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <button
                              type="button"
                              className="min-w-0 text-left"
                              onClick={() => loadAclIntoForm(acl)}
                            >
                              <p className="text-sm font-medium text-sv-text">
                                {acl.principalLabel}{' '}
                                <span className="text-[10px] uppercase text-sv-text-muted">
                                  {acl.principalType}
                                </span>
                              </p>
                              <p className="text-xs text-sv-text-muted">
                                {[
                                  acl.canView && 'View',
                                  acl.canEdit && 'Edit',
                                  acl.canCopy && 'Copy',
                                  acl.canDelete && 'Delete',
                                  acl.inherit && 'Inherit'
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                            </button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8 text-sv-danger"
                              title="Revoke"
                              onClick={() => void revokeAclMutation.mutateAsync(acl.folderAclId)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
