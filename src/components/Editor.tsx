import { useEffect, useRef, useState } from 'react'
import type { Recipe } from '../lib/types'
import { fromFields, toFields, type EditFields } from '../lib/edit'
import { IconBack } from './Icons'
import { Tape } from './Ornaments'

/** Fix or fill a card by hand. Looks like writing on a ruled index card. */
export function Editor({ recipe, isNew, onCancel, onDone }: { recipe: Recipe; isNew: boolean; onCancel: () => void; onDone: (r: Recipe) => void }) {
  const [f, setF] = useState<EditFields>(() => toFields(recipe))
  const title = useRef<HTMLInputElement>(null)
  useEffect(() => {
    window.scrollTo({ top: 0 })
    if (!f.title) title.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const set = (k: keyof EditFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }))
  const rows = (s: string, min: number) => Math.max(min, s.split('\n').length + 1)
  const canSave = f.title.trim() || f.ingredients.trim() || f.steps.trim()

  return (
    <article className="recipe editor" aria-labelledby="edit-h">
      <nav className="topbar">
        <button className="link-btn" onClick={onCancel}>
          <IconBack size={20} /> <span>{isNew ? 'Back' : 'Cancel'}</span>
        </button>
      </nav>
      <header className="recipe__head">
        <p className="kicker">{recipe.url ? `from ${recipe.siteName}` : 'written by hand'}</p>
        <h1 id="edit-h" className="recipe__title">{isNew ? 'Write the card' : 'Fix up the card'}</h1>
        <p className="hand-note">Fill in what’s missing. A line starting with ## starts a new group, like “## For the sauce”.</p>
      </header>

      <form
        className="card card--ruled edit-card"
        onSubmit={(e) => {
          e.preventDefault()
          if (canSave) onDone(fromFields(recipe, f))
        }}
      >
        <Tape className="tape--top" tone="sage" />
        <label className="ef">
          <span>Title</span>
          <input ref={title} value={f.title} onChange={set('title')} placeholder="Grandma’s lemon cake" autoCapitalize="words" />
        </label>
        <div className="ef-row">
          <label className="ef"><span>Prep</span><input value={f.prep} onChange={set('prep')} placeholder="15 min" inputMode="text" /></label>
          <label className="ef"><span>Cook</span><input value={f.cook} onChange={set('cook')} placeholder="1 hr" /></label>
          <label className="ef"><span>Makes</span><input value={f.makes} onChange={set('makes')} placeholder="8 slices" /></label>
        </div>
        <label className="ef">
          <span>Ingredients <em>one per line</em></span>
          <textarea value={f.ingredients} onChange={set('ingredients')} rows={rows(f.ingredients, 6)} placeholder={'2 cups flour\n1 tsp baking soda\n3 eggs'} />
        </label>
        <label className="ef">
          <span>Method <em>one step per line</em></span>
          <textarea value={f.steps} onChange={set('steps')} rows={rows(f.steps, 6)} placeholder={'Heat the oven to 350°F.\nWhisk the dry things together.'} />
        </label>
        <label className="ef">
          <span>Notes <em>optional</em></span>
          <textarea value={f.notes} onChange={set('notes')} rows={rows(f.notes, 2)} placeholder="Keeps three days in a tin." />
        </label>
        <label className="ef">
          <span>Photo link <em>optional</em></span>
          <input value={f.image} onChange={set('image')} type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="https://…/photo.jpg" />
        </label>
        <div className="edit-card__actions">
          <button type="button" className="btn btn--quiet" onClick={onCancel}>{isNew ? 'Back' : 'Cancel'}</button>
          <button type="submit" className="btn" disabled={!canSave}>{isNew ? 'Make the card' : 'Done'}</button>
        </div>
      </form>
    </article>
  )
}

/** Paste the whole recipe as text (Safari Reader → select all → copy). */
export function PasteText({ onParse, onClose }: { onParse: (text: string) => boolean; onClose: () => void }) {
  const [t, setT] = useState('')
  const [miss, setMiss] = useState(false)
  const fromClipboard = async () => {
    try {
      const c = await navigator.clipboard.readText()
      if (c) setT(c)
    } catch {
      /* the user can long-press and paste */
    }
  }
  return (
    <div className="paste-text">
      <h2>Paste the recipe text</h2>
      <p className="muted">
        On the recipe page in Safari, tap <b>aA</b> and choose <b>Show Reader</b> (or just select everything), copy it, and paste it here. I’ll sort the ingredients from the steps.
      </p>
      <textarea
        className="paste-text__area"
        value={t}
        onChange={(e) => {
          setT(e.target.value)
          setMiss(false)
        }}
        rows={9}
        placeholder={'Lemon Drizzle Cake\n\nIngredients\n225g butter\n225g caster sugar\n…\n\nMethod\nHeat the oven to 180C…'}
      />
      {miss && <p className="hand-note">Couldn’t tell ingredients from steps there. I’ll open it as a card you can tidy by hand.</p>}
      <div className="sheet__actions">
        <button className="btn btn--quiet" onClick={t ? onClose : fromClipboard}>{t ? 'Cancel' : 'Paste from clipboard'}</button>
        <button className="btn" disabled={!t.trim()} onClick={() => setMiss(!onParse(t))}>Make the card</button>
      </div>
    </div>
  )
}
