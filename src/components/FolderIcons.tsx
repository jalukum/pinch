import type { ReactElement, ReactNode, SVGProps } from 'react'
import { FOLDER_ICON_IDS, isFolderIcon, folderIconOf, type FolderIconId, type FolderGlyphId } from '../lib/folder-icons'
export { FOLDER_ICON_IDS, isFolderIcon, folderIconOf, type FolderIconId, type FolderGlyphId }

type P = SVGProps<SVGSVGElement> & { size?: number }

function G({ size = 32, children, ...p }: P & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...p}
    >
      {children}
    </svg>
  )
}

const Cupcake = ({ size, ...p }: P) => (
  <G size={size} {...p}>
    <path fill="var(--food-liner)" d="M9.2 18.2c.8.6 1.8.4 2.6.1.9.5 1.8.5 2.7 0 .9.5 1.8.5 2.7.1.8.4 1.8.5 2.6-.1l1 8.2c.15 1.2-.8 1.9-2 1.9H10.2c-1.2 0-2.15-.7-2-1.9z" />
    <path d="M12.2 20.2v6.2M16 19.8v6.8M19.8 20.2v6.2" />
    <path fill="var(--food-cream)" d="M9.4 18.6c-1.4-2.2-.4-4.6 1.6-5.4.3-2 2-3.4 3.9-3.2 1.1-1.8 3.6-1.9 5-.2 2-.6 3.8.8 3.9 2.8 1.6.8 2.2 3.2.6 5.2-.8.4-1.6.2-2.4 0-.9.4-1.8.5-2.7.1-.9.4-1.8.4-2.7-.1-.8.3-1.6.4-2.4-.2z" />
    <circle fill="var(--food-berry)" cx="16.2" cy="8.2" r="1.9" />
    <path d="M16.3 6.5c.6-1.3 2-1.8 3.1-1.3" />
  </G>
)
const Cookie = ({ size, ...p }: P) => (
  <G size={size} {...p}>
    <circle fill="var(--food-crust)" cx="16" cy="16.4" r="10" />
    <circle fill="var(--food-chip)" stroke="none" cx="12.2" cy="13" r="1.4" />
    <circle fill="var(--food-chip)" stroke="none" cx="18.6" cy="12.2" r="1.25" />
    <circle fill="var(--food-chip)" stroke="none" cx="15.2" cy="17.4" r="1.45" />
    <circle fill="var(--food-chip)" stroke="none" cx="20" cy="17.8" r="1.2" />
    <circle fill="var(--food-chip)" stroke="none" cx="12.8" cy="19.6" r="1.15" />
    <circle fill="var(--food-chip)" stroke="none" cx="16.8" cy="14.2" r="1.05" />
  </G>
)
const Taco = ({ size, ...p }: P) => (
  <G size={size} {...p}>
    <path fill="var(--food-shell)" d="M6 7.2c-1 8.8 0 16.2 4 19 2.5 1.6 9.5 1.6 12 0 4-2.8 5-10.2 4-19-.8-.8-2.2-.2-3.2.6V21c-.5 2.5-4 3.6-6.8 3.6S10.5 23.5 10 21V7.8C9 7 7.2 6.4 6 7.2z" />
    <path fill="var(--food-pit)" stroke="none" d="M10 9.2v11.6c.5 2.2 3.6 3.2 6 3.2s5.5-1 6-3.2V9.2c-2-.8-4-.8-6-.8s-4 0-6 .8z" />
    <path fill="var(--food-leaf)" d="M10 12.2c1-5.8 3.6-7.2 6-7.2s5 1.4 6 7.2c-2.4-1.6-9.6-1.6-12 0z" />
    <circle fill="var(--food-sauce)" stroke="none" cx="13" cy="10.4" r="1.35" />
    <circle fill="var(--food-sauce)" stroke="none" cx="16.2" cy="9.2" r="1.5" />
    <circle fill="var(--food-sauce)" stroke="none" cx="19.4" cy="10.5" r="1.25" />
  </G>
)
const Pizza = ({ size, ...p }: P) => (
  <G size={size} {...p}>
    <path fill="var(--food-crust)" d="M5.8 10.4C8.2 5.2 23.8 5.2 26.2 10.4L16 27.4z" />
    <path fill="var(--food-sauce)" d="M7.8 10.9C9.8 7.2 22.2 7.2 24.2 10.9L16 24.6z" />
    <circle fill="var(--food-pepperoni)" stroke="none" cx="13.1" cy="13.2" r="1.85" />
    <circle fill="var(--food-pepperoni)" stroke="none" cx="18.7" cy="12.6" r="1.65" />
    <circle fill="var(--food-pepperoni)" stroke="none" cx="16.1" cy="17.6" r="1.75" />
  </G>
)
const Bowl = ({ size, ...p }: P) => (
  <G size={size} {...p}>
    <ellipse fill="var(--food-yolk)" cx="16" cy="14.2" rx="10.6" ry="3.3" />
    <path fill="var(--food-mug)" d="M5.4 14.2c.6 3.8 2.8 10 10.6 10s10-6.2 10.6-10c-3 2.4-6.4 3.4-10.6 3.4S8.4 16.6 5.4 14.2z" />
    <ellipse cx="16" cy="14.2" rx="10.6" ry="3.3" />
    <path d="M9.4 14c2.2-2.8 4.4-3.2 6.2.1 1.8 3.2 4.4 3.4 6.8.1" />
    <path d="M11 16.2c1.8-1.8 3.4-1.8 5 0 1.8 2 3.6 2.2 5.4.2" />
    <path d="M20.2 5.6 14.8 14.2" />
    <path d="M23.2 6.2 16.6 15" />
  </G>
)
const Lemon = ({ size, ...p }: P) => (
  <G size={size} {...p}>
    <path fill="var(--food-lemon)" d="M16 4.2c2.2.4 5.6 2.4 7.2 6 1.6 3.6 1.4 7.6-.4 10.8-1.8 3.2-5 5.2-7.4 5.4-2.4-.2-5.6-2.2-7.4-5.4C6.2 17.8 6 13.8 7.6 10.2 9.2 6.6 12.6 4.6 16 4.2z" />
    <path fill="var(--food-leaf)" d="M20.6 6.4c2.6-2 5.6-.4 6 2.2-2.6 1.2-4.6.6-6-2.2z" />
    <path d="M12 10.2c1.4-1.8 3.2-2.4 4.6-2" opacity={0.7} />
  </G>
)
const Avocado = ({ size, ...p }: P) => (
  <G size={size} {...p}>
    <path fill="var(--food-avocado)" d="M16 4.6c3.2 0 6.3 2.6 6.5 6.5.4 5.2-2.3 14.2-6.5 14.2s-6.9-9-6.5-14.2C9.7 7.2 12.8 4.6 16 4.6z" />
    <circle fill="var(--food-pit)" cx="16.3" cy="15.2" r="4.15" />
  </G>
)
const Bread = ({ size, ...p }: P) => (
  <G size={size} {...p}>
    <path fill="var(--food-bread)" d="M4.8 19c-.2-5 3-8.4 7.2-8.8 5.2-1 10.8-.4 14.2 1 2 .8 2.6 3.4 2.4 7.2-.2 4-2.8 6.6-12 6.8-8.8.2-11.4-2.2-11.8-6.2z" />
    <ellipse fill="var(--food-cream)" cx="8.4" cy="18.6" rx="3.5" ry="5.1" />
    <path d="M12.2 13c1.7-1 3.4-.8 4.8.4" />
    <path d="M16.8 12.4c1.6-1 3.4-.6 4.8.6" />
    <path d="M21.2 12.8c1.4-.8 3-.4 4 .8" />
  </G>
)
const Egg = ({ size, ...p }: P) => (
  <G size={size} {...p}>
    <path fill="var(--food-foam)" d="M8.2 14.2c-2-3.6 1.2-7.4 5.2-6.8 2-2.4 6.4-2.2 8.2.6 2.4-.4 6 1.4 5.6 4.8 2 2.2.2 6.4-3.6 7.2-2 2.8-6.8 3-9.2.2-3.2.6-7-1.2-6.2-6z" />
    <circle fill="var(--food-yolk)" cx="15.6" cy="15.4" r="5" />
    <circle fill="var(--food-foam)" stroke="none" cx="14" cy="13.8" r="1.15" />
  </G>
)
const Mug = ({ size, ...p }: P) => (
  <G size={size} {...p}>
    <path fill="var(--food-mug)" d="M7.5 11.6h13.2c.2 4.8.2 8.4-1.2 10.4-1.2 1.8-3.4 2.4-5.4 2.4s-4.2-.6-5.4-2.4c-1.4-2-1.4-5.6-1.2-10.4z" />
    <ellipse fill="var(--food-coffee)" cx="14.1" cy="11.6" rx="6.6" ry="2.15" />
    <path d="M20.7 13.4c3.6.2 5 2 5 4.2 0 2.4-1.6 4-5 4.2" />
    <path d="M11.2 8.6c1.2-1.2-.4-2.2.8-3.6" />
    <path d="M15.2 8.2c1.2-1.2-.4-2 .8-3.4" />
  </G>
)

/** Fixed glyphs for the two system folders — not in the picker. */
const All = ({ size, ...p }: P) => (
  <G size={size} {...p}>
    <path fill="var(--food-paper)" d="M4.6 12.2h22.8v13.4c0 .6-.5 1.1-1.1 1.1H5.7c-.6 0-1.1-.5-1.1-1.1z" />
    <path fill="var(--food-bread)" d="M7.2 12.2c.1-2.2.3-4.2.6-6.2 2.4-.2 4.6-.1 7 0 .3 2 .4 4 .4 6.2" />
    <path fill="var(--food-crust)" d="M13.8 12.2c.3-1.7.6-3.2 1.1-4.6 2.4 0 4.8 0 7.2.2.3 1.4.5 2.9.5 4.4" />
  </G>
)
const Loose = ({ size, ...p }: P) => (
  <G size={size} {...p}>
    <path fill="var(--food-paper)" d="M9.2 5h13.2c.8 0 1.5.6 1.5 1.4v11.2" />
    <path fill="var(--food-cream)" d="M6 8.6h14.2c.9 0 1.6.7 1.6 1.6v12.6c0 .9-.7 1.6-1.6 1.6H6.2c-.9 0-1.6-.7-1.6-1.6V10.2c0-.9.7-1.6 1.6-1.6z" />
  </G>
)

const GLYPHS: Record<FolderGlyphId, (p: P) => ReactElement> = {
  cupcake: Cupcake, cookie: Cookie, taco: Taco, pizza: Pizza, bowl: Bowl,
  lemon: Lemon, avocado: Avocado, bread: Bread, egg: Egg, mug: Mug,
  all: All, unsorted: Loose,
}

const LABELS: Record<FolderGlyphId, string> = {
  cupcake: 'Cupcake', cookie: 'Cookie', taco: 'Taco', pizza: 'Pizza', bowl: 'Bowl',
  lemon: 'Lemon', avocado: 'Avocado', bread: 'Bread', egg: 'Fried egg', mug: 'Mug',
  all: 'All', unsorted: 'Unsorted',
}

export function FolderGlyph({ id, size = 32, ...p }: P & { id: FolderGlyphId }) {
  const Gph = GLYPHS[id] || Bowl
  return <Gph size={size} {...p} />
}

/** A 5×2 grid of the ten pickable food marks. */
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
            <FolderGlyph id={id} size={32} />
          </button>
        ))}
      </div>
    </fieldset>
  )
}
