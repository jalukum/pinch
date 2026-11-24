import { describe, expect, it } from 'vitest'
import { initials, listAsText, normalizeName, parseIngredient, pluralize, shoppingList, singularize, type ShopRecipe } from '../shop'

const rec = (id: string, title: string, items: string[], extra?: Partial<ShopRecipe>): ShopRecipe => ({
  id, title, factor: 1, ingredients: [{ items }], ...extra,
})

const grouped = (id: string, title: string, groups: { title?: string; items: string[] }[]): ShopRecipe => ({
  id, title, factor: 1, ingredients: groups,
})

const line = (list: ReturnType<typeof shoppingList>, keyOrText: string | RegExp) =>
  list.find((l) => l.key === keyOrText || (typeof keyOrText === 'string' ? l.text === keyOrText : keyOrText.test(l.text)))

describe('name normalization', () => {
  it('treats plurals, case, and prep as the same ingredient', () => {
    expect(singularize('limes')).toBe('lime')
    expect(normalizeName('Fresh Limes')).toBe('lime')
    expect(normalizeName('1 lime')).toBe('1 lime') // qty already stripped by parse, not here
    expect(normalizeName('flour, sifted')).toBe('flour')
    expect(normalizeName('chopped onion')).toBe('onion')
    expect(normalizeName('onion, diced')).toBe('onion')
    expect(normalizeName('all-purpose flour')).toBe('flour')
    expect(normalizeName('bread flour')).toBe('bread flour')
    expect(normalizeName('powdered sugar')).toBe('powdered sugar')
    expect(normalizeName('icing sugar')).toBe('powdered sugar')
    expect(pluralize('lime', 1)).toBe('lime')
    expect(pluralize('lime', 2)).toBe('limes')
    expect(pluralize('flour', 2)).toBe('flour')
  })
})

describe('shopping list merge', () => {
  it('adds 1 lime + 1 lime into 2 limes, with a marker for each recipe', () => {
    const salsa = rec('a', 'Salsa', ['1 lime', '2 tomatoes'])
    const tacos = rec('b', 'Fish Tacos', ['1 lime', '8 tortillas'])
    const list = shoppingList([salsa, tacos])
    const limes = line(list, 'lime')!
    expect(limes.text).toBe('2 limes')
    expect(limes.recipes.map((r) => r.id).sort()).toEqual(['a', 'b'])
    expect(limes.recipes.every((r) => /1 lime/.test(r.text))).toBe(true)
    expect(line(list, 'tomato')!.text).toBe('2 tomatoes')
    expect(line(list, 'tortilla')!.text).toBe('8 tortillas')
  })

  it('converts tablespoons and teaspoons in the same dimension', () => {
    const list = shoppingList([
      rec('a', 'Dressing', ['1 tbsp olive oil']),
      rec('b', 'Marinade', ['1 tsp olive oil']),
    ])
    expect(line(list, 'olive oil')!.text).toBe('1 tbsp + 1 tsp olive oil')
    const two = shoppingList([
      rec('a', 'A', ['1 tbsp soy sauce']),
      rec('b', 'B', ['2 tbsp soy sauce']),
    ])
    expect(line(two, 'soy sauce')!.text).toBe('3 tbsp soy sauce')
    const cup = shoppingList([
      rec('a', 'A', ['½ cup milk']),
      rec('b', 'B', ['½ cup milk']),
    ])
    expect(line(cup, 'milk')!.text).toBe('1 cup milk')
  })

  it('joins cup and gram amounts on one line when they cannot convert', () => {
    const list = shoppingList([
      rec('a', 'Cake', ['1 cup flour']),
      rec('b', 'Bread', ['200 g flour']),
    ])
    expect(line(list, 'flour')!.text).toBe('1 cup + 200 g flour')
    expect(line(list, 'flour')!.recipes).toHaveLength(2)
  })

  it('recomputes quantities when a recipe is removed', () => {
    const salsa = rec('a', 'Salsa', ['1 lime', '1 tbsp oil'])
    const tacos = rec('b', 'Tacos', ['1 lime', '2 tbsp oil'])
    const both = shoppingList([salsa, tacos])
    expect(line(both, 'lime')!.text).toBe('2 limes')
    expect(line(both, 'oil')!.text).toBe('3 tbsp oil')
    const justSalsa = shoppingList([salsa])
    expect(line(justSalsa, 'lime')!.text).toBe('1 lime')
    expect(line(justSalsa, 'oil')!.text).toBe('1 tbsp oil')
    expect(justSalsa.every((l) => l.recipes.every((r) => r.id === 'a'))).toBe(true)
  })

  it('flattens grouped ingredients and merges the same item across parts and recipes', () => {
    const cookies = grouped('c', 'Sugar Cookies', [
      { title: 'Dough', items: ['4 cups flour', '1 cup butter'] },
      { title: 'Frosting', items: ['2/3 cup flour', '4 tbsp butter'] },
    ])
    const cake = rec('k', 'Pound Cake', ['1 cup flour'])
    const list = shoppingList([cookies, cake])
    // 4 + 2/3 + 1 = 5 2/3 cups flour
    expect(line(list, 'flour')!.text).toMatch(/5\s*⅔ cups flour/)
    // 1 cup + 4 tbsp butter = 1 cup + 4 tbsp, or 1 1/4 cups
    expect(line(list, 'butter')!.text).toMatch(/butter/)
    expect(line(list, 'flour')!.recipes.map((r) => r.id).sort()).toEqual(['c', 'k'])
  })

  it('scales a recipe before merging, and handles ranges', () => {
    const doubled = rec('a', 'Salsa', ['1 lime', '2–3 tbsp oil'], { factor: 2, servings: 8, baseServings: 4 })
    const list = shoppingList([doubled])
    expect(line(list, 'lime')!.text).toBe('2 limes')
    expect(line(list, 'oil')!.text).toMatch(/4–6 tbsp oil/)
  })

  it('copies as text with recipe names on each line', () => {
    const text = listAsText(
      [rec('a', 'Salsa', ['1 lime']), rec('b', 'Tacos', ['1 lime'])],
      shoppingList([rec('a', 'Salsa', ['1 lime']), rec('b', 'Tacos', ['1 lime'])]),
    )
    expect(text).toMatch(/SHOPPING LIST/)
    expect(text).toMatch(/2 limes\s+\(Salsa, Tacos\)/)
  })
})

describe('parse + marks', () => {
  it('reads a quantity, unit and name', () => {
    expect(parseIngredient('2/3 cup flour, sifted')).toMatchObject({ lo: 2 / 3, unit: 'cup', dim: 'vol', key: 'flour' })
    expect(parseIngredient('1 lime')).toMatchObject({ lo: 1, dim: 'count', key: 'lime' })
    expect(parseIngredient('a pinch of salt')).toMatchObject({ lo: 1, unit: 'pinch', key: 'salt' })
  })
  it('makes brief initials for the legend', () => {
    expect(initials('Soft Sugar Cookies')).toBe('SS')
    expect(initials('Fish Tacos')).toBe('FT')
    expect(initials('Salsa')).toBe('SA')
  })
})
