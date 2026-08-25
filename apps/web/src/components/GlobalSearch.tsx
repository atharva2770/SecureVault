import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { File as FileIcon, Folder, Layers, Loader2, Search, X } from 'lucide-react'

import { useDebouncedCallback } from '@/hooks/useDebouncedCallback'
import { searchVault, totalResults } from '@/lib/search'
import { cn } from '@/lib/utils'

const MIN_CHARS = 2
const PER_SECTION = 5

export function GlobalSearch(): React.JSX.Element {
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
    setText(value)
    setOpen(value.trim().length >= MIN_CHARS)
    commit(value)
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
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="global-search-results"
          placeholder="Search files, folders and modules"
          className="h-10 w-full rounded-full border border-sv-border bg-sv-bg py-0 pr-10 pl-10 text-sm text-sv-text outline-none transition placeholder:text-sv-text-faint focus:border-sv-accent focus:ring-2 focus:ring-sv-accent/40 motion-reduce:transition-none"
        />
        {text ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="absolute top-1/2 right-3 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-sv-text-muted transition hover:bg-sv-surface-2 hover:text-sv-text motion-reduce:transition-none"
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
            <div className="flex items-center justify-center gap-2 p-6 text-sm text-sv-text-muted">
              <Loader2 className="size-4 animate-spin" />
              Searching…
            </div>
          ) : query.isError ? (
            <div className="p-6 text-sm text-sv-danger">
              {(query.error as Error).message || 'Search failed.'}
            </div>
          ) : isEmpty ? (
            <div className="p-6 text-center">
              <p className="text-sm font-medium text-sv-text">No matches</p>
              <p className="mt-1 text-xs text-sv-text-muted">
                Nothing found for “{term}”.
              </p>
            </div>
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
      className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left transition hover:bg-sv-surface-2 motion-reduce:transition-none"
    >
      <span className={cn('min-w-0 flex-1 truncate text-sm text-sv-text', mono && 'font-mono')}>
        {label}
      </span>
      {hint ? <span className="shrink-0 text-xs text-sv-text-faint">{hint}</span> : null}
    </button>
  )
}

export default GlobalSearch
