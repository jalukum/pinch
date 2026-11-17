/**
 * Pinch relay: cooking videos → text a recipe can be written from.
 *
 *   GET  /video?url=<video page>   → JSON { platform, title, author, description, thumbnail, transcript, transcriptSource, recipeLinks, duration, note }
 *   POST /transcribe               → body: base64 audio (WAV/MP4/M4A…), returns { text, seconds }   (Workers AI Whisper)
 *   POST /structure                → body: JSON { title, description, transcript }, returns { recipe }  (Workers AI Llama, strict JSON)
 *
 * What it reads, per platform (all as an ordinary signed-out visitor; no logins, cookies of anyone's, captchas or paywalls):
 *   - YouTube (watch, Shorts, youtu.be): title, channel, description and the links in it via the public watch-next data.
 *     YouTube refuses captions and audio to cloud servers ("Sign in to confirm you're not a bot"), so a spoken-only
 *     YouTube recipe needs the video file uploaded from the phone instead.
 *   - TikTok: caption text + TikTok's own subtitles (auto or creator). With no subtitles, the video's audio is transcribed.
 *   - Instagram Reels/posts: the post caption from the public embed. Reel audio isn't public, so upload for speech.
 */

const UA_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'
const WHISPER = '@cf/openai/whisper-large-v3-turbo'
const LLM = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
const MAX_VIDEO_BYTES = 20 * 1024 * 1024 // a TikTok we transcribe ourselves
const MAX_AUDIO_B64 = 14 * 1024 * 1024 // one /transcribe chunk (≈ 7 min of 16 kHz WAV)
const MAX_TEXT = 60000

export function videoPlatform(raw) {
  let u
  try { u = new URL(raw) } catch { return null }
  const h = u.hostname.toLowerCase().replace(/^(www|m|vm|vt|music)\./, '')
  if (h === 'youtu.be' || h === 'youtube.com' || h === 'youtube-nocookie.com') return 'youtube'
  if (h === 'tiktok.com' || h.endsWith('.tiktok.com')) return 'tiktok'
  if (h === 'instagram.com' || h === 'instagr.am') return 'instagram'
  if (h === 'facebook.com' || h === 'fb.watch') return 'facebook'
  return null
}

export function youtubeId(raw) {
  try {
    const u = new URL(raw)
    if (/youtu\.be$/.test(u.hostname)) return u.pathname.slice(1, 12) || null
    const v = u.searchParams.get('v')
    if (v) return v.slice(0, 11)
    const m = u.pathname.match(/\/(shorts|embed|live|v)\/([\w-]{11})/)
    return m ? m[2] : null
  } catch { return null }
}

const unescapeJson = (s) => { try { return JSON.parse('"' + s + '"') } catch { return s } }
const json = (cors, body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', ...extra } })

/** Links in a description that might be the written recipe (not shops, socials or the video sites themselves). */
const NOT_RECIPE = /(amazon\.|amzn\.|bit\.ly\/?$|instagram\.com|tiktok\.com|facebook\.com|twitter\.com|x\.com|youtube\.com|youtu\.be|pinterest\.|patreon\.com|linktr\.ee|target\.com|walmart\.com|barnesandnoble|booksamillion|bookshop\.org|hudsonbooksellers|indiebound|apple\.com|spotify\.com|discord|threads\.net|snapchat|ltk\.app|liketoknow|shopmy|geni\.us|rstyle\.me|merch|shop\.|store\.|substack\.com\/subscribe)/i
export function recipeLinksFrom(urls) {
  const out = []
  for (const raw of urls) {
    let u
    try { u = new URL(raw) } catch { continue }
    if (!/^https?:$/.test(u.protocol) || NOT_RECIPE.test(u.href)) continue
    if (u.pathname.length < 3) continue // a bare homepage isn't a recipe
    const href = u.href.replace(/[).,]+$/, '')
    if (!out.includes(href)) out.push(href)
  }
  // a link with "recipe" in it, or right after a "Recipe:" label, goes first
  return out.sort((a, b) => Number(/recipe/i.test(b)) - Number(/recipe/i.test(a))).slice(0, 3)
}

function vttToText(vtt) {
  const lines = []
  for (const line of String(vtt).split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t === 'WEBVTT' || /-->/.test(t) || /^\d+$/.test(t) || /^(NOTE|STYLE|Kind:|Language:)/.test(t)) continue
    const clean = t.replace(/<[^>]+>/g, '').trim()
    if (clean && clean !== lines[lines.length - 1]) lines.push(clean)
  }
  return lines.join(' ').replace(/\s+/g, ' ').trim()
}

async function getText(url, ua, extraHeaders = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': ua, 'Accept-Language': 'en-US,en;q=0.9', Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', ...extraHeaders }, redirect: 'follow' })
  return { res, text: await res.text() }
}

function toBase64(bytes) {
  // Buffer (nodejs_compat) is native and fast; fall back to chunked btoa elsewhere.
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64')
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

async function readBytes(res, cap) {
  if (Number(res.headers.get('content-length') || 0) > cap) throw Object.assign(new Error('too large'), { status: 413 })
  const reader = res.body.getReader()
  const chunks = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > cap) { reader.cancel(); throw Object.assign(new Error('too large'), { status: 413 }) }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.byteLength }
  return out
}

export function friendlyAiError(e) {
  const m = String(e?.message || e)
  if (/4006|daily free allocation|neurons|exceeded/i.test(m)) return { status: 429, error: 'quota', message: 'Pinch has used up today’s free listening time. It resets at 6 pm Central (midnight UTC).' }
  return { status: 502, error: 'ai', message: 'The listening helper hiccuped. Try again in a moment.' }
}

async function whisper(env, b64) {
  const r = await env.AI.run(WHISPER, { audio: b64, language: 'en', vad_filter: true })
  return { text: String(r?.text || '').trim(), seconds: r?.transcription_info?.duration || 0 }
}

// ───────────────────────────── platforms ─────────────────────────────

async function youtube(url) {
  const id = youtubeId(url)
  if (!id) throw Object.assign(new Error('That YouTube link has no video in it.'), { status: 400 })
  const out = { platform: 'youtube', id, url: `https://www.youtube.com/watch?v=${id}`, thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, transcript: '', transcriptSource: null }
  const res = await fetch('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA_DESKTOP, 'Accept-Language': 'en-US,en;q=0.9' },
    body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: '2.20261116.00.00', hl: 'en', gl: 'US' } }, videoId: id }),
  })
  const t = await res.text()
  const desc = t.match(/"attributedDescription":\{"content":"((?:[^"\\]|\\.)*)"/)
  out.description = desc ? unescapeJson(desc[1]) : ''
  const title = t.match(/"videoPrimaryInfoRenderer":\{"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/) || t.match(/"reelPlayerHeaderRenderer".*?"text":"((?:[^"\\]|\\.)*)"/)
  out.title = title ? unescapeJson(title[1]) : ''
  const owner = t.match(/"videoOwnerRenderer":\{"thumbnail".*?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/)
  out.author = owner ? unescapeJson(owner[1]) : ''
  if (!out.title || !out.author) {
    // oEmbed is tiny and reliable for title + channel
    try {
      const o = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(out.url)}`, { headers: { 'User-Agent': UA_DESKTOP } })
      if (o.ok) { const j = await o.json(); out.title ||= j.title || ''; out.author ||= j.author_name || '' }
    } catch {}
  }
  const links = [...t.matchAll(/"url":"https:\/\/www\.youtube\.com\/redirect\?[^"]*?[?&]q=([^"&]+)/g)].map((m) => { try { return decodeURIComponent(unescapeJson(m[1])) } catch { return '' } })
  const plain = (out.description.match(/https?:\/\/[^\s)]+/g) || []).filter((l) => !/\.\.\.$|…$/.test(l))
  out.recipeLinks = recipeLinksFrom([...links, ...plain])
  out.note = 'YouTube doesn’t share captions or audio with servers, so this used the description.'
  if (!res.ok && !out.description && !out.title) throw Object.assign(new Error('YouTube didn’t answer. Try again in a minute.'), { status: 502 })
  return out
}

async function tiktok(url, env) {
  const { res, text } = await getText(url, UA_DESKTOP)
  const cookies = (res.headers.getSetCookie ? res.headers.getSetCookie() : []).map((c) => c.split(';')[0]).join('; ')
  const m = text.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) throw Object.assign(new Error('TikTok didn’t show the video (it may be private or removed).'), { status: 502 })
  const detail = JSON.parse(m[1])?.__DEFAULT_SCOPE__?.['webapp.video-detail']
  const it = detail?.itemInfo?.itemStruct
  if (!it) throw Object.assign(new Error('TikTok says this video isn’t available.'), { status: 404 })
  const v = it.video || {}
  const out = {
    platform: 'tiktok',
    url: res.url || url,
    title: '',
    author: it.author?.nickname || it.author?.uniqueId || '',
    description: it.desc || '',
    thumbnail: v.originCover || v.cover || '',
    duration: v.duration || 0,
    transcript: '',
    transcriptSource: null,
  }
  out.recipeLinks = recipeLinksFrom(out.description.match(/https?:\/\/[^\s)]+/g) || [])
  // TikTok's own subtitles: prefer English, creator-made over auto (ASR)
  const subs = [...(v.subtitleInfos || [])].filter((s) => s.Url && /webvtt/i.test(s.Format || 'webvtt'))
  subs.sort((a, b) => Number(/^en/i.test(b.LanguageCodeName || '')) - Number(/^en/i.test(a.LanguageCodeName || '')) || Number(a.Source === 'ASR') - Number(b.Source === 'ASR'))
  for (const s of subs.slice(0, 2)) {
    try {
      const r = await fetch(s.Url, { headers: { 'User-Agent': UA_DESKTOP, Referer: 'https://www.tiktok.com/' } })
      if (!r.ok) continue
      const tx = vttToText(await r.text())
      if (tx.length > 20) { out.transcript = tx; out.transcriptSource = 'captions'; break }
    } catch {}
  }
  // No subtitles: listen to it ourselves (Workers AI Whisper), if it's a reasonable size.
  const addr = v.playAddr || v.downloadAddr
  if (!out.transcript && addr && env.AI) {
    try {
      const vr = await fetch(addr, { headers: { 'User-Agent': UA_DESKTOP, Referer: 'https://www.tiktok.com/', Cookie: cookies } })
      if (vr.ok) {
        const bytes = await readBytes(vr, MAX_VIDEO_BYTES)
        const w = await whisper(env, toBase64(bytes))
        if (w.text) { out.transcript = w.text; out.transcriptSource = 'whisper' }
      }
    } catch (e) {
      out.note = e?.status === 413 ? 'This TikTok is too long to listen to here; upload it instead.' : friendlyAiError(e).message
    }
  }
  return out
}

async function instagram(url) {
  const m = new URL(url).pathname.match(/\/(reel|reels|p|tv)\/([\w-]+)/)
  if (!m) throw Object.assign(new Error('That Instagram link isn’t a post or reel.'), { status: 400 })
  const code = m[2]
  const { text } = await getText(`https://www.instagram.com/p/${code}/embed/captioned/`, UA_IPHONE)
  const out = { platform: 'instagram', url: `https://www.instagram.com/reel/${code}/`, title: '', author: '', description: '', thumbnail: '', transcript: '', transcriptSource: null }
  const ctx = text.match(/"contextJSON":("(?:[^"\\]|\\.)*")/)
  if (ctx) {
    try {
      const d = JSON.parse(JSON.parse(ctx[1]))
      const sm = d?.gql_data?.shortcode_media || {}
      out.description = sm.edge_media_to_caption?.edges?.[0]?.node?.text || ''
      out.author = sm.owner?.full_name || sm.owner?.username || ''
      out.thumbnail = sm.display_url || sm.thumbnail_src || ''
      out.duration = sm.video_duration || 0
    } catch {}
  }
  if (!out.description) {
    const cap = text.match(/class="Caption"[^>]*>([\s\S]*?)<div class="CaptionComments"/)
    if (cap) out.description = cap[1].replace(/<br\s*\/?>/gi, '\n').replace(/<a [^>]*class="CaptionUsername"[^>]*>[\s\S]*?<\/a>/, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#039;|&#39;/g, "'").replace(/&quot;/g, '"').trim()
    const user = text.match(/class="UsernameText"[^>]*>([^<]+)/)
    if (user) out.author ||= user[1].trim()
    const img = text.match(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/)
    if (img) out.thumbnail ||= img[1].replace(/&amp;/g, '&')
  }
  out.recipeLinks = recipeLinksFrom(out.description.match(/https?:\/\/[^\s)]+/g) || [])
  out.note = 'Instagram keeps reel audio behind a login, so this used the caption.'
  if (!out.description) throw Object.assign(new Error('Instagram didn’t show this post (it may be private).'), { status: 404 })
  return out
}

// ───────────────────────────── recipe writing ─────────────────────────────

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    servings: { type: 'string' },
    total_minutes: { type: 'number' },
    ingredients: { type: 'array', items: { type: 'object', properties: { group: { type: 'string' }, text: { type: 'string' }, uncertain: { type: 'boolean' } }, required: ['text'] } },
    steps: { type: 'array', items: { type: 'string' } },
    notes: { type: 'array', items: { type: 'string' } },
    is_recipe: { type: 'boolean' },
  },
  required: ['title', 'ingredients', 'steps', 'is_recipe'],
}

const SYSTEM = `You turn a cooking video into a recipe card. You get the video's title, its caption/description, and a transcript of what the cook says out loud (the transcript may be missing).
Rules:
- Use ONLY ingredients actually named in the transcript or the description. Never add an ingredient, amount, time or temperature that isn't there.
- One ingredient per line: amount + unit + ingredient (+ short prep), e.g. "2 cups all-purpose flour" or "3 cloves garlic, minced". Write spoken numbers as digits ("two and a half cups" -> "2 1/2 cups").
- If the description lists exact amounts, use them. If no amount is given anywhere, write the ingredient alone, or the cook's own vague words ("a splash of milk", "salt, to taste"), and set uncertain=true.
- If the cook gives two amounts (cups and grams), keep both: "2 cups (240 g) flour".
- Use "group" only when the cook clearly splits the recipe (e.g. "Sauce", "Dough"); otherwise leave it empty.
- steps: short imperative sentences, in the order the cook does them, keeping times, temperatures and doneness cues they say. Leave out chatter, jokes, sponsor reads and "like and subscribe".
- notes: up to 4 useful tips the cook actually gives (substitutions, make-ahead, storage). No commentary of your own.
- title: the dish's name, short (no hashtags, no channel name, no emojis).
- servings and total_minutes only if stated.
- is_recipe: true whenever the video shows how to make a dish (even a simple one). false only when nothing is cooked or made at all.
Reply with JSON only.`

const UNITS = new Set('cup cups tbsp tsp tablespoon tablespoons teaspoon teaspoons gram grams g kg oz ounce ounces lb lbs pound pounds ml l liter liters litre quart pint pinch dash splash handful clove cloves can cans package stick sticks slice slices large small medium big whole fresh chopped minced diced sliced grated finely roughly thinly about some little bit more taste optional room temperature cold warm melted softened unsalted salted plus divided for of and the to a an or into cut peeled'.split(' '))

/** Drop any ingredient whose words never appear in the source text (a guard against invented items). */
export function groundIngredients(items, source) {
  const src = ' ' + source.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ') + ' '
  const stem = (w) => w.replace(/(ies)$/, 'y').replace(/(es|s)$/, '')
  const srcStems = new Set(src.split(' ').filter(Boolean).map(stem))
  return items.filter((it) => {
    const words = String(it.text || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !UNITS.has(w))
    if (!words.length) return false
    return words.some((w) => srcStems.has(stem(w)) || src.includes(' ' + w))
  })
}

async function structure(env, body) {
  const title = String(body.title || '').slice(0, 300)
  const description = String(body.description || '').slice(0, 8000)
  const transcript = String(body.transcript || '').slice(0, MAX_TEXT)
  if (description.length + transcript.length < 15) throw Object.assign(new Error('Nothing to read.'), { status: 400 })
  const user = `VIDEO TITLE: ${title || '(none)'}\n\nDESCRIPTION:\n${description || '(none)'}\n\nTRANSCRIPT:\n${transcript || '(none)'}`
  const r = await env.AI.run(LLM, {
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
    response_format: { type: 'json_schema', json_schema: SCHEMA },
    max_tokens: 2500,
    temperature: 0.1,
  })
  let rec = r?.response ?? r?.choices?.[0]?.message?.content
  if (typeof rec === 'string') rec = JSON.parse(rec.replace(/^```(json)?|```$/g, '').trim())
  if (!rec || typeof rec !== 'object') throw new Error('no json')
  const source = `${title}\n${description}\n${transcript}`
  const raw = Array.isArray(rec.ingredients) ? rec.ingredients : []
  const kept = groundIngredients(raw.filter((i) => i && typeof i.text === 'string' && i.text.trim()), source)
  return {
    is_recipe: rec.is_recipe !== false && (kept.length > 0 || (rec.steps || []).length > 0),
    title: String(rec.title || title || '').trim(),
    servings: rec.servings ? String(rec.servings) : '',
    total_minutes: Number(rec.total_minutes) > 0 ? Math.round(Number(rec.total_minutes)) : 0,
    ingredients: kept.map((i) => ({ group: String(i.group || '').trim(), text: i.text.trim(), uncertain: !!i.uncertain })),
    steps: (rec.steps || []).map((s) => String(s).trim()).filter(Boolean),
    notes: (rec.notes || []).map((s) => String(s).trim()).filter(Boolean).slice(0, 4),
    dropped: raw.length - kept.length,
  }
}

async function sha(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40)
}

/** Edge-cache JSON answers so a re-paste doesn't spend free AI time twice. */
async function cached(key, ttl, make, keep = () => true) {
  const cache = typeof caches !== 'undefined' ? caches.default : null
  const req = new Request(`https://pinch-cache.invalid/${key}`)
  if (cache) { const hit = await cache.match(req); if (hit) return hit.json() }
  const val = await make()
  if (cache && keep(val)) await cache.put(req, new Response(JSON.stringify(val), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` } }))
  return val
}

// ───────────────────────────── routes ─────────────────────────────

export async function handleVideo(path, request, env, cors, isPublicUrl) {
  try {
    if (path === 'video') {
      const target = new URL(request.url).searchParams.get('url') || ''
      if (!isPublicUrl(target)) return json(cors, { error: 'bad-url', message: 'Give me a public video link.' }, 400)
      const platform = videoPlatform(target)
      if (!platform) return json(cors, { error: 'not-video', message: 'That isn’t a YouTube, TikTok or Instagram link.' }, 400)
      if (platform === 'facebook') return json(cors, { error: 'unsupported', platform, message: 'Facebook videos sit behind a login.' }, 422)
      const key = 'v1-' + (await sha(platform + '|' + (platform === 'youtube' ? youtubeId(target) : target.split('?')[0])))
      const out = await cached(key, 6 * 3600, () => (platform === 'youtube' ? youtube(target) : platform === 'tiktok' ? tiktok(target, env) : instagram(target)), (v) => !!(v.transcript || v.description))
      return json(cors, out)
    }
    if (!env.AI) return json(cors, { error: 'ai', message: 'Workers AI isn’t set up on this relay.' }, 501)
    if (path === 'transcribe') {
      const b64 = (await request.text()).replace(/^data:[^,]*,/, '').trim()
      if (b64.length < 100) return json(cors, { error: 'empty', message: 'That clip was empty.' }, 400)
      if (b64.length > MAX_AUDIO_B64) return json(cors, { error: 'too-large', message: 'That clip is too big for one go.' }, 413)
      const out = await whisper(env, b64)
      return json(cors, out)
    }
    if (path === 'structure') {
      const body = await request.json()
      const key = 's2-' + (await sha(JSON.stringify([body.title, body.description, body.transcript])))
      const recipe = await cached(key, 7 * 86400, () => structure(env, body), (r) => r.is_recipe && r.ingredients.length > 0)
      return json(cors, { recipe })
    }
  } catch (e) {
    if (e?.status) return json(cors, { error: 'fetch', message: e.message }, e.status)
    const f = friendlyAiError(e)
    return json(cors, { error: f.error, message: f.message, detail: String(e?.message || e).slice(0, 200) }, f.status)
  }
  return json(cors, { error: 'not-found' }, 404)
}
