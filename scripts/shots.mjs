// 390x844 @3x screenshots, dark first then light. Uses the real fetch path on the local server.
import puppeteer from 'puppeteer-core'
const BASE = process.env.BASE || 'http://localhost:4173/pinch/'
const OUT = 'shots/'
const SAVE = [
  'https://www.recipetineats.com/chicken-chow-mein/',
  'https://www.bbcgoodfood.com/recipes/easy-pancakes',
  'https://pinchofyum.com/the-best-soft-chocolate-chip-cookies',
  'https://minimalistbaker.com/easy-vegan-fried-rice/',
]
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setExtraHTTPHeaders({ 'ngrok-skip-browser-warning': '1' })
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const both = async (name, full = false, prep) => {
  for (const t of ['dark', 'light']) {
    await page.evaluate((t) => { localStorage.setItem('pinch.theme', t); window.__pinchTheme() }, t)
    if (prep) await prep()
    await wait(350)
    await page.screenshot({ path: `${OUT}${t}-${name}.png`, fullPage: full })
    console.log('shot', t, name)
  }
}
const clickText = async (txt) => {
  for (const b of await page.$$('button')) if ((await b.evaluate((e) => e.textContent)).includes(txt)) { await b.click(); return true }
  return false
}
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

await page.goto(BASE, { waitUntil: 'networkidle0' })
await page.evaluate(() => { indexedDB.deleteDatabase('pinch'); localStorage.clear() })
await page.reload({ waitUntil: 'networkidle0' })
await both('01-home-empty')

for (const [i, url] of SAVE.entries()) {
  await page.goto(BASE, { waitUntil: 'networkidle0' })
  await page.click('#paste-input', { clickCount: 3 })
  await page.type('#paste-input', url)
  await page.click('.go-btn')
  await page.waitForSelector('.recipe', { timeout: 90000 })
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), { timeout: 20000 }).catch(() => {})
  await clickText('File it')
  await wait(1200)
  if (i === 0) {
    await both('03-recipe', false, () => page.evaluate(() => scrollTo(0, 0)))
    await both('03b-recipe-full', true)
    console.log('overflow recipe', await overflow())
    await page.click('[aria-label="Edit card"]')
    await page.waitForSelector('.editor')
    await both('04-edit', false, () => page.evaluate(() => scrollTo(0, 0)))
    await clickText('Cancel')
  }
}
await wait(3000)
await page.goto(BASE, { waitUntil: 'networkidle0' })
await both('02-home-cards')
await both('02b-home-full', true)
console.log('overflow home', await overflow())

await clickText('Paste the recipe text')
await page.waitForSelector('.paste-text__area')
await page.type('.paste-text__area', 'Lemon Drizzle Cake\nServes 8\n\nIngredients\n225g butter, softened\n225g caster sugar\n4 eggs\n225g self-raising flour\n1 lemon, zested\n\nMethod\nHeat the oven to 180C and line a loaf tin.\nBeat the butter and sugar until pale, then add the eggs one at a time.\nFold in the flour and zest, spoon into the tin and bake for 45 minutes.\n')
await both('05-paste-text')
await clickText('Make the card')
await page.waitForSelector('.recipe')
await both('05b-pasted-card', true, () => page.evaluate(() => scrollTo(0, 0)))

await page.goto(BASE, { waitUntil: 'networkidle0' })
await clickText('Fussy sites')
await page.waitForSelector('.fussy')
await both('06-fussy-note')

await page.goto(BASE, { waitUntil: 'networkidle0' })
await page.type('#paste-input', 'https://www.instagram.com/p/C1abcdEFGhi/')
await page.click('.go-btn')
await page.waitForSelector('.torn-note, .recipe', { timeout: 120000 })
await both('07-failure', false, () => page.evaluate(() => scrollTo(0, 0)))

await page.goto(BASE, { waitUntil: 'networkidle0' })
await clickText('Write one by hand')
await page.waitForSelector('.editor')
await both('08-write-by-hand')

// theme toggle states in the masthead
await page.goto(BASE, { waitUntil: 'networkidle0' })
await page.evaluate(() => { localStorage.removeItem('pinch.theme'); window.__pinchTheme() })
await page.reload({ waitUntil: 'networkidle0' })
for (const n of ['auto', 'light', 'dark']) {
  const el = await page.$('.masthead')
  await el.screenshot({ path: `${OUT}toggle-${n}.png` })
  await page.click('.theme-stamp'); await wait(250)
}
await browser.close()
