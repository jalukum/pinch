# Pinch relay: your own free Cloudflare Worker

Pinch is a static site. Browsers can't read other websites directly, so it needs a small relay that
fetches a recipe page the way your phone's browser would and hands back the HTML. This folder is that
relay. It runs on Cloudflare's free Workers plan (100,000 requests a day), on your own account, so the
app doesn't depend on any server of ours.

## What it does

| Route | Returns |
|---|---|
| `GET /fetch?url=<page>` | the page HTML. Headers: `X-Final-Url` (after redirects), `X-Pinch-Source` (`live`, `amp`, `print`, `wp-json`, `wp-recipe-maker`, `wayback`), `X-Pinch-Tried` (each attempt), `X-Upstream-Status` |
| `GET /img?url=<image>` | the image bytes with CORS headers, so photos can be cached for offline use |
| `GET /` | `ok` |

For each page it tries, in order, and stops at the first one with a real page:

1. **Live, as iPhone Safari**, then **as desktop Chrome**. It sends ordinary browser headers and follows up to 6 redirects.
2. The page's **AMP** and **print** versions.
3. On WordPress sites, the **wp-json** post API and the **WP Recipe Maker** recipe API.
4. The **Wayback Machine**: the newest snapshot first, then the 2 newest good snapshots from the CDX index. It retries once on a 429.

Limits: public http(s) hosts only (private, loopback and link-local addresses are refused, including
after redirects), HTML/JSON/images only, 5 MB cap, 15 s per request, 28 s per page. Successful
responses are cached at Cloudflare's edge: pages for 30 min, images for a day.

It stays within what a normal browser visit does. It doesn't solve captchas, get around paywalls or
logins, use anyone's cookies, or pretend to be Googlebot. If a site refuses ordinary visitors, Pinch
offers **Paste the recipe text** or **Write it by hand** instead.

## Deploy option A: wrangler (about 2 minutes)

```bash
cd proxy
npx wrangler login          # opens Cloudflare in the browser; make a free account if you need one
npx wrangler deploy         # prints https://pinch-relay.<your-subdomain>.workers.dev
```

Edit `ALLOWED_ORIGINS` in `wrangler.toml` first if the app won't live at `https://jalukum.github.io`.
It's a comma-separated list of origins (scheme + host, no path).

## Deploy option B: dashboard paste (no tools)

1. <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Create Worker**. Name it `pinch-relay`, then **Deploy**.
2. **Edit code**, replace everything with the contents of [`worker.js`](./worker.js), then **Deploy**.
3. **Settings → Variables and Secrets → Add**: a text variable `ALLOWED_ORIGINS` = `https://jalukum.github.io`
   (add `,http://localhost:5173` for local dev). If you skip this, the built-in default is used: the
   GitHub Pages origin plus localhost.

## Point the app at it

Pick one:

* **Bake it in (recommended):** set `DEFAULT_RELAY` in `src/lib/config.ts` to your Worker URL, or build with
  `VITE_RELAY_URL=https://pinch-relay.<sub>.workers.dev npm run build` (the Pages workflow reads the
  `RELAY_URL` repository variable).
* **Per phone:** in Pinch, **Backup & settings → Your own relay**, paste the Worker URL.

Check it: `curl -H 'Origin: https://jalukum.github.io' 'https://pinch-relay.<sub>.workers.dev/fetch?url=https://www.bbcgoodfood.com/recipes/easy-pancakes' -I`
should give `200` and `x-pinch-source: live`.

## Test it locally

`server/dev-server.mjs` mounts this same `worker.js` at `/pinch/relay/*` next to the built app. It's for
**temporary testing only**. Requests from it leave from whatever machine runs it, and some sites
(Cloudflare-protected blogs) treat data-centre addresses differently than they treat Cloudflare's own
network, so results on the real Worker can be better or worse. Re-run `scripts/site-test.mjs` against
the deployed app after you deploy.
