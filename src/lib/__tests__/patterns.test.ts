import { describe, it, expect } from 'vitest'
import { parseRecipeHtml, fromRdfa, fromPlugins, fromNextData, fromHeadings, fromText, pageBasics, alternateLinks, looksLikeIngredient } from '../parse'
import { tidyIngredient } from '../text'
import { groupsToText, textToIngredients, textToSteps, minutesFrom, toFields, fromFields, blankRecipe } from '../edit'
import { fussyFor } from '../fussy'

const U = 'https://example.com/r/soup'
const page = (head: string, body = '') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`
const dom = (html: string) => new DOMParser().parseFromString(html, 'text/html')
const items = (r: any) => r.ingredients.flatMap((g: any) => g.items)
const steps = (r: any) => r.instructions.flatMap((g: any) => g.steps)

describe('RDFa', () => {
  it('reads schema.org Recipe properties', () => {
    const html = page('', `<div vocab="https://schema.org/" typeof="Recipe">
      <h1 property="name">Tomato Soup</h1>
      <meta property="prepTime" content="PT10M"><meta property="cookTime" content="PT20M">
      <span property="recipeYield">4 servings</span>
      <li property="recipeIngredient">4 tomatoes</li><li property="recipeIngredient">1 onion</li>
      <div property="recipeInstructions"><p>Chop.</p><p>Simmer.</p></div></div>`)
    const r = fromRdfa(dom(html), U)!
    expect(r.title).toBe('Tomato Soup')
    expect(items(r)).toEqual(['4 tomatoes', '1 onion'])
    expect(steps(r)).toEqual(['Chop.', 'Simmer.'])
    expect(r.totalTime).toBe(30)
    expect(r.servings).toBe(4)
  })
})

describe('recipe plugins', () => {
  const cases: [string, string][] = [
    ['WP Recipe Maker', `<div class="wprm-recipe-container"><h2 class="wprm-recipe-name">Plugin Soup</h2>
      <div class="wprm-recipe-ingredient-group"><h4 class="wprm-recipe-group-name">Soup</h4><ul><li class="wprm-recipe-ingredient">2 cups stock</li><li class="wprm-recipe-ingredient">1 leek</li></ul></div>
      <div class="wprm-recipe-instruction-group"><ul><li class="wprm-recipe-instruction"><div class="wprm-recipe-instruction-text">Simmer it.</div></li></ul></div></div>`],
    ['Tasty Recipes', `<div class="tasty-recipes"><h2 class="tasty-recipes-title">Plugin Soup</h2>
      <div class="tasty-recipes-ingredients"><ul><li>2 cups stock</li><li>1 leek</li></ul></div>
      <div class="tasty-recipes-instructions"><ol><li>Simmer it.</li></ol></div></div>`],
    ['Mediavine', `<div class="mv-create-card"><h2 class="mv-create-title">Plugin Soup</h2>
      <div class="mv-create-ingredients"><ul><li>2 cups stock</li><li>1 leek</li></ul></div>
      <div class="mv-create-instructions"><ol><li>Simmer it.</li></ol></div></div>`],
    ['ZipList', `<div id="zlrecipe-container"><div id="zlrecipe-title">Plugin Soup</div>
      <ul id="zlrecipe-ingredients-list"><li>2 cups stock</li><li>1 leek</li></ul><ol id="zlrecipe-instructions-list"><li>Simmer it.</li></ol></div>`],
    ['Cooked', `<div class="cooked-recipe"><h1 class="cooked-recipe-title">Plugin Soup</h1>
      <div class="cooked-single-ingredient"><span class="cooked-ing-name">2 cups stock</span></div><div class="cooked-single-ingredient"><span class="cooked-ing-name">1 leek</span></div>
      <div class="cooked-single-direction"><div class="cooked-dir-content">Simmer it.</div></div></div>`],
    ['EasyRecipe', `<div class="easyrecipe"><div class="ERSName">Plugin Soup</div><div class="ERSIngredients"><ul><li>2 cups stock</li><li>1 leek</li></ul></div>
      <div class="ERSInstructions"><ol><li>Simmer it.</li></ol></div></div>`],
    ['WPZOOM', `<div class="wp-block-wpzoom-recipe-card-block-recipe-card"><h2 class="recipe-card-title">Plugin Soup</h2>
      <ul class="ingredients-list"><li>2 cups stock</li><li>1 leek</li></ul><ul class="directions-list"><li>Simmer it.</li></ul></div>`],
  ]
  for (const [name, body] of cases) {
    it(name, () => {
      const r = fromPlugins(dom(page('', body)), U)!
      expect(r, name).toBeTruthy()
      expect(r.title).toBe('Plugin Soup')
      expect(items(r)).toEqual(['2 cups stock', '1 leek'])
      expect(steps(r)).toEqual(['Simmer it.'])
    })
  }
  it('keeps WPRM group titles', () => {
    const r = fromPlugins(dom(page('', cases[0][1])), U)!
    expect(r.ingredients[0].title).toBe('Soup')
  })
})

describe('embedded app JSON', () => {
  it('finds a recipe inside __NEXT_DATA__', () => {
    const data = { props: { pageProps: { content: { title: 'Next Noodles', ingredients: [{ text: '200g noodles' }, { quantity: '2', unit: 'tbsp', name: 'soy sauce' }], instructions: [{ text: 'Boil.' }, { text: 'Toss.' }] } } } }
    const html = page('', `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`)
    const r = fromNextData(dom(html), U)!
    expect(r.title).toBe('Next Noodles')
    expect(items(r)).toEqual(['200g noodles', '2 tbsp soy sauce'])
    expect(steps(r)).toEqual(['Boil.', 'Toss.'])
  })
})

describe('heading heuristic', () => {
  it('reads Ingredients / Directions headings from a plain blog post', () => {
    const html = page('<meta property="og:title" content="Grandma Bread">', `<article><h1>Grandma Bread</h1><p>Story time.</p>
      <h2>Ingredients</h2><ul><li>500g flour</li><li>7g yeast</li><li>300ml water</li></ul>
      <h2>Directions</h2><ol><li>Mix everything.</li><li>Bake at 220C for 30 minutes.</li></ol></article>`)
    const r = fromHeadings(dom(html), U)!
    expect(r.title).toBe('Grandma Bread')
    expect(items(r)).toEqual(['500g flour', '7g yeast', '300ml water'])
    expect(steps(r)).toEqual(['Mix everything.', 'Bake at 220C for 30 minutes.'])
    // and the full pipeline gets there too
    expect(items(parseRecipeHtml(html, U)!)).toHaveLength(3)
  })
})

describe('pasted text', () => {
  it('splits headed text with groups, time and yield', () => {
    const r = fromText(`Lemon Cake\nServes 8\nPrep: 15 min\nCook time 45 minutes\n\nIngredients\nFor the cake:\n225g butter\n4 eggs\nFor the drizzle:\n1 lemon\n\nMethod\n1. Beat the butter.\n2. Bake it.`)!
    expect(r.title).toBe('Lemon Cake')
    expect(r.servings).toBe(8)
    expect(r.prepTime).toBe(15)
    expect(r.cookTime).toBe(45)
    expect(r.ingredients.map((g) => g.title)).toEqual(['cake', 'drizzle'].map((t) => expect.stringMatching(new RegExp(t, 'i'))))
    expect(items(r)).toEqual(['225g butter', '4 eggs', '1 lemon'])
    expect(steps(r)).toEqual(['Beat the butter.', 'Bake it.'])
  })
  it('falls back to line shape when there are no headings', () => {
    const r = fromText('Quick Salad\n2 tomatoes\n1 cucumber\n3 tbsp olive oil\nChop the vegetables and toss them with the oil and some salt.')!
    expect(items(r)).toEqual(['2 tomatoes', '1 cucumber', '3 tbsp olive oil'])
    expect(steps(r)).toHaveLength(1)
  })
  it('knows ingredient-shaped lines', () => {
    expect(looksLikeIngredient('1 1/2 cups flour')).toBe(true)
    expect(looksLikeIngredient('½ tsp salt')).toBe(true)
    expect(looksLikeIngredient('Preheat the oven to 200C and grease a tin, then set it aside to cool.')).toBe(false)
  })
})

describe('never an empty card', () => {
  it('pageBasics returns title, photo, and blurb for any page', () => {
    const r = pageBasics(page('<meta property="og:title" content="A Page"><meta property="og:image" content="/p.jpg"><meta name="description" content="Nice.">'), U)
    expect(r.title).toBe('A Page')
    expect(r.image).toBe('https://example.com/p.jpg')
    expect(r.description).toBe('Nice.')
    expect(pageBasics('<html></html>', U).title).toBe('example.com')
  })
  it('alternateLinks finds AMP and print versions', () => {
    const html = page('<link rel="amphtml" href="/r/soup/amp">', '<a class="wprm-recipe-print" href="/wprm_print/123">Print</a>')
    expect(alternateLinks(html, U)).toEqual(['https://example.com/r/soup/amp', 'https://example.com/wprm_print/123'])
  })
})

describe('ingredient tidy', () => {
  it('cleans plugin punctuation debris', () => {
    expect(tidyIngredient('200g chicken thigh fillets (, thinly sliced (Note 1))')).toBe('200g chicken thigh fillets (thinly sliced (Note 1)')
    expect(tidyIngredient('1 1/2 tbsp peanut oil ((or other cooking oil))')).toBe('1 1/2 tbsp peanut oil (or other cooking oil)')
    expect(tidyIngredient('1 carrot , julienned')).toBe('1 carrot, julienned')
    expect(tidyIngredient('salt ()')).toBe('salt')
  })
})

describe('edit mode', () => {
  it('round-trips groups through text', () => {
    const groups = [{ title: 'Cake', items: ['1 egg', '2 cups flour'] }, { title: 'Icing', items: ['1 cup sugar'] }]
    const text = groupsToText(groups)
    expect(text).toBe('## Cake\n1 egg\n2 cups flour\n\n## Icing\n1 cup sugar')
    expect(textToIngredients(text)).toEqual(groups)
    expect(textToSteps('1. Mix\n2) Bake\nFor the icing:\n- Whisk')).toEqual([{ title: undefined, steps: ['Mix', 'Bake'] }, { title: 'For the icing', steps: ['Whisk'] }])
  })
  it('reads times', () => {
    expect(minutesFrom('1 hr 10 min')).toBe(70)
    expect(minutesFrom('45')).toBe(45)
    expect(minutesFrom('1:10')).toBe(70)
    expect(minutesFrom('')).toBeUndefined()
  })
  it('fields round-trip a recipe', () => {
    const base = blankRecipe('x1')
    const f = { ...toFields(base), title: 'Toast', ingredients: '1 slice bread\nbutter', steps: 'Toast it.\nButter it.', prep: '2', cook: '3 min', yield: '1 serving' }
    const r = fromFields(base, f)
    expect(r.title).toBe('Toast')
    expect(r.ingredients[0].items).toEqual(['1 slice bread', 'butter'])
    expect(r.instructions[0].steps).toHaveLength(2)
    expect(r.totalTime).toBe(5)
    expect(toFields(r).ingredients).toBe('1 slice bread\nbutter')
  })
})

describe('fussy sites', () => {
  it('flags known fussy domains', () => {
    expect(fussyFor('https://cooking.nytimes.com/recipes/1')?.name).toMatch(/NYT/)
    expect(fussyFor('https://www.instagram.com/p/abc/')).toBeTruthy()
    expect(fussyFor('https://www.allrecipes.com/recipe/1/')).toBeUndefined()
    expect(fussyFor('https://www.recipetineats.com/x/')).toBeUndefined()
  })
})

describe('Jetpack recipe (prose directions)', () => {
  it('splits a prose block into steps and leaves trailing paragraphs out', () => {
    const html = page('', `<div class="jetpack-recipe"><h3 class="jetpack-recipe-title">Muffins</h3>
      <div class="jetpack-recipe-ingredients"><ul><li>5 tbsp butter</li><li>1 egg</li></ul></div>
      <div class="jetpack-recipe-directions">Heat oven to 375°F. Line a muffin tin with liners. Melt butter and whisk in the egg until smooth. Bake for 25 to 30 minutes, until golden.<p>These are best on day one.</p></div></div>`)
    const r = fromPlugins(dom(html), U)!
    expect(r.title).toBe('Muffins')
    expect(items(r)).toEqual(['5 tbsp butter', '1 egg'])
    expect(steps(r).length).toBeGreaterThanOrEqual(2)
    expect(steps(r).join(' ')).not.toMatch(/day one/)
    expect(steps(r)[0]).toMatch(/^Heat oven/)
  })
})

describe('crammed numbered steps', () => {
  it('splits "1. … 2. … 3. …" in one step', async () => {
    const { splitNumberedStep } = await import('../text')
    expect(splitNumberedStep('1. Preheat the oven. 2. Melt the butter. 3. Add the garlic.')).toEqual(['Preheat the oven.', 'Melt the butter.', 'Add the garlic.'])
    expect(splitNumberedStep('Bake 2. Then cool for 10 minutes.')).toEqual(['Bake 2. Then cool for 10 minutes.'])
    expect(splitNumberedStep('Use 2 cups flour and 3 eggs.')).toEqual(['Use 2 cups flour and 3 eggs.'])
  })
})
