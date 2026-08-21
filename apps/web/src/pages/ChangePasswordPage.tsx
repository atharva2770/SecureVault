import { useState } from 'react'
import { Loader2 } from 'lucide-react'

import { api } from '@/api/vault'
import { Button } from '@/components/ui/button'
import PageShell from '@/layout/PageShell'

export default function ChangePasswordPage(): React.JSX.Element {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setStatus(null)
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirm) {
      setError('New password and confirmation do not match.')
      return
    }
    setPending(true)
    try {
      await api.auth.changePassword({ currentPassword, newPassword })
      setStatus('Password updated. Use the new password next time you sign in.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirm('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password.')
    } finally {
      setPending(false)
    }
  }

  return (
    <PageShell
      title="Change password"
      subtitle="This updates your vault sign-in password. Per-file access passwords are unchanged."
    >
      <form
        onSubmit={(e) => void submit(e)}
        className="max-w-md space-y-4 rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface p-5"
      >
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-sv-text-muted">Current password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="h-10 w-full rounded-lg border border-sv-border bg-sv-bg px-3 text-sm text-sv-text outline-none focus:border-sv-accent"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-sv-text-muted">New password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            className="h-10 w-full rounded-lg border border-sv-border bg-sv-bg px-3 text-sm text-sv-text outline-none focus:border-sv-accent"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-sv-text-muted">Confirm new password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className="h-10 w-full rounded-lg border border-sv-border bg-sv-bg px-3 text-sm text-sv-text outline-none focus:border-sv-accent"
          />
        </label>
        {error ? <p className="text-sm text-sv-danger">{error}</p> : null}
        {status ? <p className="text-sm text-sv-success">{status}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Update password
        </Button>
      </form>
    </PageShell>
  )
}
