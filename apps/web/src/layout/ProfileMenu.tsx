import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  HelpCircle,
  KeyRound,
  LogOut,
  Monitor,
  Palette,
  ShieldCheck,
  UserRound,
  Users
} from 'lucide-react'

import { useAuth } from '@/auth/AuthProvider'
import { UserAvatar } from '@/components/UserAvatar'
import { primaryRoleLabel } from '@/lib/roles'
import { cn } from '@/lib/utils'

interface ProfileMenuProps {
  open: boolean
  onClose: () => void
}

function MenuItem({
  to,
  icon,
  label,
  onClick,
  danger
}: {
  to?: string
  icon: React.ReactNode
  label: string
  onClick?: () => void
  danger?: boolean
}): React.JSX.Element {
  const className = cn(
    'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition',
    danger
      ? 'text-sv-danger hover:bg-sv-danger/10'
      : 'text-sv-text hover:bg-sv-surface-raised'
  )

  if (to) {
    return (
      <Link to={to} className={className} onClick={onClick}>
        <span className="text-sv-text-muted">{icon}</span>
        {label}
      </Link>
    )
  }

  return (
    <button type="button" className={className} onClick={onClick}>
      <span className="text-sv-text-muted">{icon}</span>
      {label}
    </button>
  )
}

export default function ProfileMenu({ open, onClose }: ProfileMenuProps): React.JSX.Element | null {
  const { user, canManageUsers, signOut } = useAuth()
  const navigate = useNavigate()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function onDocClick(event: MouseEvent): void {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open || !user) return null

  async function handleSignOut(): Promise<void> {
    onClose()
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div
      ref={panelRef}
      className="absolute top-[calc(100%+8px)] right-0 z-50 w-[320px] overflow-hidden rounded-xl border border-sv-border bg-sv-surface shadow-[0_16px_48px_rgb(0_0_0_/0.45)]"
      role="menu"
    >
      <div className="flex items-start gap-3 px-4 py-4">
        <UserAvatar username={user.username} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-sv-text">{user.username}</p>
          <p className="truncate text-xs text-sv-text-muted">@{user.username}</p>
          <p className="mt-0.5 text-[11px] uppercase tracking-wide text-sv-accent">
            {primaryRoleLabel(user)}
          </p>
          <Link
            to="/profile"
            onClick={onClose}
            className="mt-2 inline-block text-xs font-medium text-sv-accent hover:underline"
          >
            View your profile
          </Link>
        </div>
      </div>

      <div className="h-px bg-sv-border" />

      <div className="py-1">
        <MenuItem
          to="/profile"
          icon={<UserRound className="size-4" />}
          label="Your profile"
          onClick={onClose}
        />
        <MenuItem
          to="/account/password"
          icon={<KeyRound className="size-4" />}
          label="Change password"
          onClick={onClose}
        />
        <MenuItem
          to="/account/access"
          icon={<ShieldCheck className="size-4" />}
          label="My folder access"
          onClick={onClose}
        />
      </div>

      {canManageUsers ? (
        <>
          <div className="h-px bg-sv-border" />
          <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sv-text-muted">
            Administration
          </p>
          <div className="pb-1">
            {canManageUsers ? (
              <MenuItem
                to="/admin/users"
                icon={<Users className="size-4" />}
                label="People & folders"
                onClick={onClose}
              />
            ) : null}
          </div>
        </>
      ) : null}

      <div className="h-px bg-sv-border" />

      <div className="py-1">
        <MenuItem
          to="/settings"
          icon={<Palette className="size-4" />}
          label="Appearance"
          onClick={onClose}
        />
        <MenuItem
          to="/help"
          icon={<HelpCircle className="size-4" />}
          label="Help"
          onClick={onClose}
        />
        <MenuItem
          to="/settings"
          icon={<Monitor className="size-4" />}
          label="Settings"
          onClick={onClose}
        />
      </div>

      <div className="h-px bg-sv-border" />

      <div className="py-1">
        <MenuItem
          icon={<LogOut className="size-4" />}
          label="Sign out"
          danger
          onClick={() => {
            void handleSignOut()
          }}
        />
      </div>
    </div>
  )
}
