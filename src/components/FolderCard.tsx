import { IconPlus } from './Icons'
import { FolderGlyph, type FolderGlyphId } from './FolderIcons'

export type FolderTone = 'olive' | 'sage' | 'mustard' | 'rose' | 'terracotta'

export function folderTone(i: number): FolderTone {
  return (['mustard', 'rose', 'olive', 'sage', 'terracotta'] as FolderTone[])[i % 5]
}

/** A manila folder card: tab, a big food mark, and how many cards are inside. */
export function FolderCard({
  name,
  count,
  tone = 'mustard',
  icon,
  onClick,
  fresh,
}: {
  name: string
  count: number
  tone?: FolderTone
  icon?: FolderGlyphId
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
  return (
    <button type="button" className={`folder-card is-${tone}`} onClick={onClick} aria-label={`${name}, ${count} card${count === 1 ? '' : 's'}`}>
      <span className="folder-card__tab">{name}</span>
      <span className="folder-card__body">
        {icon && <span className="folder-card__glyph"><FolderGlyph id={icon} size={64} /></span>}
        <span className="folder-card__n">{count} card{count === 1 ? '' : 's'}</span>
      </span>
    </button>
  )
}
