import { useState } from 'react'
import type { Collection } from '../lib/storage'
import { IconPlus, IconTrash } from './Icons'
import { FolderGlyph, IconPicker, folderIconOf, type FolderIconId } from './FolderIcons'

/** File one or more cards under existing folders, or start a new one. */
export function CollectSheet({
  collections,
  selected,
  inIds,
  onToggle,
  onCreate,
  onClose,
}: {
  collections: Collection[]
  selected: string[]
  inIds: (id: string) => boolean | 'some'
  onToggle: (id: string, on: boolean) => void
  onCreate: (name: string, icon: FolderIconId) => void
  onClose: () => void
}) {
  const [adding, setAdding] = useState(selected.length === 0)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<FolderIconId>('bowl')
  const n = selected.length
  const filing = n > 0
  const create = () => {
    const t = name.trim()
    if (!t) return
    onCreate(t, icon)
    setName('')
    setIcon('bowl')
    setAdding(false)
  }
  return (
    <div className="collect">
      <h2>{filing ? (n === 1 ? 'File this card under' : `File ${n} cards under`) : 'A new folder'}</h2>
      {collections.length === 0 && !adding && <p className="muted">Start one for desserts, weeknights, or whatever you like. A card can live in more than one.</p>}
      <ul className="collect__list">
        {collections.map((c) => {
          const state = inIds(c.id)
          const checked = state === true
          return (
            <li key={c.id}>
              <label className={`check ${checked || state === 'some' ? 'is-done' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  ref={(el) => { if (el) el.indeterminate = state === 'some' }}
                  onChange={() => onToggle(c.id, !checked)}
                />
                <span className="check__box" aria-hidden>
                  <svg viewBox="0 0 24 24"><path d="M5 12.8c1.4 1.4 2.8 2.9 4.1 4.4 3.2-3.8 6.4-7.5 9.9-11" /></svg>
                </span>
                <span className="collect__mark" aria-hidden><FolderGlyph id={folderIconOf(c)} size={22} /></span>
                <span className="check__text">{c.name}</span>
                <span className="collect__n">{c.recipeIds.length}</span>
              </label>
            </li>
          )
        })}
      </ul>
      {adding ? (
        <form
          className="collect__new"
          onSubmit={(e) => {
            e.preventDefault()
            create()
          }}
        >
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Desserts, weeknight…" autoFocus />
          </label>
          <IconPicker value={icon} onChange={setIcon} />
          <div className="sheet__actions">
            <button type="button" className="btn btn--quiet" onClick={() => setAdding(false)}>Cancel</button>
            <button type="submit" className="btn" disabled={!name.trim()}>Start folder</button>
          </div>
        </form>
      ) : (
        <div className="sheet__actions">
          <button className="btn btn--quiet" onClick={() => { setAdding(true); setIcon('bowl') }}><IconPlus size={16} /> New folder</button>
          <button className="btn" onClick={onClose}>Done</button>
        </div>
      )}
    </div>
  )
}

export function ManageCollection({
  collection,
  onSave,
  onDelete,
  onClose,
}: {
  collection: Collection
  onSave: (name: string, icon: FolderIconId) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(collection.name)
  const [icon, setIcon] = useState<FolderIconId>(folderIconOf(collection))
  const [sure, setSure] = useState(false)
  const dirty = name.trim() !== collection.name || icon !== folderIconOf(collection)
  return (
    <div className="collect">
      <h2>This folder</h2>
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <IconPicker value={icon} onChange={setIcon} />
      {sure ? (
        <p className="muted">Remove “{collection.name}”? The cards stay in the box; only the folder goes.</p>
      ) : null}
      <div className="sheet__actions">
        {sure ? (
          <>
            <button className="btn btn--quiet" onClick={() => setSure(false)}>Keep it</button>
            <button className="btn btn--danger" onClick={onDelete}><IconTrash size={16} /> Remove folder</button>
          </>
        ) : (
          <>
            <button className="btn btn--quiet" onClick={() => setSure(true)}>Remove</button>
            <button
              className="btn"
              disabled={!name.trim() || !dirty}
              onClick={() => { onSave(name.trim(), icon); onClose() }}
            >
              Save
            </button>
            <button className="btn btn--quiet" onClick={onClose}>Close</button>
          </>
        )}
      </div>
    </div>
  )
}

export function folderCount(c: Collection, recipeIds: Set<string>) {
  return c.recipeIds.filter((id) => recipeIds.has(id)).length
}
