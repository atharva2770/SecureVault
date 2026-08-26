import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { File as FileIcon, Folder, Layers, Search, X } from 'lucide-react'

import { useDebouncedCallback } from '@/hooks/useDebouncedCallback'
import { MAX_SEARCH_QUERY_LENGTH, searchVault, totalResults } from '@/lib/search'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { SearchRowSkeleton } from '@/components/ui/skeleton'

const MIN_CHARS = 2
const PER_SECTION = 5

export function GlobalSearch({ autoFocus = false }: { autoFocus?: boolean }): React.JSX.Element {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)

  const [text, setText] = useState(params.get('q') ?? '')
  const [term, setTerm] = useState(text.trim())
  const [open, setOpen] = useState(false)

  // Debounced: push the query into the URL (drives the in-page results) and the
  // dropdown query term together.
  const commit = useDebouncedCallback((value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set('q', value)
    else next.delete('q')
    setParams(next, { replace: true })
    setTerm(value.trim())
  }, 250)

  function onChange(value: string): void {
    const next = value.slice(0, MAX_SEARCH_QUERY_LENGTH)
    setText(next)
    setOpen(next.trim().length >= MIN_CHARS)
    commit(next)
  }

  function clear(): void {
    setText('')
    setTerm('')
    setOpen(false)
    const next = new URLSearchParams(params)
    next.delete('q')
    setParams(next, { replace: true })
  }

  // Close on outside click.
  useEffect(() => {
    function onDown(e: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const query = useQuery({
    queryKey: ['global-search', term],
    queryFn: () => searchVault(term),
    enabled: term.length >= MIN_CHARS,
    staleTime: 10_000
  })

  const results = query.data
  const showDropdown = open && text.trim().length >= MIN_CHARS
  const isEmpty = query.isSuccess && totalResults(results) === 0

  function choose(value: string): void {
    setText(value)
    setTerm(value.trim())
    setOpen(false)
    const next = new URLSearchParams(params)
    next.set('q', value)
    setParams(next, { replace: true })
    navigate({ pathname: '/', search: `?q=${encodeURIComponent(value)}` })
  }

  return (
    <div ref={rootRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-sv-text-faint" />
        <input
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(text.trim().length >= MIN_CHARS)}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="global-search-results"
          aria-label="Search files, folders and modules"
          placeholder="Search files, folders and modules"
          className="h-11 w-full rounded-full border border-sv-border bg-sv-bg py-0 pr-11 pl-10 text-sm text-sv-text outline-none transition placeholder:text-sv-text-faint focus:border-sv-accent focus:ring-2 focus:ring-sv-accent focus:ring-offset-2 focus:ring-offset-sv-surface motion-reduce:transition-none sm:h-10"
        />
        {text ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="absolute top-1/2 right-2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-sv-text-muted outline-none transition hover:bg-sv-surface-2 hover:text-sv-text focus-visible:ring-2 focus-visible:ring-sv-accent motion-reduce:transition-none sm:size-8"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {showDropdown ? (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute top-[calc(100%+0.5rem)] left-0 z-50 max-h-[70vh] w-full overflow-y-auto rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface shadow-modal"
        >
          {query.isLoading ? (
            <div aria-busy="true" aria-label="Searching" className="py-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <SearchRowSkeleton key={i} />
              ))}
            </div>
          ) : query.isError ? (
            <ErrorState
              className="py-8"
              title="Search didn’t finish"
              description={(query.error as Error).message || 'Couldn’t look through the vault. Try again.'}
              onRetry={() => void query.refetch()}
            />
          ) : isEmpty ? (
            <EmptyState
              className="py-8"
              icon={Search}
              title="No matches"
              description={`Nothing in the vault is named like “${term}”.`}
            />
          ) : results ? (
            <div className="py-1.5">
              <ResultSection title="Modules" icon={Layers}>
                {results.modules.slice(0, PER_SECTION).map((m) => (
                  <ResultRow key={m.folderId} label={m.name} onSelect={() => choose(m.name)} />
                ))}
              </ResultSection>
              <ResultSection title="Folders" icon={Folder}>
                {results.folders.slice(0, PER_SECTION).map((f) => (
                  <ResultRow key={f.folderId} label={f.name} onSelect={() => choose(f.name)} />
                ))}
              </ResultSection>
              <ResultSection title="Files" icon={FileIcon}>
                {results.files.slice(0, PER_SECTION).map((file) => (
                  <ResultRow
                    key={file.fileId}
                    label={file.displayName}
                    hint={file.categoryName ?? undefined}
                    mono
                    onSelect={() => choose(file.displayName)}
                  />
                ))}
              </ResultSection>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function ResultSection({
  title,
  icon: Icon,
  children
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}): React.JSX.Element | null {
  const items = Array.isArray(children) ? children.filter(Boolean) : children
  if (Array.isArray(items) && items.length === 0) return null
  return (
    <div className="px-1.5 py-1">
      <p className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-sv-text-faint">
        <Icon className="size-3" />
        {title}
      </p>
      {children}
    </div>
  )
}

function ResultRow({
  label,
  hint,
  mono,
  onSelect
}: {
  label: string
  hint?: string
  mono?: boolean
  onSelect: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="option"
      aria-selected={false}
      onClick={onSelect}
      className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2.5 text-left outline-none transition hover:bg-sv-surface-2 focus-visible:ring-2 focus-visible:ring-sv-accent focus-visible:ring-inset motion-reduce:transition-none max-sm:min-h-11"
    >
      <span className={cn('min-w-0 flex-1 truncate text-sm text-sv-text', mono && 'font-mono')}>
        {label}
      </span>
      {hint ? <span className="shrink-0 text-xs text-sv-text-faint">{hint}</span> : null}
    </button>
  )
}

export default GlobalSearch
