import { Link } from 'react-router-dom'
import { KeyRound, ShieldCheck } from 'lucide-react'

import { useAuth } from '@/auth/AuthProvider'
import { UserAvatar } from '@/components/UserAvatar'
import { Button } from '@/components/ui/button'
import PageShell from '@/layout/PageShell'
import { primaryRoleLabel } from '@/lib/roles'

export default function ProfilePage(): React.JSX.Element {
  const { user } = useAuth()
  if (!user) return <></>

  return (
    <PageShell title="Your profile" subtitle="Account identity and vault role. No cryptographic keys are stored in the browser.">
      <section className="rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <UserAvatar username={user.username} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-semibold text-sv-text">{user.username}</h2>
            <p className="text-sm text-sv-text-muted">@{user.username}</p>
            <p className="mt-2 inline-flex rounded-full bg-sv-accent/15 px-2.5 py-0.5 text-xs font-medium text-sv-accent">
              {primaryRoleLabel(user)}
            </p>
          </div>
        </div>

        <dl className="mt-6 grid gap-4 border-t border-sv-border pt-6 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-sv-text-muted">User ID</dt>
            <dd className="mt-1 break-all font-mono text-xs text-sv-text">{user.userId}</dd>
          </div>
          <div>
            <dt className="text-xs text-sv-text-muted">Roles</dt>
            <dd className="mt-1 text-sm text-sv-text">{user.roles.join(', ') || user.role}</dd>
          </div>
          <div>
            <dt className="text-xs text-sv-text-muted">Member since</dt>
            <dd className="mt-1 text-sm text-sv-text">
              {new Date(user.createdAt).toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-sv-text-muted">Last login</dt>
            <dd className="mt-1 text-sm text-sv-text">
              {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'This session'}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/account/password">
              <KeyRound className="size-4" />
              Change password
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/account/access">
              <ShieldCheck className="size-4" />
              My folder access
            </Link>
          </Button>
        </div>
      </section>
    </PageShell>
  )
}
