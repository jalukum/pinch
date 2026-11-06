import { describe, it, expect } from 'vitest'
import { parseRecipeHtml, parseYield, instructionsFrom, parseJsonLoose, fromMarkdown } from '../parse'
import { parseDuration, formatMinutes } from '../duration'
import { decodeEntities, clean } from '../text'
import { scaleIngredient, formatQty } from '../scale'
import { normalizeUrl } from '../fetcher'

const page = (head: string, body = '') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`
const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`

describe('durations', () => {
  it('parses ISO 8601', () => {
    expect(parseDuration('PT1H30M')).toBe(90)
    expect(parseDuration('PT90M')).toBe(90)
    expect(parseDuration('P0DT0H45M')).toBe(45)
    expect(parseDuration('PT1H30M0.000S')).toBe(90)
    expect(parseDuration('P1DT2H')).toBe(1560)
    expect(parseDuration('PT0M')).toBeUndefined()
    expect(parseDuration('PT20S')).toBe(1)
  })
  it('parses loose text', () => {
    expect(parseDuration('1 hour 15 mins')).toBe(75)
    expect(parseDuration('45 minutes')).toBe(45)
    expect(parseDuration('1h 20m')).toBe(80)
  })
  it('formats', () => {
    expect(formatMinutes(45)).toBe('45 min')
    expect(formatMinutes(90)).toBe('1 hr 30 min')
  })
})

describe('text', () => {
  it('decodes entities incl. double-encoded and numeric', () => {
    expect(decodeEntities('Mac &amp; Cheese')).toBe('Mac & Cheese')
    expect(decodeEntities('Grandma&amp;#39;s')).toBe("Grandma's")
    expect(decodeEntities('&#8217;&#x2019;&frac12;')).toBe('’’½')
  })
  it('strips tags and whitespace', () => {
    expect(clean('  <p>Stir <strong>well</strong>&nbsp;now</p>\n')).toBe('Stir well now')
    expect(clean('&lt;b&gt;bold&lt;/b&gt; text')).toBe('bold text')
  })
})

describe('JSON-LD', () => {
  it('finds a Recipe inside @graph with HowToSections and image arrays', () => {
    const html = page(
      ld({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebSite', name: 'Site' },
          {
            '@type': ['Recipe', 'NewsArticle'],
            name: 'Lemon &amp; Herb Chicken',
            image: [
              { '@type': 'ImageObject', url: 'https://x.test/small.jpg', width: 300 },
              { '@type': 'ImageObject', url: 'https://x.test/big.jpg', width: 1200 },
            ],
            author: [{ '@type': 'Person', name: 'Ada' }],
            prepTime: 'PT15M',
            cookTime: 'PT45M',
            recipeYield: ['4', '4 servings'],
            recipeIngredient: ['1 &frac12; lb chicken', '2 lemons'],
            recipeInstructions: [
              { '@type': 'HowToSection', name: 'Marinade', itemListElement: [{ '@type': 'HowToStep', text: 'Zest the lemons.' }] },
              { '@type': 'HowToSection', name: 'Cook', itemListElement: [{ '@type': 'HowToStep', text: '<p>Roast at 425&deg;F.</p>' }] },
            ],
            recipeCategory: 'Dinner',
          },
        ],
      }) + '<meta property="og:site_name" content="Test Kitchen">',
    )
    const r = parseRecipeHtml(html, 'https://x.test/r')!
    expect(r.extractedVia).toBe('json-ld')
    expect(r.title).toBe('Lemon & Herb Chicken')
    expect(r.image).toBe('https://x.test/big.jpg')
    expect(r.author).toBe('Ada')
    expect(r.totalTime).toBe(60)
    expect(r.servings).toBe(4)
    expect(r.yieldText).toBe('4 servings')
    expect(r.ingredients[0].items[0]).toBe('1 ½ lb chicken')
    expect(r.instructions).toEqual([
      { title: 'Marinade', steps: ['Zest the lemons.'] },
      { title: 'Cook', steps: ['Roast at 425°F.'] },
    ])
    expect(r.siteName).toBe('Test Kitchen')
    expect(r.tags).toContain('Dinner')
  })

  it('handles a top-level array, string image, and a single instruction string with newlines', () => {
    const html = page(ld([{ '@type': 'Organization' }, {
      '@type': 'Recipe', name: 'Toast', image: '/img/toast.jpg', recipeIngredient: ['bread', 'butter'],
      recipeInstructions: 'Toast the bread.\nButter it.', totalTime: 'PT5M', recipeYield: 2,
    }]))
    const r = parseRecipeHtml(html, 'https://bread.test/a/b')!
    expect(r.image).toBe('https://bread.test/img/toast.jpg')
    expect(r.instructions[0].steps).toEqual(['Toast the bread.', 'Butter it.'])
    expect(r.yieldText).toBe('2 servings')
  })

  it('tolerates broken JSON (raw newlines, trailing commas)', () => {
    expect(parseJsonLoose('{"a": "line\none", "b": [1,2,],}')).toEqual({ a: 'line one', b: [1, 2] })
  })

  it('handles plain-string instruction arrays and HowToStep with name only', () => {
    expect(instructionsFrom(['Mix.', { '@type': 'HowToStep', name: 'Bake.' }])).toEqual([{ steps: ['Mix.', 'Bake.'] }])
  })

  it('parses yield variants', () => {
    expect(parseYield('Makes 24 cookies')).toEqual({ text: 'Makes 24 cookies', servings: 24 })
    expect(parseYield(6)).toEqual({ text: '6 servings', servings: 6 })
    expect(parseYield(undefined)).toEqual({})
  })
})

describe('microdata + heuristics', () => {
  it('reads schema.org microdata', () => {
    const html = page('', `
      <div itemscope itemtype="http://schema.org/Recipe">
        <h1 itemprop="name">Pancakes</h1>
        <img itemprop="image" src="/p.jpg">
        <meta itemprop="prepTime" content="PT10M"><meta itemprop="cookTime" content="PT20M">
        <span itemprop="recipeYield">8 pancakes</span>
        <ul><li itemprop="recipeIngredient">1 cup flour</li><li itemprop="recipeIngredient">1 egg</li></ul>
        <ol itemprop="recipeInstructions"><li>Whisk.</li><li>Fry.</li></ol>
      </div>`)
    const r = parseRecipeHtml(html, 'https://cakes.test/p')!
    expect(r.extractedVia).toBe('microdata')
    expect(r.title).toBe('Pancakes')
    expect(r.image).toBe('https://cakes.test/p.jpg')
    expect(r.totalTime).toBe(30)
    expect(r.ingredients[0].items).toEqual(['1 cup flour', '1 egg'])
    expect(r.instructions[0].steps).toEqual(['Whisk.', 'Fry.'])
  })

  it('falls back to og tags + ingredient/instruction lists', () => {
    const html = page('<meta property="og:title" content="Nana&#39;s Soup"><meta property="og:image" content="https://s.test/soup.jpg">', `
      <h1>Nana's Soup</h1>
      <div class="recipe-ingredients"><ul><li>1 onion</li><li>2 carrots</li><li>water</li></ul></div>
      <div class="directions"><ol><li>Chop.</li><li>Simmer.</li></ol></div>
      <div class="recipe-notes"><p>Better the next day.</p></div>`)
    const r = parseRecipeHtml(html, 'https://s.test/soup')!
    expect(r.extractedVia).toBe('heuristic')
    expect(r.title).toBe("Nana's Soup")
    expect(r.image).toBe('https://s.test/soup.jpg')
    expect(r.ingredients[0].items).toHaveLength(3)
    expect(r.instructions[0].steps).toEqual(['Chop.', 'Simmer.'])
    expect(r.notes).toEqual(['Better the next day.'])
  })

  it('returns undefined for non-recipe pages', () => {
    expect(parseRecipeHtml(page('<title>News</title>', '<p>Hello</p>'), 'https://n.test')).toBeUndefined()
  })

  it('parses r.jina.ai markdown', () => {
    const md = `Title: Simple Salad\n\n## Ingredients\n* 1 head lettuce\n* 2 tbsp oil\n\n## Instructions\n1. Wash.\n2. Toss.\n\n## Comments\n`
    const r = fromMarkdown(md, 'https://salad.test/x')!
    expect(r.title).toBe('Simple Salad')
    expect(r.ingredients[0].items).toEqual(['1 head lettuce', '2 tbsp oil'])
    expect(r.instructions[0].steps).toEqual(['Wash.', 'Toss.'])
  })
})

describe('scaling + urls', () => {
  it('scales leading quantities, fractions, ranges', () => {
    expect(scaleIngredient('1 1/2 cups flour', 2)).toBe('3 cups flour')
    expect(scaleIngredient('½ tsp salt', 2)).toBe('1 tsp salt')
    expect(scaleIngredient('2-3 cloves garlic', 2)).toBe('4–6 cloves garlic')
    expect(scaleIngredient('1 egg', 0.5)).toBe('½ egg')
    expect(scaleIngredient('salt to taste', 3)).toBe('salt to taste')
    expect(formatQty(0.333)).toBe('⅓')
  })
  it('normalizes pasted text into a clean URL', () => {
    expect(normalizeUrl('check this https://ex.com/r?utm_source=x&id=2#top !')).toBe('https://ex.com/r?id=2')
    expect(normalizeUrl('ex.com/recipe')).toBe('https://ex.com/recipe')
    expect(normalizeUrl('not a link')).toBeUndefined()
  })
})

describe('tidying', () => {
  it('normalizes yield ranges and strips video boilerplate', async () => {
    const { tidyLede } = await import('../parse')
    expect(parseYield('2 -3').text).toBe('2–3')
    expect(tidyLede('Recipe video above. A great Chow Mein.')).toBe('A great Chow Mein.')
  })
})
