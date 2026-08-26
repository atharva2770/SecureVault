import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'

import { useAuth } from '@/auth/AuthProvider'
import { BrandMark } from '@/components/BrandMark'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import ProfileMenu from '@/layout/ProfileMenu'
import { primaryRoleLabel, userInitials } from '@/lib/roles'
import { cn } from '@/lib/utils'

export default function AppHeader(): React.JSX.Element {
  const { user, canManageUsers, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const modulesActive =
    location.pathname === '/' || location.pathname.startsWith('/m/')
  const adminActive = location.pathname.startsWith('/admin')

  async function handleSignOut(): Promise<void> {
    setMenuOpen(false)
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-40 shrink-0 glass-panel border-x-0 border-t-0">
      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-6">
          <BrandMark to="/" />
          <nav className="hidden items-center gap-1 md:flex">
            <NavLink
              to="/"
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm text-sv-text-muted transition-colors hover:bg-secondary hover:text-sv-text',
                modulesActive && 'bg-secondary text-sv-text'
              )}
            >
              Modules
            </NavLink>
            {canManageUsers ? (
              <NavLink
                to="/admin/users"
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm text-sv-text-muted transition-colors hover:bg-secondary hover:text-sv-text',
                  adminActive && 'bg-secondary text-sv-text'
                )}
              >
                Administration
              </NavLink>
            ) : null}
          </nav>
        </div>

        <div className="relative flex shrink-0 items-center gap-3">
          {user ? (
            <div className="hidden text-right sm:block">
              <p className="truncate text-sm font-semibold">{user.username}</p>
              <p className="text-xs uppercase tracking-wider text-sv-text-muted">
                {primaryRoleLabel(user)}
              </p>
            </div>
          ) : null}
          {user ? (
            <button
              type="button"
              className={cn(
                'grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-brand text-sm font-bold text-sv-bg outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-sv-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sv-surface',
                menuOpen && 'ring-2 ring-sv-accent ring-offset-2 ring-offset-sv-surface'
              )}
              aria-label="Account menu"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {userInitials(user.username)}
            </button>
          ) : null}
          <ThemeToggle className="size-9 sm:size-9" />
          <Button
            variant="ghost"
            size="icon"
            className="size-9 max-sm:size-9"
            aria-label="Sign out"
            onClick={() => {
              void handleSignOut()
            }}
          >
            <LogOut className="h-4 w-4" />
          </Button>
          <ProfileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
        </div>
      </div>
    </header>
  )
}
