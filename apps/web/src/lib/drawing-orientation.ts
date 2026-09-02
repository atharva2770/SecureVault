import type { PDFDocumentProxy } from 'pdfjs-dist'

export type PageRotation = 0 | 90 | 180 | 270

type Corner = 'tl' | 'tr' | 'bl' | 'br'

/**
  Engineering drawings (ISO 5457 / typical shop-floor sheets) put the title
  block — drawing number, revision, scale — in the bottom-right. Scans and
  exports are often rotated 90/180/270° so that block lands in the wrong corner.

  We never send the file to an external model. A small local preview is scored
  by ink density in the four corners; we rotate so the densest corner becomes
  bottom-right. If corners look similar (text pages, photos), we leave the
  PDF/image as encoded.
*/
const PREVIEW_WIDTH = 480
const INK_LUMA = 208
const CORNER_INSET = 0.05
const CORNER_W = 0.3
const CORNER_H = 0.24
const MIN_INK = 0.07
const MIN_LEAD = 1.18
const MIN_SPREAD = 0.1

export function wrapRotation(degrees: number): PageRotation {
  const n = ((Math.round(degrees / 90) * 90) % 360 + 360) % 360
  return n as PageRotation
}

export function rotationToPutCornerAtBottomRight(corner: Corner): PageRotation {
  if (corner === 'br') return 0
  if (corner === 'tr') return 90
  if (corner === 'tl') return 180
  return 270
}

function cornerInk(data: ImageData): Record<Corner, number> {
  const { width: w, height: h, data: px } = data
  const insetX = Math.max(2, Math.floor(w * CORNER_INSET))
  const insetY = Math.max(2, Math.floor(h * CORNER_INSET))
  const boxW = Math.max(8, Math.floor(w * CORNER_W))
  const boxH = Math.max(8, Math.floor(h * CORNER_H))

  function density(x0: number, y0: number): number {
    let ink = 0
    let n = 0
    const x1 = Math.min(w, x0 + boxW)
    const y1 = Math.min(h, y0 + boxH)
    for (let y = Math.max(0, y0); y < y1; y += 1) {
      for (let x = Math.max(0, x0); x < x1; x += 1) {
        const i = (y * w + x) * 4
        const luma = (px[i] + px[i + 1] + px[i + 2]) / 3
        if (luma < INK_LUMA) ink += 1
        n += 1
      }
    }
    return n ? ink / n : 0
  }

  return {
    tl: density(insetX, insetY),
    tr: density(w - insetX - boxW, insetY),
    bl: density(insetX, h - insetY - boxH),
    br: density(w - insetX - boxW, h - insetY - boxH)
  }
}

export function rotationFromPreview(image: ImageData): PageRotation {
  const scores = cornerInk(image)
  const ranked = (Object.entries(scores) as [Corner, number][]).sort((a, b) => b[1] - a[1])
  const [best, second] = ranked
  const spread = best[1] - ranked[ranked.length - 1][1]
  if (best[1] < MIN_INK) return 0
  if (spread < MIN_SPREAD) return 0
  if (best[1] < second[1] * MIN_LEAD) return 0
  return rotationToPutCornerAtBottomRight(best[0])
}

function previewFromBitmap(bitmap: ImageBitmap): ImageData | null {
  const scale = PREVIEW_WIDTH / Math.max(bitmap.width, 1)
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bitmap, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

export function detectBitmapRotation(bitmap: ImageBitmap): PageRotation {
  const preview = previewFromBitmap(bitmap)
  return preview ? rotationFromPreview(preview) : 0
}

export async function detectPdfPageRotation(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  signal: AbortSignal
): Promise<PageRotation> {
  const page = await pdf.getPage(pageNumber)
  if (signal.aborted) return 0
  const unscaled = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: PREVIEW_WIDTH / unscaled.width })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(viewport.width))
  canvas.height = Math.max(1, Math.floor(viewport.height))
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
  if (!ctx) return 0
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const task = page.render({ canvasContext: ctx, viewport, canvas })
  const cancel = (): void => {
    void task.cancel()
  }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    await task.promise
  } catch {
    return 0
  } finally {
    signal.removeEventListener('abort', cancel)
  }
  if (signal.aborted) return 0
  return rotationFromPreview(ctx.getImageData(0, 0, canvas.width, canvas.height))
}
