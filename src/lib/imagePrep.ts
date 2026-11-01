/**
 * Browser-side image preparation for the scan call.
 *
 * iOS hands back HEIC from the Files branch of the picker and the Anthropic
 * API accepts only jpeg/png/gif/webp, so every file is re-encoded to JPEG
 * regardless of what File.type claims. Long edge is capped at 1568px (the
 * API downsizes anything larger server-side, so more pixels are wasted
 * bytes). Files are processed one at a time by the caller: a 12 MP decode is
 * ~49 MB of RGBA and six at once is how a standalone PWA gets jettisoned.
 */
export const MAX_EDGE = 1568
export const MAX_IMAGES = 4
export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024

export interface PreparedImage {
  base64: string
  mediaType: 'image/jpeg'
  /** Object URL of the JPEG, for the thumbnail strip. Caller revokes. */
  previewUrl: string
  bytes: number
}

export function targetSize(width: number, height: number, maxEdge = MAX_EDGE): { width: number; height: number } {
  const long = Math.max(width, height)
  if (long <= maxEdge) return { width, height }
  const f = maxEdge / long
  // Round the EDGES of one quantity (the scale factor applied to each axis), not two parts.
  return { width: Math.max(1, Math.round(width * f)), height: Math.max(1, Math.round(height * f)) }
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // fall through to <img>
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error(`Could not decode ${file.name || 'image'}`))
      img.src = url
    })
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('JPEG encode failed'))), 'image/jpeg', quality)
  })
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const src = await decode(file)
  const w = 'naturalWidth' in src ? src.naturalWidth : src.width
  const h = 'naturalHeight' in src ? src.naturalHeight : src.height
  const { width, height } = targetSize(w, h)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(src, 0, 0, width, height)
  if ('close' in src) src.close()

  let quality = 0.85
  let blob = await toBlob(canvas, quality)
  while (blob.size > MAX_IMAGE_BYTES && quality > 0.5) {
    quality -= 0.1
    blob = await toBlob(canvas, quality)
  }
  canvas.width = canvas.height = 0
  if (blob.size > MAX_IMAGE_BYTES) throw new Error(`${file.name || 'Image'} is too large even after compression`)

  const base64 = await blobToBase64(blob)
  return { base64, mediaType: 'image/jpeg', previewUrl: URL.createObjectURL(blob), bytes: blob.size }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(new Error('Could not read image'))
    r.onload = () => resolve((r.result as string).split(',')[1])
    r.readAsDataURL(blob)
  })
}
