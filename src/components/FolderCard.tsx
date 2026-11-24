import type { Recipe } from '../lib/types'
import { IconPlus, IconWhisk } from './Icons'

export type FolderTone = 'olive' | 'sage' | 'mustard' | 'rose' | 'terracotta'

export function folderTone(i: number): FolderTone {
  return (['mustard', 'rose', 'olive', 'sage', 'terracotta'] as FolderTone[])[i % 5]
}

/** A manila folder card: tab, name, count, and little peeks of what’s inside. */
export function FolderCard({
  name,
  count,
  recipes,
  tone = 'mustard',
  onClick,
  fresh,
}: {
  name: string
  count: number
  recipes: Recipe[]
  tone?: FolderTone
  onClick: () => void
  fresh?: boolean
}) {
  if (fresh) {
    return (
      <button type="button" className="folder-card folder-card--new" onClick={onClick} aria-label="New folder">
        <span className="folder-card__body">
          <IconPlus size={22} />
          <span className="folder-card__name">New folder</span>
        </span>
      </button>
    )
  }
  const peeks = recipes.slice(0, 3)
  return (
    <button type="button" className={`folder-card is-${tone}`} onClick={onClick} aria-label={`${name}, ${count} card${count === 1 ? '' : 's'}`}>
      <span className="folder-card__tab">{name}</span>
      <span className="folder-card__body">
        <span className="folder-card__peeks" aria-hidden>
          {peeks.length ? peeks.map((r, i) => (
            <span key={r.id} className="peek" style={{ ['--i' as any]: i }}>
              {r.imageData || r.image ? <img src={r.imageData || r.image} alt="" /> : <IconWhisk size={16} />}
            </span>
          )) : (
            <span className="folder-card__empty">empty</span>
          )}
        </span>
        <span className="folder-card__n">{count} card{count === 1 ? '' : 's'}</span>
      </span>
    </button>
  )
}
