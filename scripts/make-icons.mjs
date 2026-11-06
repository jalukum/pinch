// Renders PNG icons + iOS splash screens from SVG/HTML using local Chrome.
import puppeteer from 'puppeteer-core'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'

const svg = readFileSync('scripts/icon.svg', 'utf8')
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const page = await browser.newPage()

async function shot(html, w, h, out, dpr = 1) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: dpr })
  await page.setContent(html, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: out, omitBackground: false })
}
const iconHtml = (pad = 0) => `<html><body style="margin:0;background:#9c4426"><div style="width:100vw;height:100vh;display:grid;place-items:center;background:#9c4426"><div style="width:${100 - pad * 2}vw;height:${100 - pad * 2}vh">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></div></body></html>`

mkdirSync('public/icons', { recursive: true })
await shot(iconHtml(), 180, 180, 'public/icons/apple-touch-icon.png')
await shot(iconHtml(), 192, 192, 'public/icons/icon-192.png')
await shot(iconHtml(), 512, 512, 'public/icons/icon-512.png')
await shot(iconHtml(), 512, 512, 'public/icons/maskable-512.png') // full-bleed art already sits in the safe zone

// iOS launch screens (portrait), light paper with wordmark
const font = (f) => `data:font/woff2;base64,${readFileSync('public/fonts/' + f).toString('base64')}`
const sizes = [
  [320, 568, 2], [375, 667, 2], [414, 736, 3], [375, 812, 3], [414, 896, 2], [414, 896, 3],
  [390, 844, 3], [428, 926, 3], [393, 852, 3], [430, 932, 3], [402, 874, 3], [440, 956, 3],
]
mkdirSync('public/splash', { recursive: true })
const links = []
for (const [w, h, d] of sizes) {
  const name = `splash-${w * d}x${h * d}.png`
  await shot(`<html><head><style>
    @font-face{font-family:F;src:url(${font('fraunces.woff2')})}
    @font-face{font-family:C;src:url(${font('caveat.woff2')})}
    body{margin:0;height:100vh;display:grid;place-items:center;background:#efe4d2;color:#3a2a20}
    h1{font:640 64px F;font-variation-settings:'SOFT' 100,'WONK' 1,'opsz' 144;margin:0;letter-spacing:-.02em}
    h1 span{color:#b5532f} p{font:25px C;color:#b5532f;margin:2px 0 0 4px;transform:rotate(-2deg)}
    </style></head><body><div><h1>Pinch<span>.</span></h1><p>a little recipe box</p></div></body></html>`, w, h, 'public/splash/' + name, d)
  links.push(`<link rel="apple-touch-startup-image" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${d}) and (orientation: portrait)" href="./splash/${name}" />`)
}
writeFileSync('scripts/splash-links.html', links.join('\n    '))
await browser.close()
console.log('icons + splash done')
