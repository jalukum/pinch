import { useCallback, useEffect, useRef, useState } from 'react'
import type { Recipe } from './lib/types'
import { extractRecipe, normalizeUrl, ExtractError, CUSTOM_PROXY_KEY, type Attempt } from './lib/fetcher'
import { fromText } from './lib/parse'
import { blankRecipe } from './lib/edit'
import { FUSSY, fussyFor } from './lib/fussy'
import { relayBase } from './lib/config'
import { store, newId, requestPersistence, validateBackup, type Backup } from './lib/storage'
import { cacheImage } from './lib/image'
import { formatMinutes } from './lib/duration'
import { hostLabel } from './lib/text'
import { RecipeView } from './components/RecipeView'
import { Sheet } from './components/Sheet'
import { Editor, PasteText } from './components/Editor'
import { ThemeToggle } from './components/ThemeToggle'
import { Backdrop } from './components/Backdrop'
import { Divider, EmptyArt, Stamp, SvgDefs, Tape } from './components/Ornaments'
import { IconBox, IconClip, IconClock, IconNote, IconPencil, IconWhisk } from './components/Icons'

type Route = { name: 'home' } | { name: 'recipe'; id: string } | { name: 'draft' }

function readRoute(): Route {
  const h = location.hash
  const m = /^#\/r\/([\w-]+)/.exec(h)
  if (m) return { name: 'recipe', id: m[1] }
  if (h.startsWith('#/new')) return { name: 'draft' }
  return { name: 'home' }
}

type Status =
  | { s: 'idle' }
  | { s: 'loading'; url: string; step: number }
  | { s: 'error'; url: string; kind: ExtractError['kind'] | 'bad-url'; attempts: Attempt[] }

const LOADING_LINES = ['Fetching the page…', 'Knocking on the kitchen door…', 'Trying the side entrance…', 'Reading the recipe card…', 'Still stirring…', 'One last try…']

export default function App() {
  const [route, setRoute] = useState<Route>(readRoute)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState<Recipe | null>(null)
  const [justSaved, setJustSaved] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>({ s: 'idle' })
  const [input, setInput] = useState('')
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Recipe | null>(null)
  const [settings, setSettings] = useState(false)
  const [draftPartial, setDraftPartial] = useState(false)
  const [editing, setEditing] = useState<{ recipe: Recipe; isNew: boolean } | null>(null)
  const [pasteFor, setPasteFor] = useState<string | null>(null) // null = closed; '' = no link
  const [fussyOpen, setFussyOpen] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const toast = useCallback((m: string) => {
    setToastMsg(m)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600)
  }, [])

  const refresh = useCallback(async () => {
    try {
      setRecipes(await store.all())
    } catch {
      toast('Storage is unavailable in this browser mode')
    }
    setLoaded(true)
  }, [toast])

  useEffect(() => {
    refresh()
    const onHash = () => setRoute(readRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [refresh])

  const go = (hash: string) => {
    if (location.hash !== hash) location.hash = hash
    else setRoute(readRoute())
  }

  const submit = useCallback(
    async (raw: string) => {
      const url = normalizeUrl(raw)
      if (!url) {
        setStatus({ s: 'error', url: raw, kind: 'bad-url', attempts: [] })
        return
      }
      const existing = recipes.find((r) => r.url === url)
      if (existing) {
        setInput('')
        go(`#/r/${existing.id}`)
        toast('Already in your box')
        return
      }
      abort.current?.abort()
      const ctl = new AbortController()
      abort.current = ctl
      setStatus({ s: 'loading', url, step: 0 })
      try {
        const { recipe, attempts, via, partial } = await extractRecipe(url, {
          signal: ctl.signal,
          onProgress: (_n, i) => setStatus((st) => (st.s === 'loading' ? { ...st, step: i - 1 } : st)),
        })
        if (ctl.signal.aborted) return
        console.info('[pinch] extracted via', via, attempts)
        setDraft({ ...recipe, id: newId() })
        setDraftPartial(!!partial)
        setStatus({ s: 'idle' })
        setInput('')
        go('#/new')
      } catch (e: any) {
        if (ctl.signal.aborted) return
        const err = e instanceof ExtractError ? e : new ExtractError('blocked', String(e), [])
        console.info('[pinch] failed', err.attempts)
        setStatus({ s: 'error', url, kind: err.kind, attempts: err.attempts })
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recipes, toast],
  )

  // Deep link: ?url=… or #/add?url=… (handy for an iOS Shortcut / share sheet)
  useEffect(() => {
    if (!loaded) return
    const q = new URLSearchParams(location.search).get('url') || new URLSearchParams(location.hash.split('?')[1] || '').get('url')
    if (q) {
      history.replaceState(null, '', location.pathname)
      setInput(q)
      submit(q)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (t) {
        setInput(t.trim())
        if (normalizeUrl(t)) submit(t)
      } else toast('Your clipboard is empty')
    } catch {
      toast('Tap the field and choose Paste')
      document.getElementById('paste-input')?.focus()
    }
  }

  const save = async (r: Recipe) => {
    const rec: Recipe = { ...r, savedAt: Date.now() }
    await store.put(rec)
    setJustSaved(rec.id)
    setDraft(null)
    await refresh()
    history.replaceState(null, '', `#/r/${rec.id}`)
    setRoute({ name: 'recipe', id: rec.id })
    requestPersistence()
    // cache the photo for offline in the background
    if (rec.image && !rec.imageData) {
      cacheImage(rec.image).then(async (data) => {
        if (!data) return
        await store.put({ ...rec, imageData: data })
        refresh()
      })
    }
  }

  /** Pasted text → a draft card (or the hand editor when it can't be sorted). */
  const parsePasted = (text: string, url: string) => {
    const r = fromText(text, url)
    setPasteFor(null)
    setStatus({ s: 'idle' })
    if (r) {
      const host = url ? hostLabel(url) : 'by hand'
      setDraft({ ...r, id: newId(), url, siteName: url ? host : 'by hand' })
      setDraftPartial(false)
      go('#/new')
      return true
    }
    const blank = blankRecipe(newId(), url)
    setEditing({ recipe: { ...blank, notes: text.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 60) }, isNew: true })
    toast('Couldn’t sort that one; tidy it up here')
    return true
  }

  const finishEdit = async (r: Recipe) => {
    setEditing(null)
    if (r.savedAt && recipes.some((x) => x.id === r.id)) {
      await store.put(r)
      await refresh()
      if (r.image && !r.imageData) cacheImage(r.image).then(async (d) => { if (d) { await store.put({ ...r, imageData: d }); refresh() } })
      go(`#/r/${r.id}`)
      toast('Card updated')
    } else {
      setDraft(r)
      setDraftPartial(false)
      go('#/new')
    }
  }

  const writeByHand = (url = '') => {
    setStatus({ s: 'idle' })
    setEditing({ recipe: draft && draft.url === url && url ? draft : blankRecipe(newId(), url), isNew: true })
  }

  const doDelete = async (r: Recipe) => {
    await store.remove(r.id)
    try {
      localStorage.removeItem(`pinch.progress.${r.id}`)
    } catch {
      /* ignore */
    }
    setConfirm(null)
    await refresh()
    go('#/')
    toast('Card removed from the box')
  }

  const exportBackup = () => {
    const data: Backup = { app: 'pinch', version: 1, exportedAt: new Date().toISOString(), recipes }
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `pinch-recipes-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  }

  const importBackup = async (file: File) => {
    try {
      const list = validateBackup(JSON.parse(await file.text()))
      for (const r of list) await store.put(r)
      await refresh()
      toast(`Filed ${list.length} card${list.length === 1 ? '' : 's'} from backup`)
      setSettings(false)
    } catch (e: any) {
      toast(e?.message || 'Couldn’t read that file')
    }
  }

  // ───────── routes ─────────
  let page: React.ReactNode
  const current = route.name === 'recipe' ? recipes.find((r) => r.id === route.id) : route.name === 'draft' ? draft : null

  if (editing) {
    page = <Editor key={editing.recipe.id} recipe={editing.recipe} isNew={editing.isNew} onCancel={() => setEditing(null)} onDone={finishEdit} />
  } else if ((route.name === 'recipe' || route.name === 'draft') && current) {
    page = (
      <RecipeView
        key={current.id}
        recipe={current}
        saved={route.name === 'recipe'}
        justSaved={justSaved === current.id}
        onBack={() => go('#/')}
        onSave={() => save(current)}
        onDelete={() => setConfirm(current)}
        onEdit={() => setEditing({ recipe: current, isNew: false })}
        partial={route.name === 'draft' && draftPartial}
        toast={toast}
      />
    )
  } else {
    page = (
      <Home
        recipes={recipes}
        loaded={loaded}
        input={input}
        setInput={setInput}
        status={status}
        onSubmit={() => submit(input)}
        onPaste={paste}
        onCancel={() => {
          abort.current?.abort()
          setStatus({ s: 'idle' })
        }}
        onDismiss={() => setStatus({ s: 'idle' })}
        onOpen={(id) => go(`#/r/${id}`)}
        onSettings={() => setSettings(true)}
        onPasteText={(u) => setPasteFor(u)}
        onWrite={writeByHand}
        onFussy={() => setFussyOpen(true)}
      />
    )
  }

  return (
    <>
      <SvgDefs />
      <Backdrop />
      <main className="app">{page}</main>

      <Sheet open={!!confirm} onClose={() => setConfirm(null)} label="Remove recipe">
        {confirm && (
          <div className="confirm">
            <h2>Take this card out of the box?</h2>
            <p>“{confirm.title}” will be removed from this phone. You can always paste the link again.</p>
            <div className="sheet__actions">
              <button className="btn btn--quiet" onClick={() => setConfirm(null)}>Keep it</button>
              <button className="btn btn--danger" onClick={() => doDelete(confirm)}>Remove card</button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={pasteFor !== null} onClose={() => setPasteFor(null)} label="Paste the recipe text">
        <PasteText onParse={(t) => parsePasted(t, pasteFor || '')} onClose={() => setPasteFor(null)} />
      </Sheet>

      <Sheet open={fussyOpen} onClose={() => setFussyOpen(false)} label="A note on fussy sites">
        <FussyNote onClose={() => setFussyOpen(false)} />
      </Sheet>

      <Sheet open={settings} onClose={() => setSettings(false)} label="Backup and settings">
        <Settings recipes={recipes} onExport={exportBackup} onImport={importBackup} onClose={() => setSettings(false)} onFussy={() => { setSettings(false); setFussyOpen(true) }} />
      </Sheet>

      <div className={`toast ${toastMsg ? 'is-on' : ''}`} role="status" aria-live="polite">{toastMsg}</div>
    </>
  )
}

// ───────────────────────────── Home ─────────────────────────────

function Home(p: {
  recipes: Recipe[]
  loaded: boolean
  input: string
  setInput: (s: string) => void
  status: Status
  onSubmit: () => void
  onPaste: () => void
  onCancel: () => void
  onDismiss: () => void
  onOpen: (id: string) => void
  onSettings: () => void
  onPasteText: (url: string) => void
  onWrite: (url?: string) => void
  onFussy: () => void
}) {
  const loading = p.status.s === 'loading'
  return (
    <div className="home">
      <header className="masthead">
        <ThemeToggle />
        <h1 className="wordmark">Pinch<span className="wordmark__dot">.</span></h1>
        <p className="masthead__sub">a little recipe box</p>
      </header>

      <form
        className={`ticket ${loading ? 'is-busy' : ''}`}
        onSubmit={(e) => {
          e.preventDefault()
          if (!loading) p.onSubmit()
        }}
      >
        <div className="ticket__stub" aria-hidden>
          <span>No.</span>
          <strong>{String(p.recipes.length + 1).padStart(3, '0')}</strong>
        </div>
        <div className="ticket__body">
          <label htmlFor="paste-input" className="ticket__label">Paste a recipe link</label>
          <input
            id="paste-input"
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder="https://…"
            value={p.input}
            onChange={(e) => p.setInput(e.target.value)}
            disabled={loading}
          />
          <div className="ticket__actions">
            <button type="button" className="paste-btn" onClick={p.onPaste} disabled={loading}>
              <IconClip size={18} /> Paste
            </button>
            <button type="submit" className="go-btn" disabled={loading || !p.input.trim()}>
              <span>Go</span>
            </button>
          </div>
        </div>
      </form>

      {!loading && p.status.s !== 'error' && (
        <p className="other-ways">
          <button className="inline-link" onClick={() => p.onPasteText('')}><IconNote size={16} /> Paste the recipe text</button>
          <span aria-hidden>·</span>
          <button className="inline-link" onClick={() => p.onWrite()}><IconPencil size={16} /> Write one by hand</button>
          <span aria-hidden>·</span>
          <button className="inline-link" onClick={p.onFussy}>Fussy sites</button>
        </p>
      )}

      {p.status.s === 'loading' && <Loading url={p.status.url} step={p.status.step} onCancel={p.onCancel} />}
      {p.status.s === 'error' && <ErrorNote status={p.status} onDismiss={p.onDismiss} onRetry={p.onSubmit} onPasteText={p.onPasteText} onWrite={p.onWrite} onFussy={p.onFussy} />}

      <section className="box" aria-labelledby="box-h">
        <div className="box__head">
          <h2 id="box-h" className="section-title">
            <IconBox size={22} /> The box
          </h2>
          <span className="count">{p.recipes.length ? `${p.recipes.length} card${p.recipes.length === 1 ? '' : 's'}` : ''}</span>
        </div>

        {p.loaded && p.recipes.length === 0 && p.status.s !== 'loading' && (
          <div className="empty">
            <EmptyArt />
            <p className="hand">Nothing filed yet — paste a link from any recipe site and I’ll write you a proper card.</p>
          </div>
        )}

        <ul className="cards">
          {p.recipes.map((r, i) => (
            <li key={r.id} style={{ ['--tilt' as any]: `${[-1.1, 0.7, -0.4, 1, -0.8][i % 5]}deg` }}>
              <button className="index-card" onClick={() => p.onOpen(r.id)}>
                <span className="index-card__photo">
                  <Tape className="tape--corner" tone={(['mustard', 'sage', 'rose'] as const)[i % 3]} />
                  {r.imageData || r.image ? <img src={r.imageData || r.image} alt="" loading="lazy" decoding="async" /> : <IconWhisk size={34} />}
                </span>
                <span className="index-card__body">
                  <span className="index-card__title">{r.title}</span>
                  <span className="index-card__meta">
                    {r.totalTime ? (
                      <><IconClock size={15} /> {formatMinutes(r.totalTime)}</>
                    ) : null}
                    <span className="index-card__site">{r.siteName || hostLabel(r.url)}</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <footer className="home__foot">
        {p.recipes.length > 0 && <Divider />}
        <button className="link-btn" onClick={p.onSettings}>Backup &amp; settings</button>
      </footer>
    </div>
  )
}

function Loading({ url, step, onCancel }: { url: string; step: number; onCancel: () => void }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 2600)
    return () => clearInterval(t)
  }, [])
  const line = LOADING_LINES[Math.min(LOADING_LINES.length - 1, Math.max(step, Math.floor(tick / 2)))]
  return (
    <div className="loading-card" role="status" aria-live="polite">
      <div className="loading-card__top">
        <span className="whisk-spin"><IconWhisk size={30} /></span>
        <div>
          <p className="typewriter">{line}<span className="caret" /></p>
          <p className="loading-card__url">{hostLabel(url)}</p>
        </div>
      </div>
      <div className="pencil-lines" aria-hidden>
        <span style={{ width: '72%' }} />
        <span style={{ width: '54%' }} />
        <span style={{ width: '86%' }} />
        <span style={{ width: '40%' }} />
      </div>
      <button className="link-btn" onClick={onCancel}>Never mind</button>
    </div>
  )
}

function ErrorNote({ status, onDismiss, onRetry, onPasteText, onWrite, onFussy }: {
  status: Extract<Status, { s: 'error' }>
  onDismiss: () => void
  onRetry: () => void
  onPasteText: (url: string) => void
  onWrite: (url?: string) => void
  onFussy: () => void
}) {
  const fussy = status.kind !== 'bad-url' ? fussyFor(status.url) : undefined
  const copy = {
    'bad-url': ['That doesn’t look like a link.', 'Paste the full address of a recipe page; it should start with https://'],
    offline: ['You’re offline.', 'Saved cards still open fine. Try this link again once you have signal, or paste the recipe text now.'],
    'not-recipe': ['No recipe on that page.', 'It opened, but there were no ingredients or steps to read. If the recipe is there, paste its text or write it in.'],
    blocked: ['That site wouldn’t let me in.', 'It turned away every way I tried to read it. You can still have the card: paste the recipe text, or write it in by hand.'],
  }[status.kind]
  const url = status.kind === 'bad-url' ? '' : status.url
  return (
    <div className="torn-note" role="alert">
      <Stamp text="OOPS" tone="ink" size="sm" rotate={6} />
      <h3>{copy[0]}</h3>
      <p>{copy[1]}</p>
      {fussy && (
        <p className="fussy-hint">
          <b>{fussy.name}</b> is a fussy one: {fussy.why}. <b>Paste the text</b> works best here.
        </p>
      )}
      <div className="torn-note__ways">
        <button className="btn" onClick={() => onPasteText(url)}><IconNote size={18} /> Paste the text</button>
        <button className="btn btn--quiet" onClick={() => onWrite(url)}><IconPencil size={18} /> Write by hand</button>
      </div>
      {status.attempts.length > 0 && (
        <details>
          <summary>What I tried</summary>
          <ul>
            {status.attempts.map((a, i) => (
              <li key={i}><b>{a.proxy}</b>: {a.detail}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="torn-note__actions">
        {status.kind !== 'bad-url' && <button className="link-btn" onClick={onRetry}>Try the link again</button>}
        {!fussy && <button className="link-btn" onClick={onFussy}>Fussy sites</button>}
        <button className="link-btn" onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
  )
}

function FussyNote({ onClose }: { onClose: () => void }) {
  return (
    <div className="fussy">
      <h2>A note on fussy sites</h2>
      <p className="muted">Most recipe sites open fine. These ones <em>probably</em> won’t, because the recipe sits behind a login, a paywall, or a video:</p>
      <ul className="fussy__list">
        {FUSSY.map((f) => (
          <li key={f.name}><b>{f.name}</b> <span>{f.why}</span></li>
        ))}
      </ul>
      <p className="hand-note">For these, open the recipe in Safari, tap aA → Show Reader, select all, copy, then choose “Paste the recipe text”. Or write the card by hand.</p>
      <div className="sheet__actions">
        <button className="btn btn--quiet" onClick={onClose}>Got it</button>
      </div>
    </div>
  )
}

function Settings({ recipes, onExport, onImport, onClose, onFussy }: { recipes: Recipe[]; onExport: () => void; onImport: (f: File) => void; onClose: () => void; onFussy: () => void }) {
  const [proxy, setProxy] = useState(() => {
    try {
      return localStorage.getItem(CUSTOM_PROXY_KEY) || ''
    } catch {
      return ''
    }
  })
  const file = useRef<HTMLInputElement>(null)
  return (
    <div className="settings">
      <h2>Backup &amp; settings</h2>
      <p className="muted">Your cards live only on this phone. Keep a backup file somewhere safe (Files, iCloud Drive).</p>
      <div className="sheet__actions">
        <button className="btn" onClick={onExport} disabled={!recipes.length}>Export {recipes.length} card{recipes.length === 1 ? '' : 's'}</button>
        <button className="btn btn--quiet" onClick={() => file.current?.click()}>Import backup</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
      </div>
      <label className="field">
        <span>Your own fetch relay <em>(optional)</em></span>
        <input
          type="url"
          placeholder="https://pinch-relay.you.workers.dev"
          value={proxy}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => {
            setProxy(e.target.value)
            try {
              localStorage.setItem(CUSTOM_PROXY_KEY, e.target.value.trim())
            } catch {
              /* ignore */
            }
          }}
        />
        <small>{relayBase() ? 'Leave empty to use the built-in relay. ' : ''}Your own Cloudflare Worker address (see proxy/README in the project). It’s tried first.</small>
      </label>
      <p><button className="inline-link" onClick={onFussy}>A note on fussy sites</button></p>
      <div className="sheet__actions">
        <button className="btn btn--quiet" onClick={onClose}>Done</button>
      </div>
    </div>
  )
}
