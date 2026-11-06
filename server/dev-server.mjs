/**
 * TEMPORARY test server, not part of the shipped app.
 * It serves dist/ under /pinch/ and mounts a local copy of the Cloudflare Worker (proxy/worker.js)
 * at /pinch/relay/, so the app can be tried through a tunnel before the Worker is deployed.
 * The published app (GitHub Pages + Cloudflare Worker) does not use this server at all.
 *
 *   PORT=4173 ALLOWED_ORIGINS=https://xyz.ngrok-free.app node server/dev-server.mjs
 */
import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'
import { handle } from '../proxy/worker.js'

const PORT = Number(process.env.PORT || 4173)
const ROOT = new URL('../dist/', import.meta.url).pathname
const BASE = '/pinch/'
const env = { ALLOWED_ORIGINS: ['http://localhost:4173', 'http://localhost:5173', process.env.ALLOWED_ORIGINS || ''].join(',') }
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
}

async function relay(req, res, url) {
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
  const r = await handle(new Request('http://relay' + url.pathname.slice((BASE + 'relay').length) + url.search, { method: req.method, headers }), env)
  const out = {}
  r.headers.forEach((v, k) => (out[k] = v))
  res.writeHead(r.status, out)
  res.end(Buffer.from(await r.arrayBuffer()))
}

async function serveFile(res, rel) {
  const path = normalize(join(ROOT, rel))
  if (!path.startsWith(ROOT)) return false
  try {
    const s = await stat(path)
    if (!s.isFile()) return false
    const ext = extname(path)
    const h = { 'Content-Type': MIME[ext] || 'application/octet-stream' }
    if (rel === 'sw.js') Object.assign(h, { 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': BASE })
    else if (rel === 'index.html' || ext === '.webmanifest') h['Cache-Control'] = 'no-cache'
    else if (rel.startsWith('assets/')) h['Cache-Control'] = 'public, max-age=31536000, immutable'
    else h['Cache-Control'] = 'public, max-age=86400'
    res.writeHead(200, h)
    res.end(await readFile(path))
    return true
  } catch {
    return false
  }
}

http.createServer(async (req, res) => {
  const t0 = Date.now()
  try {
    const url = new URL(req.url, 'http://x')
    if (url.pathname === '/' || url.pathname === '/pinch') { res.writeHead(302, { Location: BASE }); return res.end() }
    if (!url.pathname.startsWith(BASE)) { res.writeHead(404); return res.end('Not found') }
    if (url.pathname.startsWith(BASE + 'relay')) return await relay(req, res, url)
    let rel = decodeURIComponent(url.pathname.slice(BASE.length)) || 'index.html'
    if (!(await serveFile(res, rel))) {
      if (extname(rel)) { res.writeHead(404); return res.end('Not found') }
      await serveFile(res, 'index.html') // SPA fallback
    }
  } catch (e) {
    if (!res.headersSent) res.writeHead(500)
    res.end('Server error')
    console.error(e)
  } finally {
    if (req.url.includes('/relay')) console.log(new Date().toISOString(), res.statusCode, Date.now() - t0 + 'ms', req.url.slice(0, 160))
  }
}).listen(PORT, () => console.log(`pinch dev server on :${PORT}${BASE}`))
