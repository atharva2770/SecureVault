import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ScrollText } from 'lucide-react'

import type { AuditLogDto } from '@securevault/domain'
import { api } from '@/api/vault'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { TableRowSkeleton } from '@/components/ui/skeleton'
import PageShell from '@/layout/PageShell'
import { cn } from '@/lib/utils'
import { AdminTabs } from './AdminTabs'

const PAGE_SIZE = 25

const ACTION_FILTERS = [
  { id: '', label: 'All' },
  { id: 'VIEW', label: 'View' },
  { id: 'SEARCH', label: 'Search' },
  { id: 'RETRIEVE', label: 'Open' },
  { id: 'DOWNLOAD', label: 'Download' },
  { id: 'RIGHTS_CHANGE', label: 'Rights' },
  { id: 'AUTH_DENY', label: 'Denied' }
] as const

const selectClass =
  'flex h-11 w-full rounded-md border border-sv-border bg-sv-bg px-3 py-1 text-sm text-sv-text shadow-sm outline-none transition duration-fast ease-sv focus-visible:border-sv-accent focus-visible:ring-2 focus-visible:ring-sv-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sv-surface motion-reduce:transition-none sm:h-9'

function actionLabel(action: string): string {
  switch (action) {
    case 'VIEW':
      return 'View'
    case 'SEARCH':
      return 'Search'
    case 'RETRIEVE':
    case 'FILE_OPEN':
      return 'Open'
    case 'DOWNLOAD':
      return 'Download'
    case 'RIGHTS_CHANGE':
    case 'ACL_GRANT':
      return 'Rights'
    case 'AUTH_DENY':
    case 'ACL_DENY':
      return 'Denied'
    case 'LOGIN':
      return 'Sign in'
    case 'UNLOCK':
      return 'Unlock'
    case 'FILE_ADD':
      return 'Upload'
    case 'FILE_DELETE':
      return 'Delete'
    case 'PASSWORD_CHANGE':
      return 'Password'
    default:
      return action
  }
}

function actionVariant(
  action: string
): 'neutral' | 'accent' | 'success' | 'danger' | 'warning' | 'outline' {
  if (action === 'AUTH_DENY' || action === 'ACL_DENY') return 'danger'
  if (action === 'RIGHTS_CHANGE' || action === 'ACL_GRANT') return 'warning'
  if (action === 'DOWNLOAD') return 'accent'
  if (action === 'RETRIEVE' || action === 'FILE_OPEN') return 'success'
  return 'neutral'
}

function formatUtc(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return (
    date.toLocaleString('en-GB', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }) + ' UTC'
  )
}

function resourceLabel(row: AuditLogDto): string {
  if (row.fileName) return row.fileName
  if (row.moduleName) return row.moduleName
  if (row.details) return row.details
  if (row.folderId) return row.folderId
  return '—'
}

function dayBounds(fromDate: string, toDate: string): { from?: string; to?: string } {
  const from = fromDate.trim() ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined
  const to = toDate.trim() ? new Date(`${toDate}T23:59:59.999`).toISOString() : undefined
  return { from, to }
}

export default function AccessLogPage(): React.JSX.Element {
  const [userId, setUserId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [action, setAction] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [cursor, setCursor] = useState<string | undefined>()
  const [prevCursors, setPrevCursors] = useState<Array<string | undefined>>([])

  const usersQuery = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.admin.listUsers(),
    staleTime: 15_000
  })
  const foldersQuery = useQuery({
    queryKey: ['admin', 'acl-folders'],
    queryFn: () => api.admin.listAclFolders(),
    staleTime: 60_000
  })

  const modules = useMemo(
    () =>
      (foldersQuery.data ?? [])
        .filter((f) => f.isCategoryRoot && f.categoryId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [foldersQuery.data]
  )

  const logsQuery = useQuery({
    queryKey: ['admin', 'audit-logs', userId, categoryId, action, fromDate, toDate, cursor],
    queryFn: () => {
      const { from, to } = dayBounds(fromDate, toDate)
      return api.admin.listAuditLogs({
        userId: userId || undefined,
        categoryId: categoryId || undefined,
        action: action || undefined,
        from,
        to,
        cursor,
        limit: PAGE_SIZE
      })
    }
  })

  const items = logsQuery.data?.items ?? []
  const nextCursor = logsQuery.data?.nextCursor ?? null
  const hasFilters = Boolean(userId || categoryId || action || fromDate || toDate)

  function resetPaging(): void {
    setCursor(undefined)
    setPrevCursors([])
  }

  return (
    <PageShell
      wide
      title="Users & rights"
      subtitle="Manage people, roles, and which modules each person can open."
    >
      <AdminTabs />

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block min-w-40 flex-1 sm:max-w-xs">
            <span className="mb-1 block text-xs font-medium text-sv-text-muted">Person</span>
            <select
              className={selectClass}
              value={userId}
              aria-label="Filter by person"
              onChange={(e) => {
                setUserId(e.target.value)
                resetPaging()
              }}
            >
              <option value="">Everyone</option>
              {(usersQuery.data ?? []).map((user) => (
                <option key={user.userId} value={user.userId}>
                  {user.username}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-40 flex-1 sm:max-w-xs">
            <span className="mb-1 block text-xs font-medium text-sv-text-muted">Module</span>
            <select
              className={selectClass}
              value={categoryId}
              aria-label="Filter by module"
              onChange={(e) => {
                setCategoryId(e.target.value)
                resetPaging()
              }}
            >
              <option value="">All modules</option>
              {modules.map((mod) => (
                <option key={mod.categoryId} value={mod.categoryId ?? ''}>
                  {mod.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:w-40">
            <span className="mb-1 block text-xs font-medium text-sv-text-muted">From</span>
            <Input
              type="date"
              value={fromDate}
              aria-label="From date"
              onChange={(e) => {
                setFromDate(e.target.value)
                resetPaging()
              }}
            />
          </label>
          <label className="block sm:w-40">
            <span className="mb-1 block text-xs font-medium text-sv-text-muted">To</span>
            <Input
              type="date"
              value={toDate}
              aria-label="To date"
              onChange={(e) => {
                setToDate(e.target.value)
                resetPaging()
              }}
            />
          </label>
        </div>

        <div role="group" aria-label="Filter by action" className="flex flex-wrap gap-1">
          {ACTION_FILTERS.map((chip) => (
            <button
              key={chip.id || 'all'}
              type="button"
              onClick={() => {
                setAction(chip.id)
                resetPaging()
              }}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium outline-none transition duration-fast ease-sv focus-visible:ring-2 focus-visible:ring-sv-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sv-bg',
                action === chip.id
                  ? 'border-sv-accent/40 bg-sv-accent/15 text-sv-accent'
                  : 'border-sv-border bg-sv-surface-2 text-sv-text-muted hover:text-sv-text'
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead className="bg-sv-surface-2 text-xs uppercase tracking-wide text-sv-text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">When (UTC)</th>
              <th className="px-4 py-2.5 font-medium">Who</th>
              <th className="px-4 py-2.5 font-medium">Action</th>
              <th className="px-4 py-2.5 font-medium">Resource</th>
              <th className="hidden px-4 py-2.5 font-medium lg:table-cell">From</th>
            </tr>
          </thead>
          <tbody>
            {logsQuery.isPending ? (
              Array.from({ length: 8 }).map((_, i) => <TableRowSkeleton key={i} columns={5} />)
            ) : logsQuery.isError ? (
              <tr>
                <td colSpan={5}>
                  <ErrorState
                    className="py-12"
                    title="Access log didn’t load"
                    description={
                      logsQuery.error instanceof Error
                        ? logsQuery.error.message
                        : 'Couldn’t fetch the audit trail. Try again in a moment.'
                    }
                    onRetry={() => void logsQuery.refetch()}
                  />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    className="py-12"
                    icon={ScrollText}
                    title={hasFilters ? 'No events match these filters' : 'No access events yet'}
                    description={
                      hasFilters
                        ? 'Widen the date range or clear a person, module, or action filter.'
                        : 'Views, searches, downloads, rights changes, and denied attempts will appear here.'
                    }
                  />
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr
                  key={row.logId}
                  className="border-t border-sv-border transition-colors duration-fast ease-sv hover:bg-sv-surface-2/60"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-sv-text-muted">
                    {formatUtc(row.timestamp)}
                  </td>
                  <td className="px-4 py-3 font-medium text-sv-text">
                    {row.username ?? (row.userId ? row.userId.slice(0, 8) : '—')}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={actionVariant(row.action)} size="sm">
                      {actionLabel(row.action)}
                    </Badge>
                  </td>
                  <td className="max-w-[18rem] truncate px-4 py-3 text-sv-text" title={resourceLabel(row)}>
                    {resourceLabel(row)}
                  </td>
                  <td
                    className="hidden max-w-[16rem] truncate px-4 py-3 text-xs text-sv-text-muted lg:table-cell"
                    title={[row.ip, row.userAgent].filter(Boolean).join(' · ') || undefined}
                  >
                    {row.ip || '—'}
                    {row.userAgent ? (
                      <span className="mt-0.5 block truncate text-[11px] text-sv-text-faint">
                        {row.userAgent}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {items.length > 0 || cursor ? (
        <div className="mt-3 flex items-center justify-between text-sm text-sv-text-muted">
          <span>
            {items.length} event{items.length === 1 ? '' : 's'}
            {cursor ? ' · later pages' : ''}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={!cursor || logsQuery.isFetching}
              onClick={() => {
                const prev = prevCursors[prevCursors.length - 1]
                setPrevCursors((stack) => stack.slice(0, -1))
                setCursor(prev)
              }}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!nextCursor || logsQuery.isFetching}
              onClick={() => {
                if (!nextCursor) return
                setPrevCursors((stack) => [...stack, cursor])
                setCursor(nextCursor)
              }}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </PageShell>
  )
}
