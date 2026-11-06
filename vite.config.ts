import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createHash } from 'node:crypto'

/** Generates dist/sw.js with a precache list of every built file (relative paths → works under any subpath). */
function serviceWorker(): Plugin {
  return {
    name: 'pinch-sw',
    apply: 'build',
    closeBundle() {
      const dist = join(process.cwd(), 'dist')
      const files: string[] = []
      const walk = (d: string) => {
        for (const f of readdirSync(d)) {
          const p = join(d, f)
          if (statSync(p).isDirectory()) walk(p)
          else files.push(relative(dist, p).split('\\').join('/'))
        }
      }
      walk(dist)
      const precache = files.filter((f) => f !== 'sw.js' && !f.startsWith('splash/') && !f.endsWith('.map'))
      const hash = createHash('sha1')
      for (const f of precache) hash.update(f).update(readFileSync(join(dist, f)))
      const version = hash.digest('hex').slice(0, 10)
      const tpl = readFileSync(join(process.cwd(), 'src/sw-template.js'), 'utf8')
      writeFileSync(
        join(dist, 'sw.js'),
        tpl.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(['./', ...precache])),
      )
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), serviceWorker()],
  build: { target: 'es2020', assetsInlineLimit: 0 },
  test: { environment: 'jsdom' },
} as any)
