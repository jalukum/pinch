import type { ReactElement, SVGProps } from 'react'
import { FOLDER_ICON_IDS, isFolderIcon, folderIconOf, type FolderIconId, type FolderGlyphId } from '../lib/folder-icons'
export { FOLDER_ICON_IDS, isFolderIcon, folderIconOf, type FolderIconId, type FolderGlyphId }

/* Super simple, slightly wobbly 24px glyphs — cute, few lines. */
type P = SVGProps<SVGSVGElement> & { size?: number }
const base = (size = 22) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
})

const Star = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 4.2 14 9.4h5.4l-4.3 3.3 1.6 5.3L12 15.2 7.3 18l1.6-5.3-4.3-3.3H10z" /></svg>
)
const Heart = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 18.6C8.2 15.2 5 12.4 5 9.1 5 7 6.6 5.4 8.7 5.4c1.2 0 2.3.6 3.3 1.8 1-1.2 2.1-1.8 3.3-1.8 2.1 0 3.7 1.6 3.7 3.7 0 3.3-3.2 6.1-7 9.5z" /></svg>
)
const Leaf = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 20C7.2 15.4 5.4 9.4 12 4.4 18.6 9.4 16.8 15.4 12 20z" /><path d="M12 20V8.4" /></svg>
)
const Flame = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 20c3.4-1.2 5.4-4 5.2-7.4-.2-3-1.8-5-3.6-7.2.2 2.4-.8 3.8-2.2 4.4C11.2 6.2 9.6 4.2 8 3.6c-.2 3.6-2.6 6.4-2.6 9.4 0 3.2 2.2 5.8 6.6 7z" /></svg>
)
const Cake = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M6 19.2h12v-4.2H6z" /><path d="M8 15V12h8v3" /><path d="M12 12V8.6" /><path d="M12 8.6c.8-.1 1.2-.9.2-1.6-.7.4-1.2 1.1-.2 1.6z" /></svg>
)
const Mug = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M6.6 7.6h9.2v8c0 2.2-2 3.6-4.6 3.6s-4.6-1.4-4.6-3.6z" /><path d="M15.8 9.2c2.4.2 3.4 1.4 3.4 3.2 0 1.7-1.1 2.8-3.4 3" /></svg>
)
const Sun = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 8.8a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4z" /><path d="M12 4v1.8M12 18.2V20M4 12h1.8M18.2 12H20M6.5 6.5l1.3 1.3M16.2 16.2l1.3 1.3M6.5 17.5l1.3-1.3M16.2 7.8l1.3-1.3" /></svg>
)
const Moon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M14.2 5.2A7 7 0 1 0 18.6 16 5.8 5.8 0 0 1 14.2 5.2z" /></svg>
)
const Fish = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4.4 12.2c4-4.4 9.4-4.6 13.4-1.8-3.8 4.6-9.4 4.8-13.4 1.8z" /><path d="M17.4 10.6 20.6 7.8M17.4 13.6l3.2 2.8" /><path d="M8.2 11.2h.1" strokeWidth="2.2" /></svg>
)
const Spoon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 4.2c2.5 0 4.2 1.7 4.2 3.6S14.3 11 12 11s-4.2-1.4-4.2-3.2S9.5 4.2 12 4.2z" /><path d="M12 11.2v8.6" /></svg>
)

/** Fixed glyphs for the two system folders — not in the picker. */
const All = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4.2 9.4c5.2-.1 10.4 0 15.6-.1.2 3.4.1 6.8-.1 10.1-5.1.2-10.2.1-15.3 0-.3-3.3-.3-6.7-.2-10z" /><path d="M6.4 9.3c.1-1.8.2-3.4.5-5 1.8-.2 3.5-.1 5.3 0 .3 1.7.3 3.3.3 5" /><path d="M11.2 9.3c.3-1.4.5-2.6.9-3.7 1.8 0 3.6 0 5.4.2.3 1.2.4 2.4.4 3.5" /></svg>
)
const Loose = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M7.8 5.2h10c.7 0 1.3.6 1.3 1.3v9.4" /><path d="M5.2 7.8h10.4c.8 0 1.4.6 1.4 1.4v9.2c0 .8-.6 1.4-1.4 1.4H5.4c-.8 0-1.4-.6-1.4-1.4V9.2c0-.8.6-1.4 1.4-1.4z" /></svg>
)

const GLYPHS: Record<FolderGlyphId, (p: P) => ReactElement> = {
  star: Star, heart: Heart, leaf: Leaf, flame: Flame, cake: Cake,
  mug: Mug, sun: Sun, moon: Moon, fish: Fish, spoon: Spoon,
  all: All, unsorted: Loose,
}

const LABELS: Record<FolderGlyphId, string> = {
  star: 'Star', heart: 'Heart', leaf: 'Leaf', flame: 'Flame', cake: 'Cake',
  mug: 'Mug', sun: 'Sun', moon: 'Moon', fish: 'Fish', spoon: 'Spoon',
  all: 'All', unsorted: 'Unsorted',
}
export function FolderGlyph({ id, size = 22, ...p }: P & { id: FolderGlyphId }) {
  const G = GLYPHS[id] || Star
  return <G size={size} {...p} />
}

/** A 5×2 grid of the ten pickable marks. */
export function IconPicker({ value, onChange }: { value: FolderIconId; onChange: (id: FolderIconId) => void }) {
  return (
    <fieldset className="icon-picker">
      <legend>A little mark</legend>
      <div className="icon-picker__grid">
        {FOLDER_ICON_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={`icon-pick ${value === id ? 'is-on' : ''}`}
            onClick={() => onChange(id)}
            aria-label={LABELS[id]}
            aria-pressed={value === id}
          >
            <FolderGlyph id={id} size={22} />
          </button>
        ))}
      </div>
    </fieldset>
  )
}
