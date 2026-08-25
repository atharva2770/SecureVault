import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Menu, Search, Shield } from 'lucide-react'

import { useAuth } from '@/auth/AuthProvider'
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
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState(params.get('q') ?? '')
  const showSearch = location.pathname === '/'

  useEffect(() => {
    setQuery(params.get('q') ?? '')
  }, [params])

  function submitSearch(event: React.FormEvent): void {
    event.preventDefault()
    const next = new URLSearchParams(params)
    const trimmed = query.trim()
    if (trimmed) next.set('q', trimmed)
    else next.delete('q')
    navigate({ pathname: '/', search: next.toString() ? `?${next}` : '' })
  }

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
            SecureVault
          </span>
        </Link>
      </div>

      <div className="flex min-w-0 flex-1 justify-center">
        {showSearch ? (
          <form onSubmit={submitSearch} className="flex w-full max-w-xl items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  if (location.pathname === '/') {
                    const next = new URLSearchParams(params)
                    if (e.target.value) next.set('q', e.target.value)
                    else next.delete('q')
                    setParams(next, { replace: true })
                  }
                }}
                placeholder="Search files in your vault"
                className="h-10 w-full rounded-full border border-sv-border bg-sv-bg py-0 pr-4 pl-4 text-sm text-sv-text outline-none placeholder:text-sv-text-muted focus:border-sv-accent"
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              size="icon"
              className="size-10 shrink-0 rounded-full"
              aria-label="Search"
            >
              <Search className="size-4" />
            </Button>
          </form>
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
