import { describe, expect, it } from 'vitest'
import { collectionsFromBackup } from '../storage'
import { FOLDER_ICON_IDS, isFolderIcon, folderIconOf } from '../folder-icons'

describe('folder icons', () => {
  it('has exactly ten pickable marks', () => {
    expect(FOLDER_ICON_IDS).toHaveLength(10)
    expect(new Set(FOLDER_ICON_IDS).size).toBe(10)
  })
  it('accepts only those marks, and defaults a folder to a star', () => {
    expect(isFolderIcon('cake')).toBe(true)
    expect(isFolderIcon('all')).toBe(false)
    expect(isFolderIcon('unsorted')).toBe(false)
    expect(isFolderIcon('nope')).toBe(false)
    expect(folderIconOf({})).toBe('star')
    expect(folderIconOf({ icon: 'fish' })).toBe('fish')
  })
  it('keeps a valid icon on backup import and drops junk', () => {
    const [kept] = collectionsFromBackup({ collections: [{ name: 'Desserts', recipeIds: ['a'], icon: 'cake' }] })
    expect(kept.icon).toBe('cake')
    const [plain] = collectionsFromBackup({ collections: [{ name: 'Old', recipeIds: [] }] })
    expect(plain.icon).toBeUndefined()
  })
})
