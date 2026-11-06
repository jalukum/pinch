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
