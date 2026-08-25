import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, Shield } from 'lucide-react'

import { useAuth } from '@/auth/AuthProvider'
import { GlobalSearch } from '@/components/GlobalSearch'
import { ThemeToggle } from '@/components/ThemeToggle'
import { UserAvatar } from '@/components/UserAvatar'
import { Button } from '@/components/ui/button'
import ProfileMenu from '@/layout/ProfileMenu'
import { cn } from '@/lib/utils'

interface AppHeaderProps {
  onOpenSidebar?: () => void
}

export default function AppHeader({ onOpenSidebar }: AppHeaderProps): React.JSX.Element {
  const { user } = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const showSearch = location.pathname === '/'

  return (
    <header className="relative z-40 flex h-[var(--sv-header-height)] shrink-0 items-center gap-2 border-b border-sv-border bg-sv-surface px-2 sm:gap-3 sm:px-3">
      <div className="flex min-w-0 items-center gap-1 sm:gap-2">
        {onOpenSidebar ? (
          <Button
            size="icon"
            variant="ghost"
            className="size-10 md:hidden"
            onClick={onOpenSidebar}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </Button>
        ) : null}
        <Link
          to="/"
          className="flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-sv-surface-raised"
        >
          <Shield className="size-6 shrink-0 text-sv-accent" />
          <span className="truncate text-base font-semibold tracking-tight text-sv-text">
            DOCMAN
          </span>
        </Link>
      </div>

      <div className="flex min-w-0 flex-1 justify-center">
        {showSearch ? (
          <GlobalSearch />
        ) : (
          <div className="hidden h-10 max-w-xl flex-1 sm:block" />
        )}
      </div>

      <div className="relative flex items-center gap-1">
        <ThemeToggle />
        {user ? (
          <button
            type="button"
            className={cn(
              'rounded-full p-0.5 ring-offset-2 ring-offset-sv-surface transition hover:ring-2 hover:ring-sv-accent/60',
              menuOpen && 'ring-2 ring-sv-accent'
            )}
            aria-label="Account menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <UserAvatar username={user.username} size="sm" />
          </button>
        ) : null}

        <ProfileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      </div>
    </header>
  )
}
