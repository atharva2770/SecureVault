import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Folder, Loader2, Shield, Trash2 } from 'lucide-react'

import type { FolderAclDto, FolderDto } from '@securevault/domain'
import { compareFoldersByOrder } from '@securevault/domain'
import { api } from '@/api/vault'
import { Button } from '@/components/ui/button'
import PageShell from '@/layout/PageShell'
import { cn } from '@/lib/utils'

type AclPrincipalKind = 'USER' | 'ROLE'

function folderPathLabel(folder: FolderDto, byId: Map<string, FolderDto>): string {
  const parts: string[] = []
  let cur: FolderDto | undefined = folder
  while (cur) {
    parts.unshift(cur.name)
    cur = cur.parentFolderId ? byId.get(cur.parentFolderId) : undefined
  }
  return parts.join(' / ')
}

export default function FolderPermissionsPage(): React.JSX.Element {
  const queryClient = useQueryClient()
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [aclPrincipalType, setAclPrincipalType] = useState<AclPrincipalKind>('USER')
  const [aclPrincipalId, setAclPrincipalId] = useState('')
  const [aclView, setAclView] = useState(true)
  const [aclEdit, setAclEdit] = useState(false)
  const [aclCopy, setAclCopy] = useState(false)
  const [aclDelete, setAclDelete] = useState(false)
  const [aclInherit, setAclInherit] = useState(true)
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
  const foldersQuery = useQuery({
    queryKey: ['admin', 'acl-folders'],
    queryFn: () => api.admin.listAclFolders()
  })
  const aclsQuery = useQuery({
    queryKey: ['admin', 'folder-acls', selectedFolderId],
    queryFn: () => api.admin.listFolderAcls(selectedFolderId!),
    enabled: Boolean(selectedFolderId)
  })

  const folderById = useMemo(
    () => new Map((foldersQuery.data ?? []).map((f) => [f.folderId, f])),
    [foldersQuery.data]
  )
  const rootFolders = useMemo(
    () =>
      (foldersQuery.data ?? [])
        .filter((f) => f.isCategoryRoot)
        .sort(compareFoldersByOrder),
    [foldersQuery.data]
  )
  const childFolders = useMemo(() => {
    if (!selectedFolderId) return []
    return (foldersQuery.data ?? [])
      .filter((f) => f.parentFolderId === selectedFolderId || f.folderId === selectedFolderId)
      .sort(
        (a, b) =>
          Number(b.isCategoryRoot) - Number(a.isCategoryRoot) || compareFoldersByOrder(a, b)
      )
  }, [foldersQuery.data, selectedFolderId])

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
    },
    onError: (err: Error) => setError(err.message || 'Could not save ACL.')
  })

  const revokeAclMutation = useMutation({
    mutationFn: (folderAclId: string) => api.admin.revokeFolderAcl(folderAclId),
    onSuccess: async () => {
      setStatus('Grant revoked.')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'folder-acls'] })
    },
    onError: (err: Error) => setError(err.message || 'Could not revoke ACL.')
  })

  function loadAclIntoForm(acl: FolderAclDto): void {
    setAclPrincipalType(acl.principalType === 'ROLE' ? 'ROLE' : 'USER')
    setAclPrincipalId(acl.principalId)
    setAclView(acl.canView)
    setAclEdit(acl.canEdit)
    setAclCopy(acl.canCopy)
    setAclDelete(acl.canDelete)
    setAclInherit(acl.inherit)
  }

  return (
    <PageShell
      title="Folder permissions"
      subtitle="Grant View, Edit, Copy, and Delete on a category folder or subfolder."
    >
      {status || error ? (
        <p className={`mb-4 text-sm ${error ? 'text-sv-danger' : 'text-sv-text-muted'}`}>
          {error ?? status}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
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
                    Grant access — {folderById.get(selectedFolderId)?.name ?? 'Folder'}
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
                    Copy
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
                    disabled={!aclPrincipalId || !selectedFolderId || setAclMutation.isPending}
                    onClick={() => void setAclMutation.mutateAsync()}
                  >
                    {setAclMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
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
    </PageShell>
  )
}
