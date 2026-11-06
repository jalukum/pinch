/**
 * Pinch relay: a small personal fetch relay for Cloudflare Workers (the free plan is plenty).
 *
 *   GET /fetch?url=<recipe page>  → the page HTML (header X-Final-Url = URL after redirects)
 *   GET /img?url=<image>          → the image bytes, with CORS headers, so photos can be cached offline
 *   GET /                         → "ok" health check
 *
 * Safety:
 *   - only public http(s) hosts are fetched
 *   - only HTML/JSON/images are passed back, with a 5 MB size cap and a 15 s timeout
 *   - only the app's own origins may call it (ALLOWED_ORIGINS, comma-separated, set in wrangler.toml or the dashboard)
 *   - it sends ordinary browser request headers and does not solve captchas or fake any identity beyond a normal browser visit
 */

const DEFAULT_ORIGINS = 'https://jalukum.github.io,http://localhost:5173,http://localhost:4173'
const MAX_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 15000
const PAGE_DEADLINE_MS = 28000
const MAX_REDIRECTS = 6

const UAS = [
  // Current iPhone Safari, then desktop Chrome. Some sites answer one better than the other.
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
]

function browserHeaders(ua, kind, target) {
  const chrome = ua.includes('Chrome/')
  const h = {
    'User-Agent': ua,
    'Accept': kind === 'img'
      ? 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
      : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': kind === 'img' ? 'image' : 'document',
    'Sec-Fetch-Mode': kind === 'img' ? 'no-cors' : 'navigate',
    'Sec-Fetch-Site': kind === 'img' ? 'same-site' : 'none',
  }
  if (kind !== 'img') h['Sec-Fetch-User'] = '?1'
  if (kind === 'img') h['Referer'] = new URL(target).origin + '/'
  if (chrome) {
    h['sec-ch-ua'] = '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"'
    h['sec-ch-ua-mobile'] = '?0'
    h['sec-ch-ua-platform'] = '"macOS"'
  }
  return h
}

/** Reject anything that isn't a public internet host (SSRF guard). */
export function isPublicUrl(raw) {
  let u
  try { u = new URL(raw) } catch { return false }
  if (!/^https?:$/.test(u.protocol)) return false
  if (u.username || u.password) return false
  if (u.port && !['80', '443', ''].includes(u.port)) return false
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!h.includes('.') && !h.includes(':')) return false // bare names like "localhost", "intranet"
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain)$/.test(h)) return false
  if (h.includes(':')) {
    // IPv6 literal: allow only global unicast, and no IPv4-mapped forms
    if (h === '::' || h === '::1' || /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(h) || h.startsWith('::ffff:') || h.startsWith('64:ff9b')) return false
    return true
  }
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (m) {
    const [a, b] = [+m[1], +m[2]]
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false
    if (a === 169 && b === 254) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
    if (a === 100 && b >= 64 && b <= 127) return false
    if (a === 198 && (b === 18 || b === 19)) return false
  } else if (/^[\d.]+$/.test(h) || /^0x/i.test(h)) {
    return false // odd numeric forms like 2130706433 or 0x7f.1
  }
  return true
}

function looksLikeChallenge(status, text) {
  if (status === 403 || status === 429 || status === 503) {
    return /cf-chl|challenge-platform|just a moment|attention required|captcha|perimeterx|px-captcha|datadome|access denied/i.test(text.slice(0, 20000))
  }
  return false
}

async function readCapped(res) {
  const reader = res.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BYTES) { reader.cancel(); throw Object.assign(new Error('too large'), { status: 413 }) }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.byteLength }
  return out
}

/** Fetch with manual redirects so every hop goes through the SSRF guard. */
async function fetchFollow(target, kind, ua, signal) {
  let url = target
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    if (!isPublicUrl(url)) throw Object.assign(new Error('blocked host'), { status: 400 })
    const res = await fetch(url, {
      method: 'GET',
      headers: browserHeaders(ua, kind, url),
      redirect: 'manual',
      signal,
      // Cloudflare edge cache. Other runtimes ignore this option.
      cf: { cacheTtl: kind === 'img' ? 86400 : 1800, cacheEverything: true },
    })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url).href
      try { res.body?.cancel() } catch {}
      continue
    }
    return { res, finalUrl: url }
  }
  throw Object.assign(new Error('too many redirects'), { status: 508 })
}

/** Cheap check (no DOM in Workers) for whether a page carries a machine-readable recipe. */
export function hasRecipe(html) {
  return /"@type"\s*:\s*(\[[^\]]*)?"(schema:|https?:\/\/schema\.org\/)?Recipe"/i.test(html) ||
    /itemtype=["']https?:\/\/schema\.org\/Recipe/i.test(html) ||
    /typeof=["'][^"']*Recipe/i.test(html) ||
    /class=["'][^"']*(wprm-recipe-ingredient|tasty-recipes-ingredients|mv-create-ingredients|cooked-single-ingredient|zlrecipe|easyrecipe)/i.test(html)
}

/** AMP / print alternates advertised by the page itself. */
export function alternates(html, base) {
  const out = []
  const add = (u) => { try { const x = new URL(u.replace(/&amp;/g, '&'), base).href; if (x !== base && !out.includes(x)) out.push(x) } catch {} }
  for (const m of html.matchAll(/<link[^>]+rel=["']amphtml["'][^>]*>/gi)) { const h = /href=["']([^"']+)/i.exec(m[0]); if (h) add(h[1]) }
  for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi)) {
    const tag = m[0]
    if (/wprm-recipe-print|tasty-recipes-print|mv-create-print|recipe-print|print-recipe/i.test(tag) || /\/wprm_print\/|\/print\/\d|[?&]print(=|&|$)/i.test(m[1])) add(m[1])
  }
  return out.slice(0, 3)
}

function wpSlug(target) {
  const parts = new URL(target).pathname.split('/').filter(Boolean)
  const slug = parts[parts.length - 1]
  return slug && /^[\w%-]+$/.test(slug) && !/\.(html?|php|aspx?)$/.test(slug) ? slug : undefined
}

const escapeHtml = (t) => String(t || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])

/**
 * Try every normal way a browser could read the page, in order, until one carries a recipe:
 * the live page (two browser identities), its AMP/print versions, the WordPress REST API, then the
 * Internet Archive's latest snapshot. It doesn't solve captchas or get past paywalls.
 */
async function smartFetch(target, deadline) {
  const tried = []
  let best
  const left = () => deadline - Date.now()
  const get = async (url, ua = UAS[0], kind = 'html', retry = true) => {
    if (left() < 1500) return undefined
    const r = await get1(url, ua, kind)
    // the archive rate-limits bursts; one polite retry after a pause
    if (retry && r?.status === 429 && left() > 5000) {
      await new Promise((ok) => setTimeout(ok, 1500))
      return get1(url, ua, kind)
    }
    return r
  }
  const get1 = async (url, ua, kind) => {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), Math.min(10000, left()))
    try {
      const { res, finalUrl } = await fetchFollow(url, kind, ua, ctl.signal)
      const type = res.headers.get('content-type') || ''
      if (type && !/html|xml|json|text\/plain/.test(type)) { tried.push(`${short(url)} -> ${res.status} ${type}`); return undefined }
      const text = new TextDecoder('utf-8').decode(await readCapped(res))
      tried.push(`${short(url)} -> ${res.status}${looksLikeChallenge(res.status, text) ? ' (bot check)' : ''}`)
      return { status: res.status, ok: res.ok, text, finalUrl }
    } catch (e) {
      tried.push(`${short(url)} -> ${ctl.signal.aborted ? 'timeout' : e?.message || 'error'}`)
      return undefined
    } finally { clearTimeout(t) }
  }
  const win = (r, source) => ({ ...r, source, tried })

  // 1. live page, iPhone Safari then desktop Chrome
  for (const ua of UAS) {
    const r = await get(target, ua)
    if (!r) continue
    if (r.ok && hasRecipe(r.text)) return win(r, 'live')
    if (r.ok) { best = { ...r, source: 'live' }; break }
  }
  // 2. AMP / print versions the page links to, plus common AMP URL shapes
  const alts = best ? alternates(best.text, best.finalUrl) : []
  if (!best) {
    const u = new URL(target)
    if (u.pathname.endsWith('/')) alts.push(u.origin + u.pathname + 'amp/' + u.search)
    alts.push(target + (u.search ? '&' : '?') + 'amp=1')
  }
  for (const alt of alts.slice(0, 3)) {
    const r = await get(alt)
    if (r?.ok && hasRecipe(r.text)) return win(r, alt.includes('amp') ? 'amp' : 'print')
  }
  // 3. WordPress REST API (many food blogs). The yoast_head field often carries the Recipe JSON-LD.
  const slug = wpSlug(target)
  const isWp = !best || /wp-content|wp-json|wprm-|tasty-recipes/i.test(best.text)
  if (slug && isWp) {
    const origin = new URL(target).origin
    const r = await get(`${origin}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&_fields=title,content,link,yoast_head`, UAS[1])
    if (r?.ok && r.text.trim().startsWith('[')) {
      try {
        const post = JSON.parse(r.text)[0]
        if (post) {
          const html = `<!doctype html><html><head><title>${escapeHtml(post.title?.rendered)}</title>${post.yoast_head || ''}</head><body><h1>${post.title?.rendered || ''}</h1>${post.content?.rendered || ''}</body></html>`
          if (hasRecipe(html)) return win({ status: 200, ok: true, text: html, finalUrl: post.link || target }, 'wp-json')
          // WP Recipe Maker keeps the card behind its own endpoint
          const id = /wprm-recipe-container-(\d+)|data-recipe-id=["']?(\d+)/.exec(post.content?.rendered || '')
          if (id) {
            const w = await get(`${origin}/wp-json/wp-recipe-maker/v1/recipe/${id[1] || id[2]}`, UAS[1])
            if (w?.ok) {
              try {
                const j = JSON.parse(w.text)
                const ld = wprmToJsonLd(j, post)
                if (ld) return win({ status: 200, ok: true, text: html.replace('</head>', `<script type="application/ld+json">${JSON.stringify(ld)}</script></head>`), finalUrl: post.link || target }, 'wp-recipe-maker')
              } catch {}
            }
          }
        }
      } catch {}
    }
  }
  // 4. The Internet Archive's most recent copy (when the live site refuses us)
  const wb = await get(`https://web.archive.org/web/2id_/${target}`)
  if (wb?.ok && hasRecipe(wb.text)) return win({ ...wb, finalUrl: target }, 'wayback')
  // the newest capture can itself be a bot-check page: ask the archive for its newest *good* copy
  if (!wb?.ok || !hasRecipe(wb.text)) {
    const cdx = await get(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(target.replace(/^https?:\/\//, ''))}&filter=statuscode:200&fl=timestamp&limit=-3`, UAS[1])
    const stamps = (cdx?.ok ? cdx.text.trim().split(/\s+/).filter((x) => /^\d{14}$/.test(x)) : []).reverse()
    for (const ts of stamps.slice(0, 2)) {
      const snap = await get(`https://web.archive.org/web/${ts}id_/${target}`)
      if (snap?.ok && hasRecipe(snap.text)) return win({ ...snap, finalUrl: target }, 'wayback')
    }
  }

  return best ? { ...best, tried } : { status: 0, ok: false, text: '', finalUrl: target, source: 'none', tried }
}

function short(u) { try { const x = new URL(u); return x.hostname.replace(/^www\./, '') + x.pathname.slice(0, 40) + (x.search ? '?…' : '') } catch { return u } }

/** Turn a WP Recipe Maker API record into schema.org JSON-LD so the app's normal parser handles it. */
function wprmToJsonLd(j, post) {
  const r = j?.recipe || j
  if (!r || (!r.ingredients_flat && !r.ingredients)) return undefined
  const ingGroups = r.ingredients || []
  const ingredients = ingGroups.flatMap((g) => (g.ingredients || []).map((i) => [i.amount, i.unit, i.name, i.notes].filter(Boolean).join(' ')))
  const steps = (r.instructions || []).map((g) => ({ '@type': 'HowToSection', name: g.name || '', itemListElement: (g.instructions || []).map((s) => ({ '@type': 'HowToStep', text: s.text })) }))
  return {
    '@context': 'https://schema.org', '@type': 'Recipe',
    name: r.name || post?.title?.rendered, description: r.summary, image: r.image_url,
    prepTime: r.prep_time ? `PT${r.prep_time}M` : undefined, cookTime: r.cook_time ? `PT${r.cook_time}M` : undefined,
    totalTime: r.total_time ? `PT${r.total_time}M` : undefined,
    recipeYield: r.servings ? `${r.servings} ${r.servings_unit || 'servings'}` : undefined,
    recipeIngredient: ingredients, recipeInstructions: steps,
  }
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'X-Final-Url, X-Upstream-Status, X-Pinch-Source, X-Pinch-Tried',
    'Vary': 'Origin',
  }
}

export async function handle(request, env = {}) {
  const allowed = String(env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(',').map((s) => s.trim()).filter(Boolean)
  const origin = request.headers.get('Origin')
  const referer = request.headers.get('Referer') || ''
  // Browsers send Origin on cross-origin fetches. <img> tags send only a Referer.
  const callerOk = origin ? allowed.includes(origin) : allowed.some((a) => referer.startsWith(a + '/'))
  const cors = corsHeaders(origin && allowed.includes(origin) ? origin : allowed[0])
  const reply = (body, status, extra = {}) => new Response(body, { status, headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8', ...extra } })

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Max-Age': '86400' } })
  if (request.method !== 'GET') return reply('GET only', 405)

  const u = new URL(request.url)
  const path = u.pathname.replace(/\/+$/, '').split('/').pop() || ''
  if (path === '' && !u.searchParams.has('url')) return reply('ok', 200)
  if (!callerOk) return reply('This relay only answers its own app.', 403)

  const kind = path === 'img' ? 'img' : 'html' // "/fetch" or legacy "/?url="
  const target = u.searchParams.get('url') || ''
  if (!isPublicUrl(target)) return reply('Give me a public http(s) ?url=', 400)

  if (kind === 'html') {
    const r = await smartFetch(target, Date.now() + PAGE_DEADLINE_MS)
    const tried = r.tried.join(' | ').replace(/[^\x20-\x7e]/g, '?').slice(0, 1500)
    if (!r.ok) return reply(`Couldn't read the page. Tried: ${tried}`, 502, { 'X-Upstream-Status': String(r.status || 'error'), 'X-Pinch-Tried': tried })
    return new Response(r.text, {
      status: 200,
      headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=1800', 'X-Final-Url': r.finalUrl, 'X-Pinch-Source': r.source, 'X-Pinch-Tried': tried },
    })
  }

  // images
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    let last
    for (const ua of UAS) {
      const { res, finalUrl } = await fetchFollow(target, 'img', ua, ctl.signal)
      const type = res.headers.get('content-type') || ''
      if (Number(res.headers.get('content-length') || 0) > MAX_BYTES) return reply('Too large', 413)
      if (!res.ok || !/^image\//.test(type)) { last = reply(`Upstream ${res.status}`, 502, { 'X-Upstream-Status': String(res.status) }); continue }
      const bytes = await readCapped(res)
      return new Response(bytes, { status: 200, headers: { ...cors, 'Content-Type': type, 'Cache-Control': 'public, max-age=604800', 'X-Final-Url': finalUrl } })
    }
    return last
  } catch (e) {
    return reply(ctl.signal.aborted ? 'Timed out' : `Fetch failed: ${e?.message || e}`, e?.status || (ctl.signal.aborted ? 504 : 502))
  } finally {
    clearTimeout(timer)
  }
}

export default { fetch: (request, env) => handle(request, env) }
