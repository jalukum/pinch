import { parseRecipeHtml, fromMarkdown, quality, alternateLinks, pageBasics } from './parse'
import type { ParsedRecipe } from './types'
import { relayBase, absolute } from './config'

export interface Proxy {
  name: string
  build: (url: string) => string
  headers?: Record<string, string>
  kind: 'html' | 'markdown'
  timeout: number
  unwrap?: (text: string) => string
  /** Don't start the next source until this one has been running this long (ms). */
  hedgeAfter?: number
}

const enc = encodeURIComponent

export const CUSTOM_PROXY_KEY = 'pinch.customProxy'

/** Last-resort public relays. Most free CORS relays have died or started asking for keys; these may too. */
export const PROXIES: Proxy[] = [
  { name: 'r.jina.ai', build: (u) => `https://r.jina.ai/${u}`, headers: { 'X-Return-Format': 'html' }, kind: 'html', timeout: 20000 },
  { name: 'allorigins', build: (u) => `https://api.allorigins.win/raw?url=${enc(u)}`, kind: 'html', timeout: 12000 },
  { name: 'codetabs', build: (u) => `https://api.codetabs.com/v1/proxy/?quest=${enc(u)}`, kind: 'html', timeout: 12000 },
]

/** Pinch's own relay (proxy/worker.js on Cloudflare), or a legacy "{url}" template the user pasted. Tried first. */
export function customProxy(): Proxy | undefined {
  let tpl = ''
  try {
    tpl = localStorage.getItem(CUSTOM_PROXY_KEY) || ''
  } catch {
    /* ignore */
  }
  if (tpl.includes('{url}')) return { name: 'your relay', build: (u) => tpl.replace('{url}', enc(u)), kind: 'html', timeout: 20000, hedgeAfter: 20000 }
  const base = relayBase()
  if (!base) return undefined
  return { name: 'Pinch relay', build: (u) => `${absolute(base)}/fetch?url=${enc(u)}`, kind: 'html', timeout: 40000, hedgeAfter: 9000 }
}

export interface Attempt {
  proxy: string
  ok: boolean
  ms: number
  detail: string
}

/** A parse is only worth showing if it's a real recipe page, not a 404 or a stub. */
export function usable(r: ParsedRecipe): boolean {
  if (/^(page not found|404|not found|access denied|error|just a moment)/i.test(r.title || '')) return false
  const ing = r.ingredients.reduce((n, g) => n + g.items.length, 0)
  const st = r.instructions.reduce((n, g) => n + g.steps.length, 0)
  return ing >= 2 && st >= 1
}

/** Publishers (People Inc / Dotdash Meredith) that opt out of reader relays. A personal relay still works. */
export const OPTED_OUT = /(^|\.)(allrecipes|seriouseats|simplyrecipes|eatingwell|foodandwine|thespruceeats|marthastewart|bhg|southernliving|myrecipes|realsimple)\.com$/
export function isOptedOut(url: string): boolean {
  try { return OPTED_OUT.test(new URL(url).hostname) } catch { return false }
}

export class ExtractError extends Error {
  attempts: Attempt[]
  kind: 'blocked' | 'not-recipe' | 'offline'
  constructor(kind: ExtractError['kind'], message: string, attempts: Attempt[]) {
    super(message)
    this.kind = kind
    this.attempts = attempts
  }
}

function looksBlocked(text: string): boolean {
  const head = text.slice(0, 4000).toLowerCase()
  return (
    /just a moment|attention required|security checkpoint|captcha|access denied|rate limit|temporarily rate limited|are you a robot|enable javascript and cookies/.test(head) &&
    !/ld\+json/.test(text)
  )
}

async function tryProxy(p: Proxy, url: string, outer: AbortSignal): Promise<{ recipe?: ParsedRecipe; partial?: ParsedRecipe; detail: string }> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), p.timeout)
  const onOuter = () => ctl.abort()
  outer.addEventListener('abort', onOuter)
  const get = async (target: string) => {
    const res = await fetch(p.build(target), { headers: p.headers, signal: ctl.signal, credentials: 'omit', redirect: 'follow' })
    const upstream = res.headers.get('X-Upstream-Status')
    if (!res.ok) return { error: upstream ? `site answered ${upstream}` : `HTTP ${res.status}` }
    let text = await res.text()
    if (p.unwrap) text = p.unwrap(text)
    return { text, finalUrl: res.headers.get('X-Final-Url') || target, source: res.headers.get('X-Pinch-Source') || '' }
  }
  try {
    const first = await get(url)
    if ('error' in first) return { detail: first.error! }
    let { text, finalUrl, source } = first as { text: string; finalUrl: string; source: string }
    const tag = source && source !== 'live' ? ` (${source})` : ''
    if (text.length < 300) return { detail: `tiny response (${text.length} bytes)` }
    if (looksBlocked(text)) return { detail: 'blocked / bot-check page' }
    let recipe = p.kind === 'markdown' ? fromMarkdown(text, finalUrl) : parseRecipeHtml(text, finalUrl) ?? pageBasics(text, finalUrl)
    if (recipe && usable(recipe)) return { recipe: { ...recipe, url }, detail: `parsed via ${recipe.extractedVia}${tag}` }
    // No full recipe: try the page's AMP / print / JSON alternates once.
    if (p.kind === 'html' && !p.name.includes('relay')) {
      for (const alt of alternateLinks(text, finalUrl).slice(0, 2)) {
        const r2 = await get(alt).catch(() => undefined)
        if (!r2 || 'error' in r2) continue
        const rec2 = parseRecipeHtml((r2 as any).text, alt)
        if (rec2 && usable(rec2)) return { recipe: { ...rec2, url }, detail: `parsed via ${rec2.extractedVia} (alternate page)` }
        if (rec2 && quality(rec2) > quality(recipe)) recipe = rec2
      }
    }
    if (recipe && recipe.title && !/^(whoops|oops|gone|error|forbidden|not found|access denied|just a moment|attention required|are you a (robot|human))|page not found|\b(403|404|410|451)\b|page (is )?(gone|missing)|can.t be found|no longer available/i.test(recipe.title)) return { partial: { ...recipe, url }, detail: `page loaded, only part of a recipe found${tag}` }
    return { detail: 'page loaded, no recipe found' }
  } catch (e: any) {
    return { detail: ctl.signal.aborted ? (outer.aborted ? 'cancelled' : 'timed out') : `network/CORS error` }
  } finally {
    clearTimeout(timer)
    outer.removeEventListener('abort', onOuter)
  }
}

export function normalizeUrl(input: string): string | undefined {
  const m = /https?:\/\/[^\s<>"']+/i.exec(input.trim())
  let s = m ? m[0] : input.trim()
  if (!m && /^[\w-]+(\.[\w-]+)+(\/|$)/.test(s)) s = 'https://' + s
  try {
    const u = new URL(s)
    if (!/^https?:$/.test(u.protocol)) return undefined
    u.hash = ''
    // drop common tracking params
    for (const k of Array.from(u.searchParams.keys())) if (/^(utm_|fbclid|gclid|mc_|igsh)/i.test(k)) u.searchParams.delete(k)
    return u.href
  } catch {
    return undefined
  }
}

/**
 * Fetch + parse through the proxy chain. Proxies are "hedged": the next one starts if the
 * current hasn't succeeded within `stagger` ms, and the first good full recipe wins.
 */
/** A partial is only worth a card if it carries some real recipe text — a bare title (login walls, social posts) goes to the failure screen with its paste/write options instead. */
const hasBody = (r: ParsedRecipe) => r.ingredients.some((g) => g.items.length) || r.instructions.some((g) => g.steps.length)

export async function extractRecipe(
  url: string,
  opts: { signal?: AbortSignal; onProgress?: (msg: string, attempt: number) => void; stagger?: number; proxies?: Proxy[] } = {},
): Promise<{ recipe: ParsedRecipe; attempts: Attempt[]; via: string; partial?: boolean }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ExtractError('offline', "You're offline right now.", [])
  }
  const chain = opts.proxies ?? [customProxy(), ...PROXIES].filter(Boolean) as Proxy[]
  const stagger = opts.stagger ?? 6000
  const outer = new AbortController()
  opts.signal?.addEventListener('abort', () => outer.abort())
  const attempts: Attempt[] = []
  let best: { recipe: ParsedRecipe; via: string } | undefined
  let partial: { recipe: ParsedRecipe; via: string } | undefined

  return new Promise((resolve, reject) => {
    let started = 0
    let finished = 0
    let done = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const finish = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      outer.abort()
      if (best) resolve({ ...best, attempts })
      else if (partial && !opts.signal?.aborted && hasBody(partial.recipe)) resolve({ ...partial, attempts, partial: true })
      else {
        const anyLoaded = attempts.some((a) => a.detail.startsWith('page loaded'))
        reject(
          opts.signal?.aborted
            ? new ExtractError('blocked', 'Cancelled', attempts)
            : new ExtractError(anyLoaded ? 'not-recipe' : 'blocked', anyLoaded ? "We opened the page but couldn't find a recipe on it." : "That site wouldn't let us in.", attempts),
        )
      }
    }

    const launch = () => {
      if (done || started >= chain.length) return
      const p = chain[started++]
      opts.onProgress?.(p.name, started)
      const t0 = Date.now()
      tryProxy(p, url, outer.signal).then(({ recipe, partial: part, detail }) => {
        if (part && (!partial || quality(part) > quality(partial.recipe))) partial = { recipe: part, via: p.name }
        attempts.push({ proxy: p.name, ok: !!recipe, ms: Date.now() - t0, detail })
        finished++
        if (recipe && (!best || quality(recipe) > quality(best.recipe))) best = { recipe, via: p.name }
        if (best && quality(best.recipe) >= 5) return finish()
        if (done) return
        // failed fast → move to the next one right away
        clearTimeout(timer)
        if (started < chain.length) launch()
        else if (finished >= started) finish()
        
      })
      if (started < chain.length) {
        clearTimeout(timer)
        timer = setTimeout(launch, p.hedgeAfter ?? stagger)
      }
    }
    launch()
  })
}
