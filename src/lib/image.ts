import { relayImage } from './config'
function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result))
    r.onerror = () => rej(r.error)
    r.readAsDataURL(b)
  })
}

async function get(url: string, ms = 12000): Promise<Blob | undefined> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try {
    const r = await fetch(url, { signal: ctl.signal, credentials: 'omit' })
    if (!r.ok) return undefined
    const b = await r.blob()
    return b.size > 500 && /^image\//.test(b.type) ? b : undefined
  } catch {
    return undefined
  } finally {
    clearTimeout(t)
  }
}

/** Downscale to keep storage small (max 1100px wide, JPEG/WebP). */
async function shrink(b: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(b)
    const scale = Math.min(1, 1100 / bmp.width)
    if (scale === 1 && b.size < 250_000) return b
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale)
    c.height = Math.round(bmp.height * scale)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    const out = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.8))
    return out && out.size < b.size ? out : b
  } catch {
    return b
  }
}

/** Fetch a remote image as a data: URL for offline use. Tries an image CDN with CORS, then direct. */
export async function cacheImage(src?: string): Promise<string | undefined> {
  if (!src) return undefined
  if (src.startsWith('data:')) return src
  const relayed = relayImage(src)
  const tries = [
    ...(relayed && relayed !== src ? [relayed] : []),
    `https://wsrv.nl/?url=${encodeURIComponent(src)}&w=1100&we&output=jpg&q=80`,
    src,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(src)}`,
  ]
  for (const t of tries) {
    const b = await get(t)
    if (b) return blobToDataUrl(await shrink(b))
  }
  return undefined
}

/** Load a user photo, honouring EXIF orientation, as a bitmap. */
async function bitmapFrom(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions)
  } catch {
    const url = URL.createObjectURL(blob)
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image()
        i.onload = () => res(i)
        i.onerror = () => rej(new Error('Couldn’t open that photo'))
        i.src = url
      })
      const c = document.createElement('canvas')
      c.width = img.naturalWidth || img.width
      c.height = img.naturalHeight || img.height
      c.getContext('2d')!.drawImage(img, 0, 0)
      return await createImageBitmap(c)
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

/**
 * Downscale and compress a user photo to a JPEG data URL for storage.
 * Long side is capped (default 1200px) at roughly quality 0.8.
 */
export async function fileToJpegDataUrl(file: Blob, maxSide = 1200, quality = 0.8): Promise<string> {
  const bmp = await bitmapFrom(file)
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bmp.width * scale))
  c.height = Math.max(1, Math.round(bmp.height * scale))
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', quality))
  if (!blob) throw new Error('Couldn’t write the photo')
  return blobToDataUrl(blob)
}

/** A sharper, slightly larger canvas for OCR (text needs more pixels than a card thumbnail). */
export async function canvasForOcr(file: Blob, maxSide = 2000): Promise<HTMLCanvasElement> {
  const bmp = await bitmapFrom(file)
  const scale = Math.min(2, maxSide / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bmp.width * scale))
  c.height = Math.max(1, Math.round(bmp.height * scale))
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  return c
}
