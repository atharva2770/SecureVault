import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, Search, Shield, X } from 'lucide-react'

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
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const searchPanelRef = useRef<HTMLDivElement>(null)
  const showSearch = location.pathname === '/'

  useEffect(() => {
    setMobileSearchOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!mobileSearchOpen) return
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') setMobileSearchOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileSearchOpen])

  return (
    <header className="relative z-40 shrink-0 border-b border-sv-border bg-sv-surface">
      <div className="flex h-[var(--sv-header-height)] items-center gap-2 px-2 sm:gap-3 sm:px-3">
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          {onOpenSidebar ? (
            <Button
              size="icon"
              variant="ghost"
              className="size-11 md:hidden"
              onClick={onOpenSidebar}
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </Button>
          ) : null}
          <Link
            to="/"
            className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 outline-none hover:bg-sv-surface-raised focus-visible:ring-2 focus-visible:ring-sv-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sv-surface"
          >
            <Shield className="size-6 shrink-0 text-sv-accent" />
            <span className="truncate text-base font-semibold tracking-tight text-sv-text">
              DOCMAN
            </span>
          </Link>
        </div>

        <div className="hidden min-w-0 flex-1 justify-center sm:flex">
          {showSearch ? <GlobalSearch /> : <div className="h-10 max-w-xl flex-1" />}
        </div>

        <div className="relative ml-auto flex items-center gap-1">
          {showSearch ? (
            <Button
              size="icon"
              variant="ghost"
              className="sm:hidden"
              aria-label={mobileSearchOpen ? 'Close search' : 'Open search'}
              aria-expanded={mobileSearchOpen}
              aria-controls="mobile-search-panel"
              onClick={() => setMobileSearchOpen((open) => !open)}
            >
              {mobileSearchOpen ? <X className="size-5" /> : <Search className="size-5" />}
            </Button>
          ) : null}
          <ThemeToggle />
          {user ? (
            <button
              type="button"
              className={cn(
                'flex size-11 items-center justify-center rounded-full p-0.5 outline-none ring-offset-2 ring-offset-sv-surface transition hover:ring-2 hover:ring-sv-accent focus-visible:ring-2 focus-visible:ring-sv-accent motion-reduce:transition-none',
                menuOpen && 'ring-2 ring-sv-accent'
              )}
              aria-label="Account menu"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <UserAvatar username={user.username} size="sm" />
            </button>
          ) : null}

          <ProfileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
        </div>
      </div>

      {showSearch && mobileSearchOpen ? (
        <div
          id="mobile-search-panel"
          ref={searchPanelRef}
          className="border-t border-sv-border bg-sv-surface px-3 py-3 sm:hidden"
        >
          <GlobalSearch autoFocus />
        </div>
      ) : null}
    </header>
  )
}
