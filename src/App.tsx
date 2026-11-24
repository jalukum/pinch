import { useCallback, useEffect, useRef, useState } from 'react'
import type { Recipe } from './lib/types'
import type { Collection, ShopState } from './lib/storage'
import { extractRecipe, normalizeUrl, ExtractError, CUSTOM_PROXY_KEY, type Attempt } from './lib/fetcher'
import { fromText } from './lib/parse'
import { blankRecipe } from './lib/edit'
import { FUSSY, fussyFor } from './lib/fussy'
import { relayBase } from './lib/config'
import { videoPlatform, recipeFromVideoLink, recipeFromVideoFile, VideoError, PLATFORM_NAME, type VideoStage, type VideoErrorKind, type VideoPlatform } from './lib/video'
import { store, collectionStore, collectionsFromBackup, loadShop, saveShop, newId, requestPersistence, validateBackup, type Backup } from './lib/storage'
import { cacheImage } from './lib/image'
import { formatMinutes } from './lib/duration'
import { hostLabel } from './lib/text'
import { RecipeView } from './components/RecipeView'
import { ShoppingList } from './components/ShoppingList'
import { CollectSheet, ManageCollection } from './components/CollectSheet'
import { FolderCard, folderTone } from './components/FolderCard'
import { FolderGlyph, folderIconOf, type FolderIconId } from './components/FolderIcons'
import { Sheet } from './components/Sheet'
import { Editor, PasteText } from './components/Editor'
import { ThemeToggle } from './components/ThemeToggle'
import { Backdrop } from './components/Backdrop'
import { Divider, EmptyArt, Stamp, SvgDefs, Tape } from './components/Ornaments'
import { IconBack, IconBasket, IconBox, IconClip, IconClock, IconFilm, IconFolder, IconNote, IconPencil, IconWhisk } from './components/Icons'

type Route = { name: 'home' } | { name: 'recipe'; id: string } | { name: 'draft' } | { name: 'shop' } | { name: 'folder'; id: string }

function readRoute(): Route {
  const h = location.hash
  const m = /^#\/r\/([\w-]+)/.exec(h)
  if (m) return { name: 'recipe', id: m[1] }
  if (h.startsWith('#/new')) return { name: 'draft' }
  if (h.startsWith('#/shop')) return { name: 'shop' }
  const f = /^#\/f\/([\w-]+)/.exec(h)
  if (f) return { name: 'folder', id: f[1] }
  return { name: 'home' }
}

type Status =
  | { s: 'idle' }
  | { s: 'loading'; url: string; step: number; line?: string; sub?: string }
  | { s: 'error'; url: string; kind: ExtractError['kind'] | 'bad-url'; attempts: Attempt[] }
  | { s: 'video-error'; url: string; kind: VideoErrorKind; message: string; platform?: VideoPlatform; file?: boolean }

/** What the loading card says while a video is being read. */
function videoLine(stage: VideoStage, detail?: string, platform?: VideoPlatform | null): { line: string; sub?: string } {
  switch (stage) {
    case 'finding': return { line: `Finding the ${platform === 'tiktok' ? 'TikTok' : platform === 'instagram' ? 'reel' : 'video'}…` }
    case 'recipe-page': return { line: 'The chef wrote it down too…', sub: detail }
    case 'opening': return { line: 'Opening the video…', sub: detail }
    case 'listening': return { line: 'Listening to the chef…', sub: detail }
    case 'writing': return { line: detail === 'caption' ? 'Reading the caption…' : 'Writing down what they said…' }
  }
}

const LOADING_LINES = ['Fetching the page…', 'Knocking on the kitchen door…', 'Trying the side entrance…', 'Reading the recipe card…', 'Still stirring…', 'One last try…']

export default function App() {
  const [route, setRoute] = useState<Route>(readRoute)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [shop, setShop] = useState<ShopState>(loadShop)
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [collectFor, setCollectFor] = useState<string[] | null>(null)
  const [manageCol, setManageCol] = useState<Collection | null>(null)
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
  const videoInput = useRef<HTMLInputElement>(null)
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
      setCollections(await collectionStore.all())
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

  useEffect(() => { saveShop(shop) }, [shop])

  useEffect(() => {
    if (route.name === 'folder' && loaded && !collections.length) go('#/')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, loaded, collections.length])

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
      const platform = videoPlatform(url)
      if (platform) {
        setStatus({ s: 'loading', url, step: 0, ...videoLine('finding', undefined, platform) })
        try {
          const { recipe, partial, via } = await recipeFromVideoLink(url, {
            signal: ctl.signal,
            onStage: (st, d) => setStatus((cur) => (cur.s === 'loading' ? { ...cur, ...videoLine(st, d, platform) } : cur)),
          })
          if (ctl.signal.aborted) return
          console.info('[pinch] video via', via)
          setDraft({ ...recipe, id: newId() })
          setDraftPartial(partial)
          setStatus({ s: 'idle' })
          setInput('')
          go('#/new')
        } catch (e: any) {
          if (ctl.signal.aborted) return
          const err = e instanceof VideoError ? e : new VideoError('unavailable', String(e?.message || e), platform)
          setStatus({ s: 'video-error', url, kind: err.kind, message: err.message, platform: err.platform || platform })
        }
        return
      }
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

  /** A video file from the camera roll / Files → listen → card. */
  const uploadVideo = async (file: File) => {
    abort.current?.abort()
    const ctl = new AbortController()
    abort.current = ctl
    const label = file.name || 'your video'
    setStatus({ s: 'loading', url: '', step: 0, ...videoLine('opening', label) })
    try {
      const { recipe, partial } = await recipeFromVideoFile(file, {
        signal: ctl.signal,
        onStage: (st, d) => setStatus((cur) => (cur.s === 'loading' ? { ...cur, ...videoLine(st, d ?? (st === 'opening' ? label : undefined)) } : cur)),
      })
      if (ctl.signal.aborted) return
      setDraft({ ...recipe, id: newId() })
      setDraftPartial(partial)
      setStatus({ s: 'idle' })
      go('#/new')
    } catch (e: any) {
      if (ctl.signal.aborted) return
      const err = e instanceof VideoError ? e : new VideoError('no-audio', String(e?.message || e))
      setStatus({ s: 'video-error', url: '', kind: err.kind, message: err.message, file: true })
    }
  }
  const pickVideo = () => videoInput.current?.click()

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
    for (const c of collections) {
      if (c.recipeIds.includes(r.id)) await collectionStore.put({ ...c, recipeIds: c.recipeIds.filter((id) => id !== r.id) })
    }
    setShop((s) => ({ ...s, entries: s.entries.filter((e) => e.id !== r.id) }))
    setConfirm(null)
    await refresh()
    go('#/')
    toast('Card removed from the box')
  }

  const addToShop = (items: { id: string; servings: number }[]) => {
    setShop((s) => {
      const entries = [...s.entries]
      let added = 0
      for (const it of items) {
        const i = entries.findIndex((e) => e.id === it.id)
        if (i >= 0) entries[i] = it
        else { entries.push(it); added++ }
      }
      return { ...s, entries }
    })
    const n = items.length
    const already = items.length === 1 && shop.entries.some((e) => e.id === items[0].id)
    toast(already ? 'Updated the scale on the shopping list' : n === 1 ? 'Added to the shopping list' : `Added ${n} recipes to the shopping list`)
  }

  const defaultServings = (r: Recipe) => (r.servings && r.servings > 0 ? r.servings : 1)

  const createCollection = async (name: string, recipeIds: string[] = [], icon: FolderIconId = 'bowl') => {
    const c: Collection = { id: newId(), name, createdAt: Date.now(), recipeIds: [...new Set(recipeIds)], icon }
    await collectionStore.put(c)
    await refresh()
    return c
  }

  const toggleInCollection = async (colId: string, recipeIds: string[], on: boolean) => {
    const c = collections.find((x) => x.id === colId)
    if (!c) return
    const set = new Set(c.recipeIds)
    for (const id of recipeIds) {
      if (on) set.add(id)
      else set.delete(id)
    }
    await collectionStore.put({ ...c, recipeIds: [...set] })
    await refresh()
  }

  const exportBackup = () => {
    const data: Backup = { app: 'pinch', version: 2, exportedAt: new Date().toISOString(), recipes, collections }
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
      const data = JSON.parse(await file.text())
      const list = validateBackup(data)
      for (const r of list) await store.put(r)
      const incoming = collectionsFromBackup(data)
      const have = await collectionStore.all()
      for (const c of incoming) {
        const old = have.find((x) => x.id === c.id)
        await collectionStore.put(old ? { ...c, recipeIds: [...new Set([...old.recipeIds, ...c.recipeIds])] } : c)
      }
      await refresh()
      const extra = incoming.length ? ` and ${incoming.length} folder${incoming.length === 1 ? '' : 's'}` : ''
      toast(`Filed ${list.length} card${list.length === 1 ? '' : 's'}${extra} from backup`)
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
  } else if (route.name === 'shop') {
    page = (
      <ShoppingList
        recipes={recipes}
        entries={shop.entries}
        checks={shop.checks}
        onServings={(id, servings) => setShop((s) => ({ ...s, entries: s.entries.map((e) => (e.id === id ? { ...e, servings } : e)) }))}
        onRemove={(id) => setShop((s) => ({ ...s, entries: s.entries.filter((e) => e.id !== id) }))}
        onToggle={(key) => setShop((s) => {
          const checks = { ...s.checks }
          if (checks[key]) delete checks[key]
          else checks[key] = true
          return { ...s, checks }
        })}
        onClear={() => setShop((s) => ({ ...s, checks: {} }))}
        onBack={() => go('#/')}
        toast={toast}
      />
    )
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
        onCollect={() => setCollectFor([current.id])}
        onAddToShop={(servings) => addToShop([{ id: current.id, servings }])}
        inShop={shop.entries.some((e) => e.id === current.id)}
        shopCount={shop.entries.length}
        onOpenShop={() => go('#/shop')}
      />
    )
  } else {
    page = (
      <Home
        recipes={recipes}
        collections={collections}
        folder={route.name === 'folder' ? route.id : null}
        selecting={selecting}
        setSelecting={setSelecting}
        picked={picked}
        setPicked={setPicked}
        shopCount={shop.entries.length}
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
        onUpload={pickVideo}
        onShop={() => go('#/shop')}
        onCollect={(ids) => setCollectFor(ids)}
        onShopPicked={(ids) => {
          addToShop(ids.map((id) => {
            const r = recipes.find((x) => x.id === id)
            return { id, servings: r ? defaultServings(r) : 1 }
          }))
          setSelecting(false)
          setPicked([])
        }}
        onManage={(c) => setManageCol(c)}
        onNewFolder={() => setCollectFor([])}
        onOpenFolder={(id) => { setSelecting(false); setPicked([]); go(`#/f/${id}`) }}
        onBackToBox={() => { setSelecting(false); setPicked([]); go('#/') }}
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

      <Sheet open={collectFor !== null} onClose={() => setCollectFor(null)} label="File under">
        {collectFor && (
          <CollectSheet
            collections={collections}
            selected={collectFor}
            inIds={(id) => {
              const c = collections.find((x) => x.id === id)
              if (!c || !collectFor.length) return false
              const n = collectFor.filter((r) => c.recipeIds.includes(r)).length
              return n === collectFor.length ? true : n > 0 ? 'some' : false
            }}
            onToggle={(id, on) => toggleInCollection(id, collectFor, on)}
            onCreate={async (name, icon) => {
              await createCollection(name, collectFor, icon)
              if (!collectFor.length) go('#/')
            }}
            onClose={() => { setCollectFor(null); setSelecting(false); setPicked([]) }}
          />
        )}
      </Sheet>

      <Sheet open={!!manageCol} onClose={() => setManageCol(null)} label="Folder">
        {manageCol && (
          <ManageCollection
            collection={collections.find((c) => c.id === manageCol.id) || manageCol}
            onSave={async (name, icon) => { await collectionStore.put({ ...manageCol, name, icon }); await refresh() }}
            onDelete={async () => {
              await collectionStore.remove(manageCol.id)
              setManageCol(null)
              await refresh()
              go('#/')
              toast('Folder removed')
            }}
            onClose={() => setManageCol(null)}
          />
        )}
      </Sheet>

      <input
        ref={videoInput}
        type="file"
        accept="video/*,audio/*,.mp4,.mov,.m4a,.mp3,.webm"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) {
            if (route.name !== 'home') go('#/')
            uploadVideo(f)
          }
        }}
      />

      <div className={`toast ${toastMsg ? 'is-on' : ''}`} role="status" aria-live="polite">{toastMsg}</div>
    </>
  )
}

// ───────────────────────────── Home ─────────────────────────────

function Home(p: {
  recipes: Recipe[]
  collections: Collection[]
  folder: string | null
  selecting: boolean
  setSelecting: (v: boolean) => void
  picked: string[]
  setPicked: (ids: string[] | ((p: string[]) => string[])) => void
  shopCount: number
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
  onUpload: () => void
  onShop: () => void
  onCollect: (ids: string[]) => void
  onShopPicked: (ids: string[]) => void
  onManage: (c: Collection) => void
  onNewFolder: () => void
  onOpenFolder: (id: string) => void
  onBackToBox: () => void
}) {
  const loading = p.status.s === 'loading'
  const failed = p.status.s === 'error' || p.status.s === 'video-error'
  const hasFolders = p.collections.length > 0
  const filed = new Set(p.collections.flatMap((c) => c.recipeIds))
  const unsorted = p.recipes.filter((r) => !filed.has(r.id))
  const inFolder = (id: string) => {
    if (id === 'all') return p.recipes
    if (id === 'unsorted') return unsorted
    const ids = p.collections.find((c) => c.id === id)?.recipeIds || []
    return p.recipes.filter((r) => ids.includes(r.id))
  }
  const currentCol = p.folder && p.folder !== 'all' && p.folder !== 'unsorted' ? p.collections.find((c) => c.id === p.folder) : undefined
  const folderTitle = p.folder === 'all' ? 'All' : p.folder === 'unsorted' ? 'Unsorted' : currentCol?.name || 'Folder'
  const active = p.folder ? inFolder(p.folder) : p.recipes
  const togglePick = (id: string) => p.setPicked((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]))
  const recipeCards = (list: Recipe[]) => (
    <ul className="cards">
      {list.map((r, i) => {
        const on = p.picked.includes(r.id)
        return (
          <li key={r.id} style={{ ['--tilt' as any]: `${[-1.1, 0.7, -0.4, 1, -0.8][i % 5]}deg` }}>
            <button
              className={`index-card ${on ? 'is-picked' : ''}`}
              onClick={() => p.selecting ? togglePick(r.id) : p.onOpen(r.id)}
              aria-pressed={p.selecting ? on : undefined}
            >
              {p.selecting && <span className={`pick-dot ${on ? 'is-on' : ''}`} aria-hidden />}
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
        )
      })}
    </ul>
  )

  if (p.folder) {
    return (
      <div className={`home home--folder ${p.selecting ? 'is-selecting' : ''}`}>
        <nav className="topbar">
          <button className="link-btn" onClick={p.onBackToBox}>
            <IconBack size={20} /> <span>The box</span>
          </button>
          <div className="topbar__actions">
            {currentCol && <button className="icon-btn" onClick={() => p.onManage(currentCol)} aria-label="Rename or remove folder"><IconFolder /></button>}
          </div>
        </nav>
        <header className="folder-head">
          <div>
            <h1 className="folder-head__title">
              <FolderGlyph id={p.folder === 'all' ? 'all' : p.folder === 'unsorted' ? 'unsorted' : folderIconOf(currentCol)} size={36} />
              {folderTitle}
            </h1>
            <p className="count">{active.length ? `${active.length} card${active.length === 1 ? '' : 's'}` : 'No cards yet'}</p>
          </div>
          <span className="box__tools">
            {currentCol && !p.selecting && (
              <button className="link-btn box__select" onClick={() => p.onManage(currentCol)}>Rename or remove</button>
            )}
            {active.length > 0 && !p.selecting && (
              <button className="link-btn box__select" onClick={() => p.setSelecting(true)}>Select</button>
            )}
            {p.selecting && (
              <button className="link-btn box__select" onClick={() => { p.setSelecting(false); p.setPicked([]) }}>Cancel</button>
            )}
          </span>
        </header>
        {active.length === 0 ? (
          <p className="hand folder-empty">{p.folder === 'unsorted' ? 'Everything is filed in a folder.' : 'Nothing in this folder yet. Open All, tap Select, and file some cards under here.'}</p>
        ) : recipeCards(active)}
        {p.selecting && (
          <div className="select-bar" role="toolbar" aria-label="Selected cards">
            <span className="select-bar__n">{p.picked.length ? `${p.picked.length} selected` : 'Pick some cards'}</span>
            <button className="btn btn--quiet" disabled={!p.picked.length} onClick={() => p.onCollect(p.picked)}><IconFolder size={16} /> File under</button>
            <button className="btn" disabled={!p.picked.length} onClick={() => p.onShopPicked(p.picked)}><IconBasket size={16} /> Shop these</button>
          </div>
        )}
        <footer className="home__foot">
          <Divider />
          {p.shopCount > 0 && <button className="link-btn" onClick={p.onShop}><IconBasket size={16} /> Shopping list</button>}
          <button className="link-btn" onClick={p.onSettings}>Backup &amp; settings</button>
        </footer>
      </div>
    )
  }

  return (
    <div className={`home ${p.selecting ? 'is-selecting' : ''}`}>
      <header className="masthead">
        <button className="shop-stamp" onClick={p.onShop} aria-label={p.shopCount ? `Shopping list, ${p.shopCount} recipe${p.shopCount === 1 ? '' : 's'}` : 'Shopping list'}>
          <IconBasket size={22} />
          {p.shopCount > 0 && <span className="shop-stamp__n">{p.shopCount}</span>}
          <span>List</span>
        </button>
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
          <label htmlFor="paste-input" className="ticket__label">Paste a recipe or video link</label>
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

      {!loading && !failed && (
        <p className="other-ways">
          <button className="inline-link" onClick={() => p.onPasteText('')}><IconNote size={16} /> Paste the recipe text</button>
          <span aria-hidden>·</span>
          <button className="inline-link" onClick={p.onUpload}><IconFilm size={16} /> Upload a video</button>
          <span aria-hidden>·</span>
          <button className="inline-link" onClick={() => p.onWrite()}><IconPencil size={16} /> Write one by hand</button>
          <span aria-hidden>·</span>
          <button className="inline-link" onClick={p.onFussy}>Fussy sites</button>
        </p>
      )}

      {p.status.s === 'loading' && <Loading url={p.status.url} step={p.status.step} line={p.status.line} sub={p.status.sub} onCancel={p.onCancel} />}
      {p.status.s === 'video-error' && <VideoErrorNote status={p.status} onDismiss={p.onDismiss} onRetry={p.onSubmit} onUpload={p.onUpload} onPasteText={p.onPasteText} onWrite={p.onWrite} />}
      {p.status.s === 'error' && <ErrorNote status={p.status} onDismiss={p.onDismiss} onRetry={p.onSubmit} onPasteText={p.onPasteText} onWrite={p.onWrite} onFussy={p.onFussy} />}

      <section className="box" aria-labelledby="box-h">
        <div className="box__head">
          <h2 id="box-h" className="section-title">
            <IconBox size={22} /> The box
          </h2>
          <span className="box__tools">
            {!hasFolders && p.recipes.length > 0 && (
              <button className="link-btn box__select" onClick={p.onNewFolder}>New folder</button>
            )}
            {!hasFolders && p.recipes.length > 0 && !p.selecting && (
              <button className="link-btn box__select" onClick={() => p.setSelecting(true)}>Select</button>
            )}
            {!hasFolders && p.selecting && (
              <button className="link-btn box__select" onClick={() => { p.setSelecting(false); p.setPicked([]) }}>Cancel</button>
            )}
            {!hasFolders && <span className="count">{p.recipes.length ? `${p.recipes.length} card${p.recipes.length === 1 ? '' : 's'}` : ''}</span>}
          </span>
        </div>

        {p.loaded && p.recipes.length === 0 && p.status.s !== 'loading' && !hasFolders && (
          <div className="empty">
            <EmptyArt />
            <p className="hand">Nothing filed yet — paste a link from any recipe site or cooking video and I’ll write you a proper card.</p>
          </div>
        )}

        {hasFolders ? (
          <ul className="folders">
            <li><FolderCard name="All" count={p.recipes.length} tone="olive" icon="all" onClick={() => p.onOpenFolder('all')} /></li>
            <li><FolderCard name="Unsorted" count={unsorted.length} tone="sage" icon="unsorted" onClick={() => p.onOpenFolder('unsorted')} /></li>
            {p.collections.map((c, i) => {
              const recs = inFolder(c.id)
              return (
                <li key={c.id}>
                  <FolderCard name={c.name} count={recs.length} tone={folderTone(i)} icon={folderIconOf(c)} onClick={() => p.onOpenFolder(c.id)} />
                </li>
              )
            })}
            <li><FolderCard name="New folder" count={0} fresh onClick={p.onNewFolder} /></li>
          </ul>
        ) : (
          recipeCards(p.recipes)
        )}
      </section>

      {!hasFolders && p.selecting && (
        <div className="select-bar" role="toolbar" aria-label="Selected cards">
          <span className="select-bar__n">{p.picked.length ? `${p.picked.length} selected` : 'Pick some cards'}</span>
          <button className="btn btn--quiet" disabled={!p.picked.length} onClick={() => p.onCollect(p.picked)}><IconFolder size={16} /> File under</button>
          <button className="btn" disabled={!p.picked.length} onClick={() => p.onShopPicked(p.picked)}><IconBasket size={16} /> Shop these</button>
        </div>
      )}

      <footer className="home__foot">
        {p.recipes.length > 0 && <Divider />}
        {p.shopCount > 0 && <button className="link-btn" onClick={p.onShop}><IconBasket size={16} /> Shopping list</button>}
        <button className="link-btn" onClick={p.onSettings}>Backup &amp; settings</button>
      </footer>
    </div>
  )
}

function Loading({ url, step, line: fixed, sub, onCancel }: { url: string; step: number; line?: string; sub?: string; onCancel: () => void }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 2600)
    return () => clearInterval(t)
  }, [])
  const line = fixed || LOADING_LINES[Math.min(LOADING_LINES.length - 1, Math.max(step, Math.floor(tick / 2)))]
  return (
    <div className="loading-card" role="status" aria-live="polite">
      <div className="loading-card__top">
        <span className="whisk-spin"><IconWhisk size={30} /></span>
        <div>
          <p className="typewriter">{line}<span className="caret" /></p>
          <p className="loading-card__url">{sub || (url ? hostLabel(url) : '')}</p>
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

function VideoErrorNote({ status, onDismiss, onRetry, onUpload, onPasteText, onWrite }: {
  status: Extract<Status, { s: 'video-error' }>
  onDismiss: () => void
  onRetry: () => void
  onUpload: () => void
  onPasteText: (url: string) => void
  onWrite: (url?: string) => void
}) {
  const where = status.platform ? PLATFORM_NAME[status.platform] : 'that video'
  const head: Record<VideoErrorKind, string> = {
    'no-relay': 'Videos need the relay.',
    offline: 'You’re offline.',
    unavailable: `${status.file ? 'That video' : where} didn’t open.`,
    'no-recipe': 'No recipe in there.',
    quota: 'Out of listening time for today.',
    'too-long': 'That one’s a bit long.',
    unsupported: `${where} keeps its videos locked.`,
    'no-audio': 'Couldn’t hear that one.',
    cancelled: 'Stopped.',
  }
  const tip = status.file
    ? 'You can paste the recipe text or write it in instead.'
    : status.platform === 'youtube' || status.platform === 'instagram' || status.platform === 'facebook'
      ? `${where} doesn’t share a video’s sound with apps like this. Save the video (or screen-record the cooking part) and upload it, and I’ll listen to the chef.`
      : status.kind === 'no-recipe'
        ? 'If the recipe is on the creator’s website, open it there and paste that link instead.'
        : 'If the chef says the recipe out loud, save or screen-record the video and upload it.'
  return (
    <div className="torn-note" role="alert">
      <Stamp text="OOPS" tone="ink" size="sm" rotate={6} />
      <h3>{head[status.kind]}</h3>
      <p>{status.message}</p>
      {status.kind !== 'quota' && status.kind !== 'offline' && <p className="fussy-hint">{tip}</p>}
      <div className="torn-note__ways">
        {status.kind !== 'quota' && <button className="btn" onClick={onUpload}><IconFilm size={18} /> {status.file ? 'Try another video' : 'Upload the video'}</button>}
        <button className="btn btn--quiet" onClick={() => onPasteText(status.url)}><IconNote size={18} /> Paste the text</button>
      </div>
      <div className="torn-note__actions">
        {!status.file && status.kind !== 'no-recipe' && status.kind !== 'unsupported' && <button className="link-btn" onClick={onRetry}>Try the link again</button>}
        <button className="link-btn" onClick={() => onWrite(status.url)}>Write by hand</button>
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
      <h3 className="fussy__sub">Cooking videos</h3>
      <p className="muted">Paste a TikTok, YouTube (Shorts too) or Instagram link. TikToks work best: Pinch reads the caption and listens to the chef. YouTube and Instagram only share the description, so Pinch uses that, or the written recipe it links to.</p>
      <p className="hand-note">Recipe only spoken out loud? Save the video, or screen-record the cooking part, then tap “Upload a video” and Pinch will listen to it.</p>
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
