/**
 * Cooking videos → recipe cards.
 *
 * Links (YouTube, Shorts, TikTok, Instagram): the relay's /video route reads the caption/description, any written-recipe
 * link in it, and TikTok's own subtitles (or listens to the TikTok when it has none). If the description links to a
 * written recipe, that page is read with the normal extractor. Otherwise the relay's /structure route (Workers AI) writes
 * the card from what the cook said plus the caption, using only ingredients that appear in that text.
 *
 * Uploads (camera roll, screen recordings, saved videos): the sound is decoded on the phone, cut into 2-minute 16 kHz
 * clips, and each clip is transcribed by the relay's /transcribe route (Workers AI Whisper).
 */
import type { IngredientGroup, ParsedRecipe } from './types'
import { relayBase, absolute } from './config'
import { extractRecipe } from './fetcher'
import { fromText } from './parse'
import { hostLabel } from './text'

export type VideoPlatform = 'youtube' | 'tiktok' | 'instagram' | 'facebook'
export type VideoStage = 'finding' | 'recipe-page' | 'listening' | 'writing' | 'opening'

export const PLATFORM_NAME: Record<VideoPlatform, string> = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook' }

export function videoPlatform(raw: string): VideoPlatform | null {
  let u: URL
  try { u = new URL(raw) } catch { return null }
  const h = u.hostname.toLowerCase().replace(/^(www|m|vm|vt|music)\./, '')
  if (h === 'youtu.be' || h === 'youtube.com' || h === 'youtube-nocookie.com') return /\/(watch|shorts|live|embed)|^\/[\w-]{11}$/.test(u.pathname) || u.searchParams.has('v') ? 'youtube' : null
  if (h === 'tiktok.com' || h.endsWith('.tiktok.com')) return 'tiktok'
  if (h === 'instagram.com' || h === 'instagr.am') return /\/(reel|reels|p|tv)\//.test(u.pathname) ? 'instagram' : null
  if (h === 'facebook.com' || h === 'fb.watch') return /\/(watch|reel|videos|share\/[vr])|fb\.watch/.test(u.href) ? 'facebook' : null
  return null
}

export type VideoErrorKind = 'no-relay' | 'offline' | 'unavailable' | 'no-recipe' | 'quota' | 'too-long' | 'unsupported' | 'no-audio' | 'cancelled'
export class VideoError extends Error {
  kind: VideoErrorKind
  platform?: VideoPlatform
  constructor(kind: VideoErrorKind, message: string, platform?: VideoPlatform) {
    super(message)
    this.kind = kind
    this.platform = platform
  }
}

export interface VideoInfo {
  platform: VideoPlatform
  url: string
  title?: string
  author?: string
  description?: string
  thumbnail?: string
  duration?: number
  transcript?: string
  transcriptSource?: 'captions' | 'whisper' | null
  recipeLinks?: string[]
  note?: string
}

export interface StructuredRecipe {
  is_recipe: boolean
  title: string
  servings?: string
  total_minutes?: number
  ingredients: { group?: string; text: string; uncertain?: boolean }[]
  steps: string[]
  notes: string[]
}

function relay(): string {
  const base = relayBase()
  if (!base) throw new VideoError('no-relay', 'Videos need the Pinch relay. Add it in Backup & settings.')
  return absolute(base)
}

async function call<T>(path: string, init: RequestInit & { signal?: AbortSignal }, platform?: VideoPlatform): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new VideoError('offline', 'You’re offline right now.', platform)
  let res: Response
  try {
    res = await fetch(`${relay()}/${path}`, init)
  } catch (e: any) {
    if (init.signal?.aborted) throw new VideoError('cancelled', 'Cancelled', platform)
    throw new VideoError('unavailable', 'Couldn’t reach the Pinch relay. Check your signal and try again.', platform)
  }
  let body: any = {}
  try { body = await res.json() } catch { /* not json */ }
  if (!res.ok) {
    const kind: VideoErrorKind = body.error === 'quota' ? 'quota' : body.error === 'unsupported' ? 'unsupported' : body.error === 'too-large' ? 'too-long' : 'unavailable'
    throw new VideoError(kind, body.message || `The relay said ${res.status}.`, body.platform || platform)
  }
  return body as T
}

const words = (s?: string) => (s || '').trim()
const isVagueTitle = (t: string) => !t || /^(img|vid|mov|rpreplay|screen ?recording|trim|video|final|untitled)[\s_\-.\d]*/i.test(t) || /^[\w-]{6,}$/.test(t) && /\d{3,}/.test(t)

/** Hashtags, emoji and "#shorts" don't belong in a card title. */
export function tidyTitle(t: string): string {
  return t
    .replace(/#[\p{L}\p{N}_]+/gu, '')
    .replace(/\p{Extended_Pictographic}|\uFE0F/gu, '')
    .replace(/\s*[|•·–-]\s*(tiktok|youtube|instagram|shorts?)\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s:–-]+|[\s:–-]+$/g, '')
    .trim()
    .slice(0, 120)
}

const HAS_QTY = /^\s*(\d|[½⅓⅔¼¾⅕⅛⅜⅝⅞]|a |an |one |two |three |four |five |six |half |a few |few |several |some |pinch|dash|splash|handful|to taste)/i

/** Turn the relay's structured answer into a normal Pinch recipe. */
export function toParsed(rec: StructuredRecipe, info: { url: string; siteName: string; author?: string; image?: string; heard: boolean; fallbackTitle?: string }): ParsedRecipe {
  const groups: IngredientGroup[] = []
  const vague: string[] = []
  for (const it of rec.ingredients || []) {
    const text = words(it.text)
    if (!text) continue
    const title = words(it.group) || undefined
    let g = groups.find((x) => x.title === title)
    if (!g) { g = { title, items: [] }; groups.push(g) }
    g.items.push(text)
    const unsaid = it.uncertain || !HAS_QTY.test(text)
    if (unsaid && !/to taste|as needed|as necessary|for (serving|garnish)|optional/i.test(text)) vague.push(text.replace(/,.*$/, '').replace(/^(a |an |some )/i, ''))
  }
  // a lone untitled group shouldn't carry an empty title
  if (groups.length === 1) delete groups[0].title
  const notes = [...(rec.notes || [])]
  if (vague.length) {
    const list = vague.slice(0, 5).join(', ') + (vague.length > 5 ? '…' : '')
    notes.push(`${info.heard ? 'The cook didn’t say exact amounts' : 'No exact amounts given'} for: ${list}. Go by eye and taste.`)
  }
  const servings = parseInt(String(rec.servings || ''), 10)
  return {
    title: tidyTitle(words(rec.title)) || tidyTitle(info.fallbackTitle || '') || 'A recipe from a video',
    url: info.url,
    siteName: info.siteName,
    author: info.author || undefined,
    image: info.image || undefined,
    totalTime: rec.total_minutes && rec.total_minutes > 0 ? rec.total_minutes : undefined,
    yieldText: rec.servings ? (Number.isFinite(servings) && String(servings) === String(rec.servings).trim() ? `Serves ${servings}` : String(rec.servings)) : undefined,
    servings: Number.isFinite(servings) && servings > 0 ? servings : undefined,
    ingredients: groups,
    instructions: rec.steps?.length ? [{ steps: rec.steps.map(words).filter(Boolean) }] : [],
    notes,
    tags: [],
    extractedVia: 'video',
  }
}

const cleanDescription = (d: string) =>
  d.split('\n').filter((l) => !/^\s*(follow|subscribe|order my|shop|get my|use code|sponsored|#\w+(\s+#\w+)*\s*$)/i.test(l)).join('\n').trim()

/** A pasted video link → a recipe. */
export async function recipeFromVideoLink(
  url: string,
  opts: { signal?: AbortSignal; onStage?: (s: VideoStage, detail?: string) => void } = {},
): Promise<{ recipe: ParsedRecipe; partial: boolean; via: string; info: VideoInfo }> {
  const platform = videoPlatform(url) || undefined
  opts.onStage?.('finding')
  const info = await call<VideoInfo>(`video?url=${encodeURIComponent(url)}`, { signal: opts.signal }, platform)
  const site = `${info.author ? info.author + ' · ' : ''}${PLATFORM_NAME[info.platform]}`

  // 1. The description links to a written recipe: that has exact amounts, so read it.
  for (const link of (info.recipeLinks || []).slice(0, 2)) {
    if (opts.signal?.aborted) break
    opts.onStage?.('recipe-page', hostLabel(link))
    try {
      const ctl = new AbortController()
      const stop = () => ctl.abort()
      opts.signal?.addEventListener('abort', stop)
      const t = setTimeout(stop, 30000)
      const got = await extractRecipe(link, { signal: ctl.signal }).finally(() => { clearTimeout(t); opts.signal?.removeEventListener('abort', stop) })
      if (!got.partial) {
        const r = got.recipe
        return {
          recipe: { ...r, url: info.url, siteName: site, author: r.author || info.author, image: r.image || info.thumbnail, notes: [...r.notes, `Written recipe: ${link}`], extractedVia: 'video' },
          partial: false,
          via: `recipe page ${hostLabel(link)}`,
          info,
        }
      }
    } catch { /* fall through to the video's own words */ }
  }
  if (opts.signal?.aborted) throw new VideoError('cancelled', 'Cancelled', info.platform)

  // 2. Write it from what the cook said + the caption.
  const description = cleanDescription(info.description || '')
  const transcript = words(info.transcript)
  if (transcript.length + description.length < 25) {
    throw new VideoError('no-recipe', info.note || 'There were no words to read on that video.', info.platform)
  }
  opts.onStage?.(transcript ? 'writing' : 'writing', transcript ? 'heard' : 'caption')
  let rec: StructuredRecipe | undefined
  try {
    rec = (await call<{ recipe: StructuredRecipe }>('structure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: info.title, description, transcript }),
      signal: opts.signal,
    }, info.platform)).recipe
  } catch (e) {
    // The AI is out for today: a caption that's a full written recipe can still be sorted the old way.
    const plain = description ? fromText(description, info.url) : undefined
    if (plain && plain.ingredients.length && plain.instructions.length) {
      return { recipe: { ...plain, url: info.url, siteName: site, author: info.author, image: info.thumbnail, extractedVia: 'video' }, partial: false, via: 'caption text', info }
    }
    throw e
  }
  if (!rec.is_recipe || (!rec.ingredients.length && !rec.steps.length)) {
    throw new VideoError('no-recipe', transcript ? 'I listened, but didn’t hear a recipe in that one.' : (info.note || 'The caption doesn’t have the recipe in it.'), info.platform)
  }
  const recipe = toParsed(rec, { url: info.url, siteName: site, author: info.author, image: info.thumbnail, heard: !!transcript, fallbackTitle: info.title || description.split('\n')[0] })
  return { recipe, partial: !recipe.ingredients.length || !recipe.instructions.length, via: info.transcriptSource ? `video ${info.transcriptSource}` : 'video caption', info }
}

// ───────────────────────────── uploads ─────────────────────────────

const RATE = 16000
const CHUNK_SECONDS = 120
const MAX_SECONDS = 40 * 60
const MAX_FILE_BYTES = 900 * 1024 * 1024
const RAW_FALLBACK_BYTES = 9 * 1024 * 1024

function wav(samples: Float32Array): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, RATE, true)
  v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, samples.length * 2, true)
  let o = 44
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(b)
  })
}

/** Decode a video/audio file's sound on the phone, as 16 kHz mono. */
export async function decodeToMono16k(file: Blob): Promise<Float32Array> {
  const data = await file.arrayBuffer()
  const OAC: typeof OfflineAudioContext = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext
  const ctx = new OAC(1, RATE, RATE)
  const audio: AudioBuffer = await new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(data, resolve, reject)
    if (p && typeof (p as any).then === 'function') (p as Promise<AudioBuffer>).then(resolve, reject)
  })
  let mono: Float32Array
  if (audio.sampleRate === RATE && audio.numberOfChannels === 1) mono = audio.getChannelData(0)
  else {
    // resample + mix down
    const off = new OAC(1, Math.max(1, Math.ceil(audio.duration * RATE)), RATE)
    const src = off.createBufferSource()
    src.buffer = audio
    src.connect(off.destination)
    src.start()
    mono = (await off.startRendering()).getChannelData(0)
  }
  return mono
}

/** A still from the video to use as the card's photo (the finished dish is usually near the end). */
export function posterFrom(file: Blob, ms = 8000): Promise<string | undefined> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || !/^video\//.test(file.type || 'video/')) return resolve(undefined)
    const v = document.createElement('video')
    const url = URL.createObjectURL(file)
    let settled = false
    const done = (out?: string) => { if (settled) return; settled = true; clearTimeout(t); URL.revokeObjectURL(url); v.removeAttribute('src'); v.load(); resolve(out) }
    const t = setTimeout(() => done(undefined), ms)
    v.muted = true
    v.playsInline = true
    v.preload = 'auto'
    v.onloadedmetadata = () => {
      const d = Number.isFinite(v.duration) ? v.duration : 0
      v.currentTime = d > 2 ? Math.min(d - 0.5, d * 0.85) : 0.1
    }
    v.onseeked = () => {
      try {
        if (!v.videoWidth) return done(undefined)
        const scale = Math.min(1, 900 / Math.max(v.videoWidth, v.videoHeight))
        const c = document.createElement('canvas')
        c.width = Math.round(v.videoWidth * scale)
        c.height = Math.round(v.videoHeight * scale)
        c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height)
        done(c.toDataURL('image/jpeg', 0.8))
      } catch { done(undefined) }
    }
    v.onerror = () => done(undefined)
    v.src = url
  })
}

/** Cut long silences' worth of near-zero clips so we don't spend listening time on them. */
const loud = (s: Float32Array) => { let m = 0; for (let i = 0; i < s.length; i += 50) m = Math.max(m, Math.abs(s[i])); return m > 0.01 }

export async function recipeFromVideoFile(
  file: File,
  opts: { signal?: AbortSignal; onStage?: (s: VideoStage, detail?: string) => void } = {},
): Promise<{ recipe: ParsedRecipe; partial: boolean; via: string; transcript: string }> {
  relay()
  if (file.size > MAX_FILE_BYTES) throw new VideoError('too-long', 'That video file is very big. Trim it in Photos to the cooking part, or screen-record just that bit.')
  opts.onStage?.('opening')
  const poster = posterFrom(file).catch(() => undefined)
  let clips: string[] = []
  try {
    const mono = await decodeToMono16k(file)
    if (mono.length / RATE > MAX_SECONDS) throw new VideoError('too-long', `That video is over ${MAX_SECONDS / 60} minutes. Trim it to the cooking part and try again.`)
    const per = CHUNK_SECONDS * RATE
    for (let i = 0; i < mono.length; i += per) {
      const part = mono.subarray(i, Math.min(mono.length, i + per))
      if (part.length < RATE / 2 || !loud(part)) continue
      clips.push(await blobToBase64(wav(part)))
    }
    if (!clips.length) throw new VideoError('no-audio', 'That video seems to be silent, so there was nothing to listen to.')
  } catch (e) {
    if (e instanceof VideoError) throw e
    // Couldn't decode here: small files can go to the relay as they are (Whisper reads mp4/mov/m4a itself).
    if (file.size > RAW_FALLBACK_BYTES) throw new VideoError('no-audio', 'Couldn’t open the sound in that file on this phone. A screen recording of the video usually works.')
    clips = [await blobToBase64(file)]
  }

  const texts: string[] = new Array(clips.length).fill('')
  let done = 0
  opts.onStage?.('listening', clips.length > 1 ? `0 of ${clips.length}` : undefined)
  let next = 0
  const worker = async () => {
    while (next < clips.length) {
      if (opts.signal?.aborted) throw new VideoError('cancelled', 'Cancelled')
      const i = next++
      const r = await call<{ text: string }>('transcribe', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: clips[i], signal: opts.signal })
      texts[i] = r.text || ''
      done++
      if (clips.length > 1) opts.onStage?.('listening', `${done} of ${clips.length}`)
    }
  }
  await Promise.all([worker(), worker()])
  const transcript = texts.join(' ').replace(/\s+/g, ' ').trim()
  if (transcript.length < 25) throw new VideoError('no-recipe', 'I listened, but couldn’t make out any talking in that video.')

  opts.onStage?.('writing', 'heard')
  const name = file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim()
  const title = isVagueTitle(name) ? '' : name
  const rec = (await call<{ recipe: StructuredRecipe }>('structure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, description: '', transcript }),
    signal: opts.signal,
  })).recipe
  if (!rec.is_recipe || (!rec.ingredients.length && !rec.steps.length)) throw new VideoError('no-recipe', 'I listened, but didn’t hear a recipe in that one.')
  const recipe = toParsed(rec, { url: '', siteName: 'your video', heard: true, fallbackTitle: title, image: await poster })
  return { recipe, partial: !recipe.ingredients.length || !recipe.instructions.length, via: 'uploaded video', transcript }
}
