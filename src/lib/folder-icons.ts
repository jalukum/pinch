export const FOLDER_ICON_IDS = ['star', 'heart', 'leaf', 'flame', 'cake', 'mug', 'sun', 'moon', 'fish', 'spoon'] as const
export type FolderIconId = (typeof FOLDER_ICON_IDS)[number]
export type FolderGlyphId = FolderIconId | 'all' | 'unsorted'

export function isFolderIcon(v: unknown): v is FolderIconId {
  return typeof v === 'string' && (FOLDER_ICON_IDS as readonly string[]).includes(v)
}

export function folderIconOf(c?: { icon?: string } | null): FolderIconId {
  return c && isFolderIcon(c.icon) ? c.icon : 'star'
}
