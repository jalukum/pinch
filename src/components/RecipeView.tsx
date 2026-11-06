import { useEffect, useMemo, useRef, useState } from 'react'
import type { Recipe } from '../lib/types'
import { formatMinutes } from '../lib/duration'
import { scaleIngredient, formatQty } from '../lib/scale'
import { Divider, Stamp, Tape } from './Ornaments'
import { relayImage } from '../lib/config'
import { IconBack, IconPencil, IconLink, IconMinus, IconPlus, IconRefresh, IconShare, IconSun, IconTrash } from './Icons'

interface Props {
  recipe: Recipe
  saved: boolean
  justSaved?: boolean
  onBack: () => void
  onSave: () => void
  onDelete: () => void
  onEdit: () => void
  partial?: boolean
  toast: (msg: string) => void
}

function useProgress(key: string) {
  const [state, setState] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) || '{}')
    } catch {
      return {}
    }
  })
  useEffect(() => {
    try {
      if (Object.keys(state).length) localStorage.setItem(key, JSON.stringify(state))
      else localStorage.removeItem(key)
    } catch {
      /* quota */
    }
  }, [key, state])
  return [state, setState] as const
}

function useWakeLock() {
  const [on, setOn] = useState(false)
  const lock = useRef<any>(null)
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator
  useEffect(() => {
    if (!on) return
    let cancelled = false
    const acquire = async () => {
      try {
        lock.current = await (navigator as any).wakeLock.request('screen')
      } catch {
        if (!cancelled) setOn(false)
      }
    }
    acquire()
    const vis = () => document.visibilityState === 'visible' && acquire()
    document.addEventListener('visibilitychange', vis)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', vis)
      lock.current?.release?.().catch(() => {})
      lock.current = null
    }
  }, [on])
  return { on, setOn, supported }
}

export function recipeAsText(r: Recipe, factor = 1): string {
  const lines = [r.title, r.url, '']
  const meta = [
    r.prepTime && `Prep ${formatMinutes(r.prepTime)}`,
    r.cookTime && `Cook ${formatMinutes(r.cookTime)}`,
    r.totalTime && `Total ${formatMinutes(r.totalTime)}`,
    r.yieldText && `Makes ${r.yieldText}`,
  ].filter(Boolean)
  if (meta.length) lines.push(meta.join(' · '), '')
  lines.push('INGREDIENTS')
  r.ingredients.forEach((g) => {
    if (g.title) lines.push('', g.title)
    g.items.forEach((i) => lines.push('• ' + scaleIngredient(i, factor)))
  })
  lines.push('', 'METHOD')
  let n = 1
  r.instructions.forEach((g) => {
    if (g.title) lines.push('', g.title)
    g.steps.forEach((s) => lines.push(`${n++}. ${s}`))
  })
  if (r.notes.length) lines.push('', 'NOTES', ...r.notes.map((x) => '– ' + x))
  return lines.join('\n')
}

export function RecipeView({ recipe: r, saved, justSaved, onBack, onSave, onDelete, onEdit, partial, toast }: Props) {
  const [checks, setChecks] = useProgress(`pinch.progress.${r.id}`)
  const baseServings = r.servings && r.servings > 0 ? r.servings : undefined
  const [servings, setServings] = useState<number>(baseServings ?? 1)
  const factor = baseServings ? servings / baseServings : servings
  const wake = useWakeLock()
  // photo: cached copy, else the original, else through the relay (for hotlink-shy sites)
  const [imgTry, setImgTry] = useState(0)
  const img = r.imageData || (imgTry === 0 ? r.image : imgTry === 1 ? relayImage(r.image) : undefined)
  const imgOk = imgTry < 2 && !(imgTry === 1 && img === r.image)

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [r.id])

  const toggle = (k: string) => setChecks((s) => {
    const n = { ...s }
    if (n[k]) delete n[k]
    else n[k] = true
    return n
  })
  const anyChecked = Object.keys(checks).length > 0

  const times = useMemo(
    () => [
      ['Prep', r.prepTime],
      ['Cook', r.cookTime],
      ['Total', r.totalTime],
    ].filter(([, v]) => v) as [string, number][],
    [r],
  )

  const share = async () => {
    const text = recipeAsText(r, factor)
    try {
      if (navigator.share) {
        await navigator.share(r.url ? { title: r.title, text: r.title, url: r.url } : { title: r.title, text })
        return
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return
    }
    try {
      await navigator.clipboard.writeText(text)
      toast('Recipe copied to your clipboard')
    } catch {
      toast('Couldn’t reach the clipboard')
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(recipeAsText(r, factor))
      toast('Recipe copied as text')
    } catch {
      toast('Couldn’t reach the clipboard')
    }
  }

  let stepNo = 0
  const rot = ((r.id.charCodeAt(r.id.length - 1) % 5) - 2) * 0.6 - 1

  return (
    <article className="recipe" aria-labelledby="recipe-title">
      <nav className="topbar">
        <button className="link-btn" onClick={onBack}>
          <IconBack size={20} /> <span>The box</span>
        </button>
        <div className="topbar__actions">
          <button className="icon-btn" onClick={onEdit} aria-label="Edit card"><IconPencil /></button>
          <button className="icon-btn" onClick={share} aria-label="Share recipe"><IconShare /></button>
          {saved && <button className="icon-btn" onClick={onDelete} aria-label="Remove from box"><IconTrash /></button>}
        </div>
      </nav>

      {partial && (
        <div className="partial-note" role="status">
          <p><b>I only found part of this one.</b> {r.ingredients.length || r.instructions.length ? 'Fill in the rest by hand, or paste the recipe text.' : 'The page opened but the recipe was hidden. Write it in, or paste the recipe text.'}</p>
          <button className="btn btn--small" onClick={onEdit}><IconPencil size={16} /> Fill it in</button>
        </div>
      )}

      <div className="print-wrap">
        <figure className="print" style={{ ['--rot' as any]: `${rot}deg` }}>
          <Tape className="tape--tl" />
          <Tape className="tape--tr" tone="sage" />
          {img && imgOk ? (
            <img src={img} alt="" onError={() => setImgTry((n) => n + 1)} decoding="async" />
          ) : (
            <div className="print__blank"><span>no photo, just good food</span></div>
          )}
        </figure>
      </div>

      <header className="recipe__head">
        <p className="kicker">
          {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer">from {r.siteName || 'the web'} <IconLink size={14} /></a> : <span>written by hand</span>}
        </p>
        <h1 id="recipe-title" className="recipe__title">{r.title}</h1>
        {r.author && <p className="byline">by {r.author}</p>}
        {r.description && <p className="lede">{r.description}</p>}
      </header>

      {(times.length > 0 || r.yieldText) && (
        <dl className="facts">
          {times.map(([k, v]) => (
            <div className="fact" key={k}>
              <dt>{k}</dt>
              <dd>{formatMinutes(v)}</dd>
            </div>
          ))}
          {r.yieldText && (
            <div className="fact">
              <dt>Makes</dt>
              <dd>{r.yieldText}</dd>
            </div>
          )}
        </dl>
      )}

      <div className="save-row">
        {saved ? (
          <div className={`saved-mark ${justSaved ? 'is-fresh' : ''}`}>
            <Stamp text="FILED" sub={new Date(r.savedAt ?? Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()} rotate={-6} />
          </div>
        ) : (
          <button className="stamp-btn" onClick={onSave}>
            <span>File it in the box</span>
          </button>
        )}
        {wake.supported && (
          <button className={`toggle ${wake.on ? 'is-on' : ''}`} onClick={() => wake.setOn(!wake.on)} aria-pressed={wake.on}>
            <IconSun size={18} /> {wake.on ? 'Screen stays on' : 'Keep screen on'}
          </button>
        )}
      </div>

      <section className="card card--ruled" aria-labelledby="ing-h">
        <div className="card__head">
          <h2 id="ing-h">Ingredients</h2>
          <div className="scaler" role="group" aria-label="Scale servings">
            <button className="ink-btn" onClick={() => setServings((s) => Math.max(baseServings ? 1 : 0.5, baseServings ? s - 1 : s / 2))} aria-label="Fewer"><IconMinus size={16} /></button>
            <span className="scaler__val" aria-live="polite">
              {baseServings ? <>{servings}<small> serv.</small></> : <>×{formatQty(servings)}</>}
            </span>
            <button className="ink-btn" onClick={() => setServings((s) => (baseServings ? s + 1 : Math.min(8, s * 2)))} aria-label="More"><IconPlus size={16} /></button>
          </div>
        </div>
        {factor !== 1 && <p className="hand-note">scaled ×{formatQty(factor)} — double-check pinches &amp; pans</p>}
        {r.ingredients.map((g, gi) => (
          <div key={gi} className="group">
            {g.title && <h3 className="group__title">{g.title}</h3>}
            <ul className="checklist">
              {g.items.map((it, i) => {
                const k = `i${gi}.${i}`
                return (
                  <li key={k}>
                    <label className={`check ${checks[k] ? 'is-done' : ''}`}>
                      <input type="checkbox" checked={!!checks[k]} onChange={() => toggle(k)} />
                      <span className="check__box" aria-hidden>
                        <svg viewBox="0 0 24 24"><path d="M5 12.8c1.4 1.4 2.8 2.9 4.1 4.4 3.2-3.8 6.4-7.5 9.9-11" /></svg>
                      </span>
                      <span className="check__text">{scaleIngredient(it, factor)}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
        {!r.ingredients.length && <p className="muted">No ingredients yet. <button className="inline-link" onClick={onEdit}>Add them</button></p>}
      </section>

      <Divider />

      <section className="method" aria-labelledby="method-h">
        <h2 id="method-h" className="section-title">Method</h2>
        {r.instructions.map((g, gi) => (
          <div key={gi} className="group">
            {g.title && <h3 className="group__title">{g.title}</h3>}
            <ol className="steps">
              {g.steps.map((s, i) => {
                stepNo++
                const k = `s${gi}.${i}`
                return (
                  <li key={k}>
                    <button className={`step ${checks[k] ? 'is-done' : ''}`} onClick={() => toggle(k)} aria-pressed={!!checks[k]}>
                      <span className="step__n" aria-hidden>{stepNo}</span>
                      <span className="step__t">{s}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
        ))}
        {!r.instructions.length && <p className="muted">No steps yet. <button className="inline-link" onClick={onEdit}>Write them in</button>{r.url && <> or <a href={r.url} target="_blank" rel="noreferrer">see the original</a></>}.</p>}
      </section>

      {r.notes.length > 0 && (
        <aside className="note-paper" aria-label="Notes">
          <Tape className="tape--top" tone="rose" />
          <h2>Notes</h2>
          <ul>{r.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </aside>
      )}

      <footer className="recipe__foot">
        {anyChecked && (
          <button className="link-btn" onClick={() => setChecks({})}><IconRefresh size={18} /> Clear ticks</button>
        )}
        <button className="link-btn" onClick={copy}>Copy as text</button>
        <button className="link-btn" onClick={onEdit}><IconPencil size={16} /> Edit card</button>
        {r.url && <a className="link-btn" href={r.url} target="_blank" rel="noopener noreferrer">Original page <IconLink size={14} /></a>}
      </footer>
    </article>
  )
}
