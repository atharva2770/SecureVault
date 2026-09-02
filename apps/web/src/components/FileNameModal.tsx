import { useEffect, useRef, useState } from 'react'
import {
  ChevronRight,
  Eye,
  FileText,
  Loader2,
  ScanSearch,
  SearchX
} from 'lucide-react'

import type { FileDto, FolderDto } from '@securevault/domain'
import { api, type OpenedFileView } from '@/api/vault'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import SecureFileViewer from '@/components/SecureFileViewer'
import type { ModuleTheme } from '@/theme/modules'

type Phase = 'input' | 'scanning' | 'success' | 'notfound'

/** Minimum time the scanning bar stays up so the verify feels deliberate. */
const SCAN_MIN_MS = 1100

interface FileNameModalProps {
  open: boolean
  onClose: () => void
  folder: FolderDto | null
  moduleName: string
  theme: ModuleTheme
  /** Admin: skip retrieve and start a bulk ingest session in this folder. */
  onManageFiles?: () => void
  /** True when this module's policy demands a per-file password to open. */
  requiresFilePassword?: boolean
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatBytes(raw: string): string {
  const bytes = Number(raw)
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** i
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/*
  Name-verified retrieval. The user names the document they want and we match it
  against the real listing endpoint, so the folder's contents are never browsed
  wholesale. The name is a lookup key, not a credential: access is decided by the
  folder ACL, and only modules whose category opts in additionally ask for a
  per-file password before View streams through the decrypt endpoint.
*/
export function FileNameModal({
  open,
  requiresFilePassword = false,
  onClose,
  folder,
  moduleName,
  theme,
  onManageFiles
}: FileNameModalProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('input')
  const [name, setName] = useState('')
  const [match, setMatch] = useState<FileDto | null>(null)
  const [action, setAction] = useState<'view' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [filePassword, setFilePassword] = useState('')
  const [viewer, setViewer] = useState<OpenedFileView | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const reqId = useRef(0)

  useEffect(() => {
    if (!open) return
    setPhase('input')
    setName('')
    setMatch(null)
    setAction(null)
    setActionError(null)
    setViewer(null)
    reqId.current += 1
  }, [open, folder])

  const accentVars = { '--fm-accent': theme.colorVar } as React.CSSProperties
  const submitting = phase === 'scanning'
  const trimmed = name.trim()

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (!folder || !trimmed || submitting) return
    const id = ++reqId.current
    setPhase('scanning')
    setActionError(null)
    try {
      const [files] = await Promise.all([
        api.files.listFiles({ folderId: folder.folderId }),
        sleep(SCAN_MIN_MS)
      ])
      if (id !== reqId.current) return
      const hit =
        files.find((f) => f.displayName.trim().toLowerCase() === trimmed.toLowerCase()) ?? null
      if (hit) {
        setMatch(hit)
        setPhase('success')
      } else {
        setPhase('notfound')
      }
    } catch {
      if (id !== reqId.current) return
      setPhase('notfound')
    }
  }

  function retry(): void {
    setPhase('input')
    setMatch(null)
    setActionError(null)
    setFilePassword('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  async function runView(): Promise<void> {
    if (!match || action) return
    setAction('view')
    setActionError(null)
    try {
      const opened = await api.files.openFile({
        fileId: match.fileId,
        password: requiresFilePassword ? filePassword : null
      })
      setViewer(opened)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not open this file.')
    } finally {
      setAction(null)
    }
  }

  return (
    <>
    <Modal open={open} onClose={onClose} size="md" title="Retrieve a file" titleSrOnly>
      <div style={accentVars}>
        {/* Themed icon + breadcrumb */}
        <div className="flex items-center gap-3">
          <div
            className="flex size-11 shrink-0 items-center justify-center rounded-[var(--sv-radius)] ring-1 ring-inset ring-sv-border"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--fm-accent) 16%, transparent)',
              color: 'var(--fm-accent)'
            }}
          >
            <ScanSearch className="size-5" />
          </div>
          <div className="min-w-0">
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1 text-xs text-sv-text-muted"
            >
              <span className="truncate">{moduleName}</span>
              <ChevronRight className="size-3 shrink-0" />
              <span
                className="truncate font-medium"
                style={{ color: 'var(--fm-accent)' }}
              >
                {folder?.name ?? 'Folder'}
              </span>
            </nav>
            <h2 className="mt-0.5 text-base font-semibold tracking-tight text-sv-text" aria-hidden="true">
              Retrieve a file
            </h2>
          </div>
        </div>

        {phase === 'input' || phase === 'scanning' ? (
          <form onSubmit={handleSubmit} className="mt-5">
            <label htmlFor="fm-name" className="mb-1.5 block text-sm font-medium text-sv-text">
              File name
            </label>
            <Input
              id="fm-name"
              ref={inputRef}
              autoFocus
              value={name}
              disabled={submitting}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter the exact file name"
            />
            <p className="mt-1.5 text-xs text-sv-text-muted">
              Type the document name exactly as it was filed to retrieve it.
            </p>

            {/* Scanning progress: a moving gradient bar */}
            <div
              className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-sv-surface-2"
              role="progressbar"
              aria-hidden={!submitting}
              aria-label={submitting ? 'Verifying file name' : undefined}
            >
              {submitting ? (
                <div
                  className="h-full w-1/3 rounded-full animate-[sv-scan_1.1s_ease-in-out_infinite] motion-reduce:animate-none motion-reduce:w-full"
                  style={{
                    background:
                      'linear-gradient(90deg, transparent, var(--fm-accent), transparent)'
                  }}
                />
              ) : null}
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              {onManageFiles ? (
                <Button type="button" variant="outline" onClick={onManageFiles} disabled={submitting}>
                  No fetch, upload
                </Button>
              ) : (
                <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
                  Cancel
                </Button>
              )}
              <Button type="submit" disabled={!trimmed || submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Verifying…
                  </>
                ) : (
                  'Submit'
                )}
              </Button>
            </div>
          </form>
        ) : null}

        {phase === 'success' && match ? (
          <div className="mt-5">
            <Card variant="paper" className="ring-1 ring-black/5">
              <div className="flex items-start gap-3 p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-[calc(var(--sv-radius)-2px)] bg-sv-paper-2 text-sv-paper-text-dim">
                  <FileText className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm font-medium text-sv-paper-text">
                    {match.displayName}
                  </p>
                  <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-sv-paper-text-dim">
                    <div className="flex gap-1">
                      <dt>Size</dt>
                      <dd className="font-mono">{formatBytes(match.sizeBytes)}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>Modified</dt>
                      <dd className="font-mono">{formatDate(match.updatedAt)}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </Card>

            {requiresFilePassword ? (
              <label className="mt-3 block space-y-1.5">
                <span className="text-xs font-medium text-sv-text-muted">File password</span>
                <Input
                  type="password"
                  value={filePassword}
                  onChange={(e) => {
                    setFilePassword(e.target.value)
                    setActionError(null)
                  }}
                  autoComplete="off"
                  placeholder="Set when this document was filed"
                  error={Boolean(actionError)}
                />
                <span className="block text-xs text-sv-text-muted">
                  This module requires a password to open its documents.
                </span>
              </label>
            ) : null}

            {actionError ? (
              <p className="mt-3 text-xs text-sv-danger">{actionError}</p>
            ) : null}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="ghost" onClick={retry}>
                Retrieve another
              </Button>
              <Button
                type="button"
                disabled={action !== null || (requiresFilePassword && !filePassword)}
                onClick={() => void runView()}
              >
                {action === 'view' ? <Loader2 className="animate-spin" /> : <Eye />}
                View
              </Button>
            </div>
          </div>
        ) : null}

        {phase === 'notfound' ? (
          <div className="mt-5">
            <div
              role="status"
              className="flex items-start gap-3 rounded-[var(--sv-radius)] border border-sv-danger/30 bg-sv-danger/10 p-4"
            >
              <SearchX className="mt-0.5 size-5 shrink-0 text-sv-danger" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-sv-text">No matching file</p>
                <p className="mt-1 text-sm text-sv-text-muted">
                  Nothing in <span className="font-medium text-sv-text">{folder?.name}</span> is
                  named “{trimmed}”. Retrieval needs the exact name — check spelling, spacing, and
                  capitalisation, then try again.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              {onManageFiles ? (
                <Button type="button" variant="outline" onClick={onManageFiles}>
                  No fetch, upload
                </Button>
              ) : (
                <Button type="button" variant="ghost" onClick={onClose}>
                  Close
                </Button>
              )}
              <Button type="button" onClick={retry}>
                Try another name
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
    <SecureFileViewer
      open={viewer !== null}
      fileName={viewer?.displayName ?? match?.displayName ?? ''}
      mimeType={viewer?.mimeType ?? match?.mimeType ?? null}
      blob={viewer?.blob ?? null}
      onClose={() => setViewer(null)}
    />
    </>
  )
}

export default FileNameModal
