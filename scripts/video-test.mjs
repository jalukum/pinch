// End-to-end: paste real cooking-video links (and upload a video file), check a card comes out, screenshot it.
//   BASE=<app url> node scripts/video-test.mjs [file.mp4]
import puppeteer from 'puppeteer-core'
const BASE = process.env.BASE || 'http://localhost:4173/pinch/'
const LINKS = (process.env.LINKS || [
  'https://www.youtube.com/watch?v=pn1gFPMRCO4', // YouTube long (Preppy Kitchen, links a written recipe)
  'https://youtube.com/shorts/vJNjTo-xWr8', // YouTube Short
  'https://www.tiktok.com/@thatdudecancook/video/7331063060121128234', // TikTok (subtitles + caption)
  'https://www.instagram.com/reel/DIezgZHPjZ4/', // Instagram reel (caption)
].join(' ')).split(/\s+/).filter(Boolean)
const FILE = process.argv[2]
const SHOT = process.env.SHOT || 'shots/video-recipe.png'
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
page.on('console', (m) => { if (/pinch/.test(m.text())) console.log('  console:', m.text().slice(0, 200)) })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const lines = new Set()
const watchLines = setInterval(async () => { try { const t = await page.$eval('.typewriter', (e) => e.textContent); if (t) lines.add(t) } catch {} }, 400)
const card = async () => page.evaluate(() => ({
  title: document.querySelector('.recipe__title')?.textContent,
  kicker: document.querySelector('.kicker')?.textContent,
  ingredients: [...document.querySelectorAll('.recipe li')].length,
  text: document.querySelector('.recipe')?.innerText.slice(0, 900),
}))
await page.goto(BASE, { waitUntil: 'networkidle0' })
await page.evaluate(() => { indexedDB.deleteDatabase('pinch'); localStorage.clear(); localStorage.setItem('pinch.theme', 'light') })
await page.reload({ waitUntil: 'networkidle0' })
for (const url of LINKS) {
  lines.clear()
  const t0 = Date.now()
  await page.goto(BASE, { waitUntil: 'networkidle0' })
  await page.click('#paste-input', { clickCount: 3 })
  await page.type('#paste-input', url)
  await page.click('.go-btn')
  const got = await Promise.race([
    page.waitForSelector('.recipe', { timeout: 120000 }).then(() => 'card'),
    page.waitForSelector('.torn-note', { timeout: 120000 }).then(() => 'error'),
  ]).catch(() => 'timeout')
  const info = got === 'card' ? await card() : { note: await page.$eval('.torn-note', (e) => e.innerText).catch(() => '') }
  results.push({ url, got, secs: Math.round((Date.now() - t0) / 1000), lines: [...lines], ...info })
  console.log(JSON.stringify(results.at(-1), null, 1))
  if (got === 'card') {
    for (const b of await page.$$('button')) if ((await b.evaluate((e) => e.textContent)).includes('File it')) { await b.click(); break }
    await wait(1000)
  }
}
if (FILE) {
  lines.clear()
  const t0 = Date.now()
  await page.goto(BASE, { waitUntil: 'networkidle0' })
  const input = await page.$('input[type=file][accept^="video"]')
  await input.uploadFile(FILE)
  const got = await Promise.race([
    page.waitForSelector('.recipe', { timeout: 180000 }).then(() => 'card'),
    page.waitForSelector('.torn-note', { timeout: 180000 }).then(() => 'error'),
  ]).catch(() => 'timeout')
  const info = got === 'card' ? await card() : { note: await page.$eval('.torn-note', (e) => e.innerText).catch(() => '') }
  results.push({ url: 'upload ' + FILE, got, secs: Math.round((Date.now() - t0) / 1000), lines: [...lines], ...info })
  console.log(JSON.stringify(results.at(-1), null, 1))
}
clearInterval(watchLines)
// Screenshot: the TikTok card (made from what the chef said), saved, at phone size.
const tiktok = await page.evaluate(async () => new Promise((res) => {
  const r = indexedDB.open('pinch')
  r.onsuccess = () => { try { const tx = r.result.transaction(r.result.objectStoreNames[0]); const all = tx.objectStore(r.result.objectStoreNames[0]).getAll(); all.onsuccess = () => res(all.result.map((x) => ({ id: x.id, url: x.url, title: x.title }))) } catch (e) { res([]) } }
  r.onerror = () => res([])
}))
console.log('saved', tiktok)
const pick = tiktok.find((x) => /tiktok/.test(x.url)) || tiktok[0]
if (pick) {
  await page.goto(BASE + '#/r/' + pick.id, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.recipe')
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), { timeout: 15000 }).catch(() => {})
  await wait(800)
  await page.screenshot({ path: SHOT })
  await page.screenshot({ path: SHOT.replace('.png', '-full.png'), fullPage: true })
  console.log('shot', SHOT)
}
await browser.close()
const ok = results.filter((r) => r.got === 'card').length
console.log(`${ok}/${results.length} made a card`)
