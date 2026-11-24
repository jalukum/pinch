import { useMemo, useState } from 'react'
import type { Recipe } from '../lib/types'
import type { ShopEntry } from '../lib/storage'
import { formatQty } from '../lib/scale'
import { initials, listAsText, shopFactor, shoppingList, type ShopLine, type ShopRecipe } from '../lib/shop'
import { IconBack, IconMinus, IconPlus, IconRefresh, IconShare, IconTrash } from './Icons'

const TONES = 6

function toShop(r: Recipe, servings: number): ShopRecipe {
  const base = r.servings && r.servings > 0 ? r.servings : undefined
  return {
    id: r.id,
    title: r.title,
    servings,
    baseServings: base,
    factor: shopFactor(servings, base),
    ingredients: r.ingredients,
  }
}

export function ShoppingList({
  recipes,
  entries,
  checks,
  onServings,
  onRemove,
  onToggle,
  onClear,
  onBack,
  toast,
}: {
  recipes: Recipe[]
  entries: ShopEntry[]
  checks: Record<string, boolean>
  onServings: (id: string, servings: number) => void
  onRemove: (id: string) => void
  onToggle: (key: string) => void
  onClear: () => void
  onBack: () => void
  toast: (m: string) => void
}) {
  const included = useMemo(() => {
    const out: ShopRecipe[] = []
    for (const e of entries) {
      const r = recipes.find((x) => x.id === e.id)
      if (r) out.push(toShop(r, e.servings))
    }
    return out
  }, [recipes, entries])
  const lines = useMemo(() => shoppingList(included), [included])
  const [open, setOpen] = useState<string | null>(null)
  const markOf = (id: string) => {
    const i = included.findIndex((r) => r.id === id)
    return { initials: initials(included[i]?.title || ''), tone: ((i % TONES) + TONES) % TONES }
  }

  const share = async () => {
    const text = listAsText(included, lines)
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Shopping list', text })
        return
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return
    }
    try {
      await navigator.clipboard.writeText(text)
      toast('List copied to your clipboard')
    } catch {
      toast('Couldn’t reach the clipboard')
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(listAsText(included, lines))
      toast('List copied as text')
    } catch {
      toast('Couldn’t reach the clipboard')
    }
  }

  const anyChecked = lines.some((l) => checks[l.key])
  const remaining = lines.filter((l) => !checks[l.key]).length

  return (
    <article className="shop">
      <nav className="topbar">
        <button className="link-btn" onClick={onBack}>
          <IconBack size={20} /> <span>The box</span>
        </button>
        <div className="topbar__actions">
          <button className="icon-btn" onClick={share} aria-label="Share list"><IconShare /></button>
        </div>
      </nav>

      <header className="shop__head">
        <h1>Shopping list</h1>
        {lines.length > 0 && (
          <p className="shop__count">{remaining} to get{anyChecked ? ` · ${lines.length - remaining} ticked` : ''}</p>
        )}
      </header>

      {included.length === 0 ? (
        <p className="hand shop__empty">Nothing to shop for yet. Open a card and add it, or select a few from the box.</p>
      ) : (
        <ul className="shop__recipes">
          {included.map((r) => {
            const e = entries.find((x) => x.id === r.id)!
            const m = markOf(r.id)
            const step = r.baseServings ? 1 : 0.5
            const min = r.baseServings ? 1 : 0.5
            const label = r.baseServings ? `${e.servings} serv.` : `×${formatQty(e.servings)}`
            return (
              <li key={r.id} className="shop__rec">
                <span className={`mark mark--${m.tone}`} title={r.title}>{m.initials}</span>
                <span className="shop__rec-title">{r.title}</span>
                <span className="scaler scaler--compact" role="group" aria-label={`Scale ${r.title}`}>
                  <button className="ink-btn" onClick={() => onServings(r.id, Math.max(min, +(e.servings - step).toFixed(2)))} aria-label="Fewer"><IconMinus size={14} /></button>
                  <span className="scaler__val">{label}</span>
                  <button className="ink-btn" onClick={() => onServings(r.id, +(e.servings + step).toFixed(2))} aria-label="More"><IconPlus size={14} /></button>
                </span>
                <button className="icon-btn shop__drop" onClick={() => onRemove(r.id)} aria-label={`Remove ${r.title}`}><IconTrash size={18} /></button>
              </li>
            )
          })}
        </ul>
      )}

      {lines.length > 0 && (
        <section className="card card--ruled shop__lines" aria-label="Ingredients">
          <ul className="checklist">
            {lines.map((l) => (
              <ShopItem
                key={l.key}
                line={l}
                checked={!!checks[l.key]}
                open={open === l.key}
                onToggle={() => onToggle(l.key)}
                onOpen={() => setOpen((k) => (k === l.key ? null : l.key))}
                markOf={markOf}
              />
            ))}
          </ul>
        </section>
      )}

      <footer className="recipe__foot">
        {anyChecked && <button className="link-btn" onClick={onClear}><IconRefresh size={18} /> Clear ticks</button>}
        {lines.length > 0 && <button className="link-btn" onClick={copy}>Copy as text</button>}
      </footer>
    </article>
  )
}

function ShopItem({
  line: l,
  checked,
  open,
  onToggle,
  onOpen,
  markOf,
}: {
  line: ShopLine
  checked: boolean
  open: boolean
  onToggle: () => void
  onOpen: () => void
  markOf: (id: string) => { initials: string; tone: number }
}) {
  return (
    <li className={`shop__item ${open ? 'is-open' : ''}`}>
      <label className={`check ${checked ? 'is-done' : ''}`}>
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span className="check__box" aria-hidden>
          <svg viewBox="0 0 24 24"><path d="M5 12.8c1.4 1.4 2.8 2.9 4.1 4.4 3.2-3.8 6.4-7.5 9.9-11" /></svg>
        </span>
        <span className="check__text">{l.text}</span>
      </label>
      <button className="shop__marks" onClick={onOpen} aria-expanded={open} aria-label={`Used in ${l.recipes.map((r) => r.title).join(', ')}`}>
        {l.recipes.map((r) => {
          const m = markOf(r.id)
          return <span key={r.id} className={`mark mark--${m.tone}`}>{m.initials}</span>
        })}
      </button>
      {open && (
        <ul className="shop__break">
          {l.recipes.map((r) => {
            const m = markOf(r.id)
            return (
              <li key={r.id}>
                <span className={`mark mark--${m.tone}`}>{m.initials}</span>
                <span className="shop__break-title">{r.title}</span>
                <span className="shop__break-amt">{r.text}</span>
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}
