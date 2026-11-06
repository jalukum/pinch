// End-to-end: run the real in-browser extraction chain against live recipe URLs.
import puppeteer from 'puppeteer-core'
import { writeFileSync } from 'node:fs'
const URLS = process.argv.slice(2).length ? process.argv.slice(2) : [
  'https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/',
  'https://www.seriouseats.com/the-best-slow-cooked-bolognese-sauce-recipe',
  'https://www.bbcgoodfood.com/recipes/easy-pancakes',
  'https://www.budgetbytes.com/one-pot-creamy-cajun-chicken-pasta/',
  'https://cooking.nytimes.com/recipes/1015819-chocolate-chip-cookies',
  'https://www.recipetineats.com/chicken-chow-mein/',
  'https://cookieandkate.com/best-lentil-soup-recipe/',
  'https://www.bonappetit.com/recipe/bas-best-chocolate-chip-cookies',
  'https://www.kingarthurbaking.com/recipes/chocolate-chip-cookies-recipe',
  'https://www.foodnetwork.com/recipes/food-network-kitchen/baked-macaroni-and-cheese-recipe-1939524',
  'https://www.simplyrecipes.com/recipes/homemade_pizza/',
  'https://smittenkitchen.com/2009/01/vegetable-dumplings/',
]
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const page = await browser.newPage()
const BASE = process.env.BASE || 'http://localhost:4173/pinch/'
await page.setExtraHTTPHeaders({ 'ngrok-skip-browser-warning': '1' })
await page.goto(BASE, { waitUntil: 'networkidle0' })
const results = []
for (const url of URLS) {
  const t0 = Date.now()
  const r = await page.evaluate(async (url) => {
    const P = window.__pinch
        try {
      const { recipe, attempts, via, partial } = await P.extractRecipe(url, {})
      return { ok: !partial, partial: !!partial, via, how: recipe.extractedVia, title: recipe.title, ing: recipe.ingredients.reduce((n, g) => n + g.items.length, 0), steps: recipe.instructions.reduce((n, g) => n + g.steps.length, 0), img: !!recipe.image, time: recipe.totalTime, yield: recipe.yieldText, attempts }
    } catch (e) {
      return { ok: false, error: e.message, attempts: e.attempts }
    }
  }, url)
  r.url = url; r.ms = Date.now() - t0
  results.push(r)
  console.log(JSON.stringify(r))
}
writeFileSync('scripts/site-test-results.json', JSON.stringify(results, null, 2))
await browser.close()
