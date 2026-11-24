import { describe, expect, it } from 'vitest'
import { collectionsFromBackup } from '../storage'
import { FOLDER_ICON_IDS, isFolderIcon, folderIconOf } from '../folder-icons'

describe('folder icons', () => {
  it('has exactly ten pickable food marks', () => {
    expect(FOLDER_ICON_IDS).toHaveLength(10)
    expect(new Set(FOLDER_ICON_IDS).size).toBe(10)
    expect(FOLDER_ICON_IDS).toEqual(['cupcake', 'cookie', 'taco', 'pizza', 'bowl', 'lemon', 'avocado', 'bread', 'egg', 'mug'])
  })
  it('accepts only those marks, and defaults a folder to a bowl', () => {
    expect(isFolderIcon('cupcake')).toBe(true)
    expect(isFolderIcon('cake')).toBe(false)
    expect(isFolderIcon('star')).toBe(false)
    expect(isFolderIcon('all')).toBe(false)
    expect(isFolderIcon('unsorted')).toBe(false)
    expect(isFolderIcon('nope')).toBe(false)
    expect(folderIconOf({})).toBe('bowl')
    expect(folderIconOf({ icon: 'taco' })).toBe('taco')
  })
  it('migrates leftover non-food marks, with dessert-ish names becoming a cupcake', () => {
    expect(folderIconOf({ icon: 'cake' })).toBe('cupcake')
    expect(folderIconOf({ icon: 'star', name: 'Desserts' })).toBe('cupcake')
    expect(folderIconOf({ icon: 'heart', name: 'Weeknight' })).toBe('bowl')
    expect(folderIconOf({ name: 'Cookies' })).toBe('cupcake')
    expect(folderIconOf({ icon: 'leaf' })).toBe('avocado')
    expect(folderIconOf({ icon: 'sun' })).toBe('lemon')
  })
  it('keeps a valid icon on backup import and migrates junk', () => {
    const [kept] = collectionsFromBackup({ collections: [{ name: 'Tacos', recipeIds: ['a'], icon: 'taco' }] })
    expect(kept.icon).toBe('taco')
    const [fromCake] = collectionsFromBackup({ collections: [{ name: 'Desserts', recipeIds: ['a'], icon: 'cake' }] })
    expect(fromCake.icon).toBe('cupcake')
    const [fromStar] = collectionsFromBackup({ collections: [{ name: 'Desserts', recipeIds: ['a'], icon: 'star' }] })
    expect(fromStar.icon).toBe('cupcake')
    const [plain] = collectionsFromBackup({ collections: [{ name: 'Old', recipeIds: [] }] })
    expect(plain.icon).toBe('bowl')
  })
})
