import { canvasForOcr } from './image'

const TES_VER = '5.1.1'
const TES_CDN = `https://cdn.jsdelivr.net/npm/tesseract.js@${TES_VER}`

type Worker = {
  recognize: (img: HTMLCanvasElement | Blob | string) => Promise<{ data: { text: string } }>
  terminate: () => Promise<void>
}

type TesseractNS = {
  createWorker: (
    lang: string,
    oem?: number,
    opts?: {
      logger?: (m: { status?: string; progress?: number }) => void
      workerPath?: string
      corePath?: string
      langPath?: string
    },
  ) => Promise<Worker>
}

let loading: Promise<TesseractNS> | undefined

function loadTesseract(): Promise<TesseractNS> {
  const existing = (window as unknown as { Tesseract?: TesseractNS }).Tesseract
  if (existing) return Promise.resolve(existing)
  if (!loading) {
    loading = new Promise<TesseractNS>((resolve, reject) => {
      const s = document.createElement('script')
      s.src = `${TES_CDN}/dist/tesseract.min.js`
      s.async = true
      s.onload = () => {
        const T = (window as unknown as { Tesseract?: TesseractNS }).Tesseract
        if (!T) reject(new Error('The reader didn’t start.'))
        else resolve(T)
      }
      s.onerror = () => {
        loading = undefined
        reject(new Error('Couldn’t load the reader. You’ll need a connection the first time.'))
      }
      document.head.appendChild(s)
    })
  }
  return loading
}

/**
 * Read printed recipe text from a photo on the device.
 * Tesseract.js is loaded from a CDN only when this runs, so the rest of Pinch stays small.
 */
export async function readRecipePhoto(
  file: Blob,
  opts: { onProgress?: (line: string) => void; signal?: AbortSignal } = {},
): Promise<string> {
  const { onProgress, signal } = opts
  const cancelled = () => signal?.aborted
  if (cancelled()) throw new DOMException('cancelled', 'AbortError')
  onProgress?.('Opening the reader…')
  const Tesseract = await loadTesseract()
  if (cancelled()) throw new DOMException('cancelled', 'AbortError')
  onProgress?.('Getting the photo ready…')
  const canvas = await canvasForOcr(file)
  if (cancelled()) throw new DOMException('cancelled', 'AbortError')
  onProgress?.('Reading the photo…')
  // Paths default to the jsDelivr copies that ship with this Tesseract version (SIMD core, compact language data).
  const worker = await Tesseract.createWorker('eng', 1, {
    logger: (m) => {
      if (cancelled()) return
      if (m.status === 'loading language traineddata') onProgress?.('Fetching the alphabet…')
      else if (m.status === 'initializing tesseract' || m.status === 'initializing api') onProgress?.('Getting ready…')
      else if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        const pct = Math.round(m.progress * 100)
        if (pct > 0 && pct < 100) onProgress?.(`Reading the photo… ${pct}%`)
      }
    },
  })
  const onAbort = () => { void worker.terminate() }
  signal?.addEventListener('abort', onAbort)
  try {
    if (cancelled()) throw new DOMException('cancelled', 'AbortError')
    const { data } = await worker.recognize(canvas)
    if (cancelled()) throw new DOMException('cancelled', 'AbortError')
    return (data.text || '').replace(/\u000c/g, '').trim()
  } finally {
    signal?.removeEventListener('abort', onAbort)
    await worker.terminate().catch(() => {})
  }
}
