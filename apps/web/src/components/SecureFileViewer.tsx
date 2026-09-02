import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { ChevronLeft, ChevronRight, EyeOff, Loader2, Minus, Plus, RotateCcw, RotateCw, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  detectBitmapRotation,
  detectPdfPageRotation,
  wrapRotation,
  type PageRotation
} from '@/lib/drawing-orientation'
import { DOCUMENT_WATERMARK } from '@/lib/watermark'

GlobalWorkerOptions.workerSrc = pdfWorkerSrc

const ZOOM_MIN = 0.5
const ZOOM_MAX = 4
/** Small nudge for +/− buttons. Wheel and the slider are continuous 50–400%. */
const ZOOM_NUDGE = 0.05
/** Backing-store floor so scanned pages stay sharp on 1× Windows displays. */
const MIN_OUTPUT_SCALE = 2
const MAX_OUTPUT_SCALE = 3
const MAX_CANVAS_PIXELS = 4096 * 4096

export interface SecureFileViewerProps {
  open: boolean
  fileName: string
  mimeType: string | null
  blob: Blob | null
  watermark?: string
  onClose: () => void
}

function isPdf(mime: string | null, name: string): boolean {
  const m = (mime ?? '').toLowerCase()
  const n = name.toLowerCase()
  return m.includes('pdf') || n.endsWith('.pdf')
}

function isImage(mime: string | null, name: string): boolean {
  const m = (mime ?? '').toLowerCase()
  if (m.startsWith('image/') && !m.includes('svg')) return true
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(name)
}

function outputScale(): number {
  return Math.min(Math.max(window.devicePixelRatio || 1, MIN_OUTPUT_SCALE), MAX_OUTPUT_SCALE)
}

function paintWatermark(ctx: CanvasRenderingContext2D, width: number, height: number, text: string): void {
  ctx.save()
  ctx.globalAlpha = 0.16
  ctx.fillStyle = '#111827'
  const size = Math.max(16, Math.round(width / 48))
  ctx.font = `600 ${size}px ui-sans-serif, system-ui, sans-serif`
  ctx.translate(width / 2, height / 2)
  ctx.rotate(-Math.PI / 7)
  const stepX = size * 8
  const stepY = size * 6
  for (let y = -height; y < height; y += stepY) {
    for (let x = -width; x < width; x += stepX) {
      ctx.fillText(text, x, y)
    }
  }
  ctx.restore()
}

function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100))
}

function zoomFromWheel(current: number, event: WheelEvent): number {
  const pixels =
    event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * 400 : event.deltaY
  return clampZoom(current * Math.exp(-pixels * 0.002))
}

function clampScale(cssWidth: number, cssHeight: number, scale: number): number {
  const pixels = cssWidth * scale * cssHeight * scale
  if (pixels <= MAX_CANVAS_PIXELS) return scale
  return scale * Math.sqrt(MAX_CANVAS_PIXELS / pixels)
}

async function drawPdfPage(
  pdf: PDFDocumentProxy,
  container: HTMLElement,
  pageNumber: number,
  zoom: number,
  rotation: PageRotation,
  watermark: string,
  signal: AbortSignal
): Promise<void> {
  container.replaceChildren()
  const page = await pdf.getPage(pageNumber)
  if (signal.aborted) return

  const nativeRotate = page.rotate || 0
  const rotationAbs = wrapRotation(nativeRotate + rotation)
  const unscaled = page.getViewport({ scale: 1, rotation: rotationAbs })
  const cssWidth = Math.max(280, container.clientWidth || 960)
  const cssScale = (cssWidth / unscaled.width) * zoom
  const viewport = page.getViewport({ scale: cssScale, rotation: rotationAbs })
  const sx = clampScale(viewport.width, viewport.height, outputScale())

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(viewport.width * sx))
  canvas.height = Math.max(1, Math.floor(viewport.height * sx))
  canvas.style.width = `${Math.max(1, Math.floor(viewport.width))}px`
  canvas.style.height = `${Math.max(1, Math.floor(viewport.height))}px`
  canvas.className = 'sv-secure-page mx-auto block rounded-sm bg-white shadow-lg'
  canvas.setAttribute('aria-label', `Page ${pageNumber}`)

  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const transform = sx !== 1 ? [sx, 0, 0, sx, 0, 0] : undefined
  const task = page.render({
    canvasContext: ctx,
    viewport,
    canvas,
    transform
  })
  const cancel = (): void => {
    void task.cancel()
  }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    await task.promise
  } catch (error) {
    if (signal.aborted) return
    throw error
  } finally {
    signal.removeEventListener('abort', cancel)
  }
  if (signal.aborted) return
  paintWatermark(ctx, canvas.width, canvas.height, watermark)
  container.appendChild(canvas)
}

function drawImage(
  bitmap: ImageBitmap,
  container: HTMLElement,
  zoom: number,
  rotation: PageRotation,
  watermark: string
): void {
  container.replaceChildren()
  const swapped = rotation === 90 || rotation === 270
  const contentW = swapped ? bitmap.height : bitmap.width
  const contentH = swapped ? bitmap.width : bitmap.height
  const cssWidth = Math.max(280, container.clientWidth || 960) * zoom
  const fit = cssWidth / contentW
  const cssW = Math.max(1, Math.round(contentW * fit))
  const cssH = Math.max(1, Math.round(contentH * fit))
  const sx = clampScale(cssW, cssH, outputScale())
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(cssW * sx))
  canvas.height = Math.max(1, Math.round(cssH * sx))
  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`
  canvas.className = 'sv-secure-page mx-auto block rounded-sm bg-white shadow-lg'
  const ctx = canvas.getContext('2d', { alpha: false })
  if (ctx) {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.save()
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate((rotation * Math.PI) / 180)
    const drawW = swapped ? canvas.height : canvas.width
    const drawH = swapped ? canvas.width : canvas.height
    ctx.drawImage(bitmap, -drawW / 2, -drawH / 2, drawW, drawH)
    ctx.restore()
    paintWatermark(ctx, canvas.width, canvas.height, watermark)
  }
  container.appendChild(canvas)
}

/*
  In-app view-only surface. Bytes stay in this overlay (no new tab, no native
  PDF chrome). Print / save shortcuts and right-click are blocked. Screenshot
  tools at the OS level cannot be stopped in a browser; the watermark is the
  attribution layer when a capture leaks.
*/
export function SecureFileViewer({
  open,
  fileName,
  mimeType,
  blob,
  watermark = DOCUMENT_WATERMARK,
  onClose
}: SecureFileViewerProps): React.JSX.Element | null {
  const pagesRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null)
  const pdfRef = useRef<PDFDocumentProxy | null>(null)
  const bitmapRef = useRef<ImageBitmap | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'unsupported' | 'error'>('loading')
  const [hidden, setHidden] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [renderZoom, setRenderZoom] = useState(1)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [rotation, setRotation] = useState<PageRotation>(0)
  const zoomRef = useRef(1)
  zoomRef.current = zoom

  const bumpZoom = useCallback((next: number) => {
    setZoom(clampZoom(next))
  }, [])

  const bumpRotation = useCallback((delta: number) => {
    setRotation((current) => wrapRotation(current + delta))
  }, [])

  const onPanPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.pointerType === 'touch') return
    const scroller = scrollerRef.current
    if (!scroller) return
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      sl: scroller.scrollLeft,
      st: scroller.scrollTop
    }
    setDragging(true)
    scroller.setPointerCapture(event.pointerId)
  }, [])

  const onPanPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const scroller = scrollerRef.current
    if (!drag || !scroller) return
    scroller.scrollLeft = drag.sl - (event.clientX - drag.x)
    scroller.scrollTop = drag.st - (event.clientY - drag.y)
  }, [])

  const onPanPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null
    setDragging(false)
    if (scrollerRef.current?.hasPointerCapture(event.pointerId)) {
      scrollerRef.current.releasePointerCapture(event.pointerId)
    }
  }, [])

  const guardKeys = useCallback(
    (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const mod = event.ctrlKey || event.metaKey
      if (mod && (key === '=' || key === '+' || event.key === '+')) {
        event.preventDefault()
        bumpZoom(zoomRef.current + ZOOM_NUDGE)
        return
      }
      if (mod && key === '-') {
        event.preventDefault()
        bumpZoom(zoomRef.current - ZOOM_NUDGE)
        return
      }
      if (mod && key === '0') {
        event.preventDefault()
        setZoom(1)
        return
      }
      if (!mod && key === 'r') {
        event.preventDefault()
        setRotation((current) => wrapRotation(current + (event.shiftKey ? -90 : 90)))
        return
      }
      if (!mod && event.key === 'ArrowLeft') {
        event.preventDefault()
        setPageNumber((n) => Math.max(1, n - 1))
        return
      }
      if (!mod && event.key === 'ArrowRight') {
        event.preventDefault()
        const count = pdfRef.current?.numPages ?? 1
        setPageNumber((n) => Math.min(count, n + 1))
        return
      }
      const block = mod && (key === 'p' || key === 's')
      if (block || key === 'printscreen') {
        event.preventDefault()
        event.stopPropagation()
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    },
    [bumpZoom, onClose]
  )

  useEffect(() => {
    if (!open) return
    document.documentElement.classList.add('sv-secure-viewing')
    const onPrint = (event: Event): void => {
      event.preventDefault()
    }
    const onVis = (): void => {
      setHidden(document.hidden)
    }
    const onBlur = (): void => {
      setHidden(true)
    }
    const onFocus = (): void => {
      if (!document.hidden) setHidden(false)
    }
    const onWheel = (event: WheelEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) return
      event.preventDefault()
      bumpZoom(zoomFromWheel(zoomRef.current, event))
    }

    window.addEventListener('keydown', guardKeys, true)
    window.addEventListener('beforeprint', onPrint)
    window.addEventListener('wheel', onWheel, { passive: false, capture: true })
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.documentElement.classList.remove('sv-secure-viewing')
      window.removeEventListener('keydown', guardKeys, true)
      window.removeEventListener('beforeprint', onPrint)
      window.removeEventListener('wheel', onWheel, true)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      document.body.style.overflow = previousOverflow
    }
  }, [open, bumpZoom, guardKeys])

  useEffect(() => {
    if (!open) {
      setZoom(1)
      setRenderZoom(1)
      setPageNumber(1)
      setPageCount(1)
      setRotation(0)
      setStatus('loading')
      setHidden(false)
      setDragging(false)
      dragRef.current = null
    }
  }, [open, blob])

  useEffect(() => {
    if (!open || !blob) return
    const ac = new AbortController()
    setStatus('loading')
    setPageNumber(1)
    setPageCount(1)
    setRotation(0)
    pdfRef.current = null
    if (bitmapRef.current) {
      bitmapRef.current.close()
      bitmapRef.current = null
    }

    void (async () => {
      try {
        if (isPdf(mimeType, fileName)) {
          const data = await blob.arrayBuffer()
          if (ac.signal.aborted) return
          const pdf = await getDocument({ data, disableAutoFetch: false }).promise
          if (ac.signal.aborted) {
            await pdf.cleanup()
            return
          }
          pdfRef.current = pdf
          if (!ac.signal.aborted) {
            const extra = await detectPdfPageRotation(pdf, 1, ac.signal)
            if (ac.signal.aborted) {
              await pdf.cleanup()
              return
            }
            setRotation(extra)
            setPageCount(pdf.numPages)
            setPageNumber(1)
            setStatus('ready')
          }
        } else if (isImage(mimeType, fileName)) {
          const bitmap = await createImageBitmap(blob)
          if (ac.signal.aborted) {
            bitmap.close()
            return
          }
          bitmapRef.current = bitmap
          if (!ac.signal.aborted) {
            setRotation(detectBitmapRotation(bitmap))
            setPageCount(1)
            setPageNumber(1)
            setStatus('ready')
          }
        } else {
          setStatus('unsupported')
        }
      } catch {
        if (!ac.signal.aborted) setStatus('error')
      }
    })()

    return () => {
      ac.abort()
      const pdf = pdfRef.current
      pdfRef.current = null
      void pdf?.cleanup()
      bitmapRef.current?.close()
      bitmapRef.current = null
    }
  }, [open, blob, fileName, mimeType])

  useEffect(() => {
    const timer = window.setTimeout(() => setRenderZoom(zoom), 80)
    return () => window.clearTimeout(timer)
  }, [zoom])

  useEffect(() => {
    if (!open || status !== 'ready') return
    const container = pagesRef.current
    if (!container) return
    const ac = new AbortController()
    const pdf = pdfRef.current
    const bitmap = bitmapRef.current
    void (async () => {
      try {
        if (pdf) await drawPdfPage(pdf, container, pageNumber, renderZoom, rotation, watermark, ac.signal)
        else if (bitmap) drawImage(bitmap, container, renderZoom, rotation, watermark)
      } catch {
        /* keep last good frame */
      }
    })()
    return () => ac.abort()
  }, [open, status, renderZoom, pageNumber, rotation, watermark, blob])

  useEffect(() => {
    const el = pagesRef.current
    if (!el) return
    const preview = renderZoom === 0 ? 1 : zoom / renderZoom
    el.style.transform = Math.abs(preview - 1) < 0.01 ? '' : `scale(${preview})`
    el.style.transformOrigin = 'top center'
  }, [zoom, renderZoom])

  if (!open) return null

  const zoomLabel = `${Math.round(zoom * 100)}%`
  const showPager = status === 'ready' && pageCount > 1

  return createPortal(
    <div
      className="sv-secure-viewer fixed inset-0 z-[80] flex flex-col bg-black/90 text-white select-none"
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
        <p className="min-w-0 flex-1 truncate text-sm font-medium" title={fileName}>
          {fileName}
        </p>
        {showPager ? (
          <div className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 p-0.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 text-white hover:bg-white/10"
              disabled={pageNumber <= 1}
              aria-label="Previous page"
              onClick={() => setPageNumber((n) => Math.max(1, n - 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-20 text-center text-xs tabular-nums text-white/80">
              Page {pageNumber} / {pageCount}
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 text-white hover:bg-white/10"
              disabled={pageNumber >= pageCount}
              aria-label="Next page"
              onClick={() => setPageNumber((n) => Math.min(pageCount, n + 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        ) : null}
        {status === 'ready' ? (
          <div className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 p-0.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 text-white hover:bg-white/10"
              disabled={zoom <= ZOOM_MIN}
              aria-label="Zoom out"
              onClick={() => bumpZoom(zoom - ZOOM_NUDGE)}
            >
              <Minus className="size-4" />
            </Button>
            <input
              type="range"
              min={50}
              max={400}
              step={1}
              value={Math.round(zoom * 100)}
              aria-label="Zoom"
              title="Zoom 50%–400%"
              className="h-8 w-24 cursor-pointer accent-white sm:w-32"
              onChange={(event) => bumpZoom(Number(event.target.value) / 100)}
            />
            <button
              type="button"
              className="min-w-12 rounded px-1 text-center text-xs tabular-nums text-white/80 hover:bg-white/10"
              title="Reset to fit width"
              onClick={() => setZoom(1)}
            >
              {zoomLabel}
            </button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 text-white hover:bg-white/10"
              disabled={zoom >= ZOOM_MAX}
              aria-label="Zoom in"
              onClick={() => bumpZoom(zoom + ZOOM_NUDGE)}
            >
              <Plus className="size-4" />
            </Button>
          </div>
        ) : null}
        {status === 'ready' ? (
          <div className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 p-0.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 text-white hover:bg-white/10"
              aria-label="Rotate left"
              title="Rotate left (Shift+R)"
              onClick={() => bumpRotation(-90)}
            >
              <RotateCcw className="size-4" />
            </Button>
            <span className="min-w-10 text-center text-xs tabular-nums text-white/80">{rotation}°</span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 text-white hover:bg-white/10"
              aria-label="Rotate right"
              title="Rotate right (R)"
              onClick={() => bumpRotation(90)}
            >
              <RotateCw className="size-4" />
            </Button>
          </div>
        ) : null}
        <p className="hidden text-2xs text-white/50 lg:block">
          View only · {DOCUMENT_WATERMARK} · Drag to pan · R to rotate
        </p>
        <Button type="button" size="sm" variant="secondary" className="h-9 gap-1.5" onClick={onClose}>
          <X className="size-4" />
          Close
        </Button>
      </header>

      <div
        ref={scrollerRef}
        className={`relative min-h-0 flex-1 overflow-auto px-4 py-6 ${
          status === 'ready' ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : ''
        }`}
        onPointerDown={status === 'ready' ? onPanPointerDown : undefined}
        onPointerMove={onPanPointerMove}
        onPointerUp={onPanPointerUp}
        onPointerCancel={onPanPointerUp}
      >
        {status === 'loading' ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-white/70">
            <Loader2 className="size-5 animate-spin" />
            Opening securely…
          </div>
        ) : null}
        {status === 'error' ? (
          <p className="mx-auto max-w-md text-center text-sm text-white/80">
            This file could not be opened in the secure viewer.
          </p>
        ) : null}
        {status === 'unsupported' ? (
          <p className="mx-auto max-w-md text-center text-sm text-white/80">
            Preview is not available for this file type. Download is disabled in DOCMAN.
          </p>
        ) : null}
        <div ref={pagesRef} className={status === 'ready' ? '' : 'hidden'} />

        {hidden ? (
          <div className="absolute inset-0 z-10 grid place-items-center bg-black">
            <div className="flex flex-col items-center gap-2 text-white/80">
              <EyeOff className="size-8" />
              <p className="text-sm font-medium">Document hidden</p>
              <p className="text-xs text-white/50">Return to this window to continue viewing.</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  )
}

export default SecureFileViewer
