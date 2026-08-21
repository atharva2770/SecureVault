import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Menu, Minus, Search, Shield, Square, X } from 'lucide-react'

import { useAuth } from '@/auth/AuthProvider'
import { UserAvatar } from '@/components/UserAvatar'
import { Button } from '@/components/ui/button'
import ProfileMenu from '@/layout/ProfileMenu'
import { cn } from '@/lib/utils'

interface AppHeaderProps {
  onOpenSidebar?: () => void
}

function hasElectronWindow(): boolean {
  return typeof window !== 'undefined' && typeof window.api?.window?.minimize === 'function'
}

export default function AppHeader({ onOpenSidebar }: AppHeaderProps): React.JSX.Element {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState(params.get('q') ?? '')
  const electron = hasElectronWindow()
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
    <header
      className={cn(
        'relative z-40 flex h-[var(--sv-header-height)] shrink-0 items-center gap-2 border-b border-sv-border bg-sv-surface px-2 sm:gap-3 sm:px-3',
        electron && 'titlebar-drag'
      )}
    >
      <div className="titlebar-no-drag flex min-w-0 items-center gap-1 sm:gap-2">
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

      <div className="titlebar-no-drag flex min-w-0 flex-1 justify-center">
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

      <div className="titlebar-no-drag relative flex items-center gap-1">
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

        {electron ? (
          <div className="ml-1 hidden items-center sm:flex">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => window.api?.window?.minimize()}
              aria-label="Minimize"
            >
              <Minus className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => window.api?.window?.maximize()}
              aria-label="Maximize"
            >
              <Square className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 hover:bg-destructive hover:text-white"
              onClick={() => window.api?.window?.close()}
              aria-label="Close"
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </header>
  )
}
