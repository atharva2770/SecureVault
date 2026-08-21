import { Download, Eye, File, FileArchive, FileImage, FileSpreadsheet, FileText, Lock } from 'lucide-react'

import type { FileDto } from '../../../preload/index.d'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface FileCardProps {
  file: FileDto
  onOpen?: (file: FileDto) => void
  onDownload?: (file: FileDto) => void
  onDelete?: (file: FileDto) => void
  className?: string
}

function formatBytes(size: string): string {
  const n = Number(size)
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function FileGlyph({ mimeType, name }: { mimeType: string | null; name: string }): React.JSX.Element {
  const lower = `${mimeType ?? ''} ${name}`.toLowerCase()
  if (lower.includes('image') || /\.(png|jpe?g|gif|webp)$/i.test(name)) {
    return <FileImage className="size-8 text-sky-400" />
  }
  if (lower.includes('sheet') || lower.includes('excel') || /\.(xlsx?|csv)$/i.test(name)) {
    return <FileSpreadsheet className="size-8 text-emerald-400" />
  }
  if (lower.includes('zip') || lower.includes('archive') || /\.(zip|rar|7z)$/i.test(name)) {
    return <FileArchive className="size-8 text-amber-400" />
  }
  if (lower.includes('pdf') || lower.includes('text') || /\.(txt|md|pdf|docx?)$/i.test(name)) {
    return <FileText className="size-8 text-sv-accent" />
  }
  return <File className="size-8 text-sv-text-muted" />
}

export default function FileCard({
  file,
  onOpen,
  onDownload,
  onDelete,
  className
}: FileCardProps): React.JSX.Element {
  return (
    <article
      className={cn(
        'group flex flex-col gap-3 rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface p-4 text-left transition',
        'hover:border-sv-accent/40 hover:bg-sv-surface-raised',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          className="flex size-12 items-center justify-center rounded-lg bg-sv-bg/80 outline-none focus-visible:ring-2 focus-visible:ring-sv-accent"
          onClick={() => onOpen?.(file)}
          aria-label={`View ${file.displayName}`}
        >
          <FileGlyph mimeType={file.mimeType} name={file.originalFileName} />
        </button>
        <span className="inline-flex items-center gap-1 rounded-full bg-sv-success/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sv-success">
          <Lock className="size-3" />
          Encrypted
        </span>
      </div>

      <div className="min-w-0 space-y-1">
        <h3 className="truncate text-sm font-semibold text-sv-text" title={file.displayName}>
          {file.displayName}
        </h3>
        {file.categoryName ? (
          <p className="truncate text-[11px] text-sv-accent">{file.categoryName}</p>
        ) : null}
        <p className="truncate text-xs text-sv-text-muted" title={file.originalFileName}>
          {file.originalFileName}
        </p>
        <p className="text-xs text-sv-text-muted">{formatBytes(file.sizeBytes)}</p>
        <p className="text-xs text-sv-text-muted">Modified {formatDate(file.updatedAt)}</p>
      </div>

      <div className="mt-auto flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          className="h-8 gap-1.5"
          onClick={() => onOpen?.(file)}
        >
          <Eye className="size-3.5" />
          View
        </Button>
        <Button
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => onDownload?.(file)}
        >
          <Download className="size-3.5" />
          Download
        </Button>
        {onDelete ? (
          <button
            type="button"
            className="ml-auto text-xs text-sv-text-muted hover:text-sv-danger"
            onClick={() => onDelete(file)}
          >
            Delete
          </button>
        ) : null}
      </div>
    </article>
  )
}
