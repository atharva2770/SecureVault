import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Loader2, UserPlus } from 'lucide-react'

import type { AdminUserDto, FolderDto } from '@securevault/domain'
import { api } from '@/api/vault'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

interface InviteUserModalProps {
  open: boolean
  onClose: () => void
  /** Category-root folders offered as "primary department". */
  modules: FolderDto[]
  onCreated: (user: AdminUserDto) => void
}

/*
  "Invite user" flow. DOCMAN has no email-invite endpoint — accounts are created
  with a username + temporary password via the real createUser endpoint. The
  "primary department" maps to a read grant on that module's category-root folder.
*/
export function InviteUserModal({
  open,
  onClose,
  modules,
  onCreated
}: InviteUserModalProps): React.JSX.Element {
  const { toast } = useToast()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [department, setDepartment] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setUsername('')
    setPassword('')
    setIsAdmin(false)
    setDepartment('')
    setError(null)
  }, [open])

  const mutation = useMutation({
    mutationFn: () =>
      api.admin.createUser({
        username: username.trim(),
        password,
        roleCode: isAdmin ? 'ADMIN' : 'MEMBER',
        folderGrants:
          !isAdmin && department
            ? [
                {
                  folderId: department,
                  canView: true,
                  canEdit: false,
                  canCopy: true,
                  canDelete: false,
                  inherit: true
                }
              ]
            : []
      }),
    onSuccess: (user) => {
      toast({
        variant: 'success',
        title: 'User invited',
        description: `${user.username} can sign in with the temporary password.`
      })
      onCreated(user)
      onClose()
    },
    onError: (err: Error) => setError(err.message || 'Could not create this user.')
  })

  const canSubmit = username.trim().length > 0 && password.length >= 8 && !mutation.isPending

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault()
    if (!canSubmit) return
    setError(null)
    void mutation.mutateAsync()
  }

  return (
    <Modal open={open} onClose={onClose} size="md" title="Invite a user" titleSrOnly>
      <form onSubmit={handleSubmit}>
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-[var(--sv-radius)] bg-sv-accent/15 text-sv-accent ring-1 ring-inset ring-sv-accent/25">
            <UserPlus className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight text-sv-text" aria-hidden="true">
              Invite a user
            </h2>
            <p className="text-sm text-sv-text-muted">
              Creates an account they sign in with straight away.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="block text-sm font-medium text-sv-text">Name / username</span>
              <Input
                autoFocus
                value={username}
                autoComplete="off"
                placeholder="e.g. priya"
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label className="space-y-1.5">
              <span className="block text-sm font-medium text-sv-text">Temporary password</span>
              <Input
                type="password"
                value={password}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </div>

          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-sv-text">Role</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: false, label: 'Member', hint: 'Only granted folders' },
                { value: true, label: 'Admin', hint: 'Every folder + people' }
              ].map((option) => {
                const active = isAdmin === option.value
                return (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => setIsAdmin(option.value)}
                    className={cn(
                      'min-h-11 rounded-[var(--sv-radius)] border px-3 py-2.5 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-sv-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sv-surface motion-reduce:transition-none',
                      active
                        ? 'border-sv-accent bg-sv-accent/10'
                        : 'border-sv-border hover:border-sv-border-2 hover:bg-sv-surface-2'
                    )}
                  >
                    <span className="block text-sm font-medium text-sv-text">{option.label}</span>
                    <span className="block text-xs text-sv-text-muted">{option.hint}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <label className={cn('space-y-1.5 transition-opacity', isAdmin && 'opacity-50')}>
            <span className="block text-sm font-medium text-sv-text">Primary department</span>
            <select
              value={department}
              disabled={isAdmin}
              onChange={(e) => setDepartment(e.target.value)}
              className="h-11 w-full rounded-md border border-sv-border bg-sv-bg px-3 text-sm text-sv-text outline-none transition focus-visible:border-sv-accent focus-visible:ring-2 focus-visible:ring-sv-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sv-surface disabled:cursor-not-allowed motion-reduce:transition-none sm:h-9"
            >
              <option value="">No department yet</option>
              {modules.map((mod) => (
                <option key={mod.folderId} value={mod.folderId}>
                  {mod.name}
                </option>
              ))}
            </select>
            <span className="block text-xs text-sv-text-muted">
              {isAdmin
                ? 'Admins can open every module — no department needed.'
                : 'Grants read access to this module. Fine-tune rights in the matrix afterwards.'}
            </span>
          </label>
        </div>

        {error ? <p className="mt-4 text-sm text-sv-danger">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {mutation.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}
            Invite user
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default InviteUserModal
