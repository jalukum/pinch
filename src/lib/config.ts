/**
 * Where Pinch fetches recipe pages from.
 *
 * After you deploy proxy/worker.js to Cloudflare, put its address here (or set VITE_RELAY_URL at build time),
 * for example 'https://pinch-relay.jaluku-pinch.workers.dev'. Until then the app falls back to public relays.
 */
export const DEFAULT_RELAY = 'https://pinch-relay.jaluku-pinch.workers.dev'

const fromEnv = (import.meta as any).env?.VITE_RELAY_URL as string | undefined

/** The relay's base URL, or undefined while it's still the placeholder. */
export function relayBase(): string | undefined {
  let custom = ''
  try {
    custom = localStorage.getItem('pinch.customProxy') || ''
  } catch {
    /* ignore */
  }
  const pick = [custom, fromEnv, DEFAULT_RELAY].map((s) => (s || '').trim()).find((s) => s && !s.includes('YOUR-') && !s.includes('{url}'))
  return pick ? pick.replace(/\/+$/, '') : undefined
}

/** Resolve a relay base that may be relative (e.g. "./relay" for the local test server). */
export function absolute(base: string): string {
  try {
    return new URL(base, document.baseURI).href.replace(/\/+$/, '')
  } catch {
    return base
  }
}

export function relayImage(src?: string): string | undefined {
  const base = relayBase()
  if (!src || src.startsWith('data:') || !base) return src
  return `${absolute(base)}/img?url=${encodeURIComponent(src)}`
}
