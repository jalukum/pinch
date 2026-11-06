# Pinch: a little recipe box

Paste a link to any recipe, and Pinch turns it into a clean, heirloom-style recipe card that you can file in your box.
Cards open offline, too.

* Vite + React + TypeScript, with no UI framework. Fonts are bundled: Fraunces, Literata, Courier Prime and Caveat (all OFL).
* Installable PWA (manifest, icons, iOS splash screens, service worker).
* Data stays on your phone in IndexedDB, and photos are cached as data URLs.
* Everything uses relative paths, so it works from a GitHub Pages sub-path such as `/pinch/`.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # parser/scaler unit tests (vitest)
npm run build      # → dist/ (also writes dist/sw.js)
npm run preview    # serve the production build
```

Helper scripts (need Chrome at `/usr/bin/google-chrome`):

* `node scripts/make-icons.mjs` re-renders the icons and splash screens from `scripts/icon.svg`.
* `BASE=<app url> node scripts/site-test.mjs $(cat scripts/sites.txt)` runs the live in-browser extraction against real sites and writes `scripts/site-test-results.json`.
* `node scripts/shots.mjs` takes 390×844 screenshots into `shots/`.

## Deploy (static site + your own relay)

Pinch is entirely static. The only moving part is a free Cloudflare Worker on your own account that
fetches recipe pages for it. Nothing runs on any machine of ours.

1. **Relay:** deploy `proxy/worker.js` (instructions in [`proxy/README.md`](proxy/README.md): `npx wrangler deploy` or a dashboard paste).
2. **Point the app at it:** put the Worker URL in `DEFAULT_RELAY` (`src/lib/config.ts`) or set the repo variable `RELAY_URL`.
3. **GitHub Pages:** create the repo `jalukum/pinch` and push. Then **Settings → Pages → Source: GitHub Actions**.
   `.github/workflows/pages.yml` tests, builds and publishes `dist/` to `https://jalukum.github.io/pinch/`.
4. On iPhone: open it in Safari, then **Share → Add to Home Screen**.

`server/` (`dev-server.mjs`, `run.sh`) is **TEMPORARY**. It serves `dist/` with the Worker mounted at `./relay` for testing only. It isn't part of the deployed app, and you can delete it.

## How extraction works

1. **Fetch.** The page is fetched through your relay first (`DEFAULT_RELAY`, `VITE_RELAY_URL`, or the one set in Settings).
   Inside the relay: live as iPhone Safari → desktop Chrome → AMP/print → wp-json/WP Recipe Maker → Wayback snapshots.
   Free public relays (r.jina.ai, allorigins, …) are a last resort. They start only if yours fails or is slow.
2. **Parse:** schema.org **JSON-LD** (`@graph`, `HowToSection`, ISO 8601 durations…), then **microdata**, then **RDFa**.
   If those come up short, the recipe-plugin markup is next: WP Recipe Maker, Tasty, Mediavine Create, ZipList/Yummly, Cooked, EasyRecipe, WPZOOM and Jetpack.
   After that come `__NEXT_DATA__`/Nuxt/embedded JSON, then container heuristics, then an "Ingredients / Method" heading walk. Results from several sources are merged.
3. **Never an empty card.** If only part of a recipe is found, you get a card with the title, photo and whatever was found, plus a "Fill it in" banner.
   If nothing comes back at all, the failure note offers two paths that always work:
   * **Paste the recipe text.** Use Safari Reader or select-all, then paste. It's split into ingredients, steps, times and yield.
   * **Write it by hand** in the card editor.
   It also shows a "probably fussy" hint for sites known to need that (see *A note on fussy sites* in the app).
4. **Edit any card** with the pencil icon. Use `## Title` or `Title:` lines to start ingredient or step groups.

Unit tests (`npm test`) cover every pattern above: each plugin, RDFa, `__NEXT_DATA__`, headings, pasted text, page basics, AMP/print links and the editor round-trip.

## Themes

The theme stamp in the header cycles **Auto → Day → Night**. The choice is stored in `localStorage` (`pinch.theme`), and a tiny pre-paint script applies it before first paint, so there's no flash. It also updates `<meta name="theme-color">`.

## Shortcuts

* `…/#/add?url=<recipe>` or `…/?url=<recipe>` opens Pinch and starts reading that link. This is handy for an iOS Shortcut on the Share sheet.
