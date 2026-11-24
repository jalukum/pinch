export const FOLDER_ICON_IDS = ['cupcake', 'cookie', 'taco', 'pizza', 'bowl', 'lemon', 'avocado', 'bread', 'egg', 'mug'] as const
export type FolderIconId = (typeof FOLDER_ICON_IDS)[number]
export type FolderGlyphId = FolderIconId | 'all' | 'unsorted'

/** Leftover ids from the first, non-food set — plus a couple of obvious aliases. */
const LEGACY: Record<string, FolderIconId> = {
  cake: 'cupcake',
  leaf: 'avocado',
  sun: 'lemon',
  mug: 'mug',
}

const DESSERT = /dessert|cake|cupcake|cookie|sweet|bakery|baking|pastry|pastries|pie\b|brownie|pudding|donut|doughnut|tart|chocolate|candy|treat|confection|ice\s*cream|biscotti|scone|muffin|frosting|biscuit/i

export function isFolderIcon(v: unknown): v is FolderIconId {
  return typeof v === 'string' && (FOLDER_ICON_IDS as readonly string[]).includes(v)
}

/** Resolve a stored mark, migrating leftover non-food ids. Dessert-ish names get a cupcake; everything else a bowl. */
export function folderIconOf(c?: { icon?: string; name?: string } | null): FolderIconId {
  if (c && isFolderIcon(c.icon)) return c.icon
  if (c && c.icon === 'cake') return 'cupcake'
  if (c && typeof c.name === 'string' && DESSERT.test(c.name)) return 'cupcake'
  if (c && typeof c.icon === 'string' && LEGACY[c.icon]) return LEGACY[c.icon]
  return 'bowl'
}
