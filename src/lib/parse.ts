import { clean, decodeEntities, hostLabel, splitBlock, splitNumberedStep, tidyIngredient, uniq } from './text'
import { parseDuration } from './duration'
import type { IngredientGroup, ParsedRecipe, StepGroup } from './types'

type J = Record<string, any>

// ───────────────────────────── helpers ─────────────────────────────

function asArray<T = any>(v: any): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

function typeList(node: J): string[] {
  return asArray(node?.['@type']).map((t) => String(t).replace(/^.*[/:#]/, '').toLowerCase())
}

function isType(node: J, t: string) {
  return !!node && typeof node === 'object' && typeList(node).includes(t.toLowerCase())
}

function absUrl(u: string | undefined, base: string): string | undefined {
  if (!u) return undefined
  try {
    return new URL(decodeEntities(u.trim()), base).href
  } catch {
    return undefined
  }
}

/** Lenient JSON.parse for messy JSON-LD blobs. */
export function parseJsonLoose(raw: string): any {
  let s = raw.trim().replace(/^<!--|-->$/g, '').replace(/^\s*\/\/<!\[CDATA\[|\/\/\]\]>\s*$/g, '').trim()
  try {
    return JSON.parse(s)
  } catch {
    /* fallthrough */
  }
  // literal newlines/tabs inside strings, trailing commas
  s = s.replace(/[\u0000-\u001f]+/g, ' ').replace(/,\s*([}\]])/g, '$1')
  const attempts = [
    s,
    decodeEntities(s), // entity-encoded JSON (&quot;)
    `[${s.replace(/}\s*{/g, '},{')}]`, // several objects glued together
    s.replace(/;\s*$/, ''),
  ]
  for (const a of attempts) {
    try {
      return JSON.parse(a)
    } catch {
      /* next */
    }
  }
  // last resort: cut at the last balanced closing brace
  const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'))
  if (end > 0) {
    try {
      return JSON.parse(s.slice(0, end + 1))
    } catch {
      /* give up */
    }
  }
  return undefined
}

/** Walk any JSON-LD value and collect Recipe nodes (handles @graph, arrays, nesting). */
export function findRecipeNodes(data: any, out: J[] = [], depth = 0): J[] {
  if (!data || depth > 14) return out
  if (Array.isArray(data)) {
    data.forEach((d) => findRecipeNodes(d, out, depth + 1))
    return out
  }
  if (typeof data !== 'object') return out
  if (isType(data, 'Recipe')) {
    out.push(data)
    return out
  }
  // walk every nested value: @graph, mainEntity, Recipe inside WebPage/Article/ItemList, etc.
  for (const v of Object.values(data)) {
    if (v && typeof v === 'object') findRecipeNodes(v, out, depth + 1)
    // JSON-LD stored as a string inside JSON (seen in __NEXT_DATA__ payloads)
    else if (typeof v === 'string' && v.length < 200000 && /^\s*[[{]/.test(v) && /Recipe/.test(v)) {
      const inner = parseJsonLoose(v)
      if (inner) findRecipeNodes(inner, out, depth + 1)
    }
  }
  return out
}

function pickImage(img: any, base: string): string | undefined {
  const cands: { url: string; w: number }[] = []
  const visit = (v: any) => {
    if (!v) return
    if (typeof v === 'string') cands.push({ url: v, w: 0 })
    else if (Array.isArray(v)) v.forEach(visit)
    else if (typeof v === 'object') {
      const u = v.url || v.contentUrl || v['@id']
      if (typeof u === 'string') cands.push({ url: u, w: parseInt(v.width?.['@value'] ?? v.width, 10) || 0 })
      else if (u) visit(u)
    }
  }
  visit(img)
  const valid = cands.filter((c) => /^(https?:)?\/\/|^\//.test(c.url) && !/^data:/.test(c.url))
  if (!valid.length) return undefined
  const best = valid.reduce((a, b) => (b.w > a.w ? b : a), valid[0])
  return absUrl(best.url, base)
}

function nameOf(v: any): string | undefined {
  const first = asArray(v)
    .map((x) => (typeof x === 'string' ? x : x?.name))
    .filter(Boolean)
  return first.length ? clean(first.join(', ')) : undefined
}

/** Drop blog boilerplate like "Recipe video above." from the start of a description. */
export function tidyLede(s?: string): string | undefined {
  const t = (s || '').replace(/^(\s*(recipe )?video (above|below)[.!:]?|\s*jump to recipe[.!:]?)\s*/i, '').trim()
  return t || undefined
}

export function parseYield(v: any): { text?: string; servings?: number } {
  const arr = asArray(v).map((x) => (typeof x === 'object' ? x?.value ?? x?.name : x)).filter((x) => x != null && x !== '')
  if (!arr.length) return {}
  const strs = arr.map((x) => clean(String(x)).replace(/(\d)\s*[-–]\s*(\d)/g, '$1–$2'))
  // Prefer the most descriptive string ("4 servings" over "4")
  const text = strs.reduce((a, b) => (b.length > a.length ? b : a), strs[0])
  const numMatch = strs.map((s) => /(\d+(?:\.\d+)?)/.exec(s)).find(Boolean)
  const servings = numMatch ? parseFloat(numMatch[1]) : undefined
  const isPlainNumber = /^\d+(\.\d+)?$/.test(text)
  return { text: isPlainNumber ? `${text} servings` : text, servings: servings && servings > 0 && servings < 500 ? servings : undefined }
}

function ingredientsFrom(v: any): IngredientGroup[] {
  const items = asArray(v)
    .flatMap((x) => (typeof x === 'string' ? splitIfBlock(x) : [x?.text ?? x?.name ?? '']))
    .map((x) => tidyIngredient(clean(x)))
    .filter(Boolean)
  return items.length ? [{ items }] : []
}

function splitIfBlock(s: string): string[] {
  return /\n|<br|<li|<p/i.test(s) ? splitBlock(s) : [s]
}

function stepText(node: any): string[] {
  if (node == null) return []
  if (typeof node === 'string') return splitBlock(node)
  if (Array.isArray(node)) return node.flatMap(stepText)
  if (typeof node === 'object') {
    if (node.itemListElement) return stepText(node.itemListElement)
    const t = node.text ?? node.description ?? node.name
    if (t) return splitIfBlock(String(t)).map(clean).filter(Boolean)
  }
  return []
}

export function instructionsFrom(v: any): StepGroup[] {
  const groups: StepGroup[] = []
  let loose: string[] = []
  const flush = () => {
    if (loose.length) groups.push({ steps: loose })
    loose = []
  }
  const visit = (node: any) => {
    if (node == null) return
    if (Array.isArray(node)) return node.forEach(visit)
    if (typeof node === 'object' && (isType(node, 'HowToSection') || (node.itemListElement && !node.text))) {
      flush()
      const steps = stepText(node.itemListElement ?? node.steps ?? [])
      if (steps.length) groups.push({ title: clean(node.name) || undefined, steps })
      return
    }
    loose.push(...stepText(node))
  }
  visit(v)
  flush()
  // dedupe identical consecutive steps (some sites repeat name+text)
  return groups
    .map((g) => ({ ...g, steps: g.steps.filter((s, i, a) => s && s !== a[i - 1]) }))
    .filter((g) => g.steps.length)
}

function metaContent(doc: Document, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const el = doc.querySelector(`meta[property="${k}"], meta[name="${k}"], meta[itemprop="${k}"]`)
    const c = el?.getAttribute('content')
    if (c && c.trim()) return clean(c)
  }
  return undefined
}

function siteNameFor(doc: Document, url: string, node?: J): string {
  return (
    metaContent(doc, 'og:site_name', 'application-name') ||
    nameOf(node?.publisher) ||
    hostLabel(url)
  )
}

function notesFromDom(doc: Document): string[] {
  const sel = [
    '.wprm-recipe-notes', '.tasty-recipes-notes', '.mv-create-notes', '.recipe-notes',
    '.wprm-recipe-notes-container', '[class*="recipe-notes"]', '.notes', '.recipe-card-notes',
  ]
  for (const s of sel) {
    const el = doc.querySelector(s)
    if (!el) continue
    const lis = Array.from(el.querySelectorAll('li, p')).map((x) => clean(x.textContent))
    const items = (lis.length ? lis : [clean(el.textContent)]).filter((t) => t && !/^notes?:?$/i.test(t))
    if (items.length) return uniq(items).slice(0, 12)
  }
  return []
}

function tagsFrom(node: J): string[] {
  const raw = [...asArray(node.recipeCategory), ...asArray(node.recipeCuisine)]
  return uniq(
    raw.flatMap((x) => String(x).split(','))
      .map(clean)
      .filter((t) => t && t.length < 24),
  ).slice(0, 4)
}

// ───────────────────────────── JSON-LD ─────────────────────────────

export function fromJsonLd(doc: Document, url: string): ParsedRecipe | undefined {
  const scripts = Array.from(doc.querySelectorAll('script[type*="ld+json" i]'))
  const nodes: J[] = []
  for (const s of scripts) {
    const data = parseJsonLoose(s.textContent || '')
    if (data) findRecipeNodes(data, nodes)
  }
  if (!nodes.length) return undefined
  // pick the richest node
  const score = (n: J) => asArray(n.recipeIngredient ?? n.ingredients).length + asArray(n.recipeInstructions).length * 2
  const node = nodes.reduce((a, b) => (score(b) > score(a) ? b : a), nodes[0])
  const y = parseYield(node.recipeYield ?? node.yield)
  const prep = parseDuration(node.prepTime)
  const cook = parseDuration(node.cookTime)
  const total = parseDuration(node.totalTime) ?? (prep || cook ? (prep ?? 0) + (cook ?? 0) : undefined)
  const recipe: ParsedRecipe = {
    title: clean(node.name || node.headline) || metaContent(doc, 'og:title') || clean(doc.title),
    description: tidyLede(clean(node.description)),
    url,
    siteName: siteNameFor(doc, url, node),
    author: nameOf(node.author),
    image: pickImage(node.image, url) || absUrl(metaContent(doc, 'og:image', 'twitter:image'), url),
    prepTime: prep,
    cookTime: cook,
    totalTime: total,
    yieldText: y.text,
    servings: y.servings,
    ingredients: ingredientsFrom(node.recipeIngredient ?? node.ingredients),
    instructions: instructionsFrom(node.recipeInstructions),
    notes: notesFromDom(doc),
    tags: tagsFrom(node),
    extractedVia: 'json-ld',
  }
  return recipe
}

// ───────────────────────────── Microdata ─────────────────────────────

function propValue(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const attr =
    el.getAttribute('content') ??
    (tag === 'meta' ? '' : null) ??
    (['img', 'source', 'audio', 'video'].includes(tag) ? el.getAttribute('src') : null) ??
    (['a', 'link'].includes(tag) ? el.getAttribute('href') : null) ??
    (tag === 'time' ? el.getAttribute('datetime') : null)
  return attr != null && attr !== '' ? attr : el.textContent || ''
}

function ownProps(scope: Element, name: string): Element[] {
  return Array.from(scope.querySelectorAll(`[itemprop~="${name}"]`)).filter((el) => {
    // only props belonging to this scope (not nested itemscopes)
    let p = el.parentElement
    while (p && p !== scope) {
      if (p.hasAttribute('itemscope')) return false
      p = p.parentElement
    }
    return true
  })
}

export function fromMicrodata(doc: Document, url: string): ParsedRecipe | undefined {
  const scope = Array.from(doc.querySelectorAll('[itemscope][itemtype]')).find((el) =>
    /schema\.org\/Recipe\b/i.test(el.getAttribute('itemtype') || ''),
  )
  if (!scope) return undefined
  const one = (n: string) => {
    const el = ownProps(scope, n)[0]
    return el ? propValue(el) : undefined
  }
  const many = (n: string) => ownProps(scope, n).map((e) => clean(propValue(e))).filter(Boolean)
  const imgEl = ownProps(scope, 'image')[0]
  let image: string | undefined
  if (imgEl) {
    image = imgEl.hasAttribute('itemscope')
      ? propValue(imgEl.querySelector('[itemprop~="url"]') || imgEl)
      : propValue(imgEl)
  }
  const instructionEls = ownProps(scope, 'recipeInstructions')
  const steps: string[] = []
  for (const el of instructionEls) {
    const inner = Array.from(el.querySelectorAll('[itemprop~="text"], li, p'))
    if (inner.length) steps.push(...inner.map((x) => clean(x.textContent)).filter(Boolean))
    else steps.push(...splitBlock(el.innerHTML || propValue(el)))
  }
  const ingredients = [...many('recipeIngredient'), ...many('ingredients')]
  const y = parseYield(one('recipeYield'))
  const prep = parseDuration(one('prepTime'))
  const cook = parseDuration(one('cookTime'))
  return {
    title: clean(one('name')) || metaContent(doc, 'og:title') || clean(doc.title),
    description: clean(one('description')) || undefined,
    url,
    siteName: siteNameFor(doc, url),
    author: clean(one('author')) || undefined,
    image: absUrl(image, url) || absUrl(metaContent(doc, 'og:image'), url),
    prepTime: prep,
    cookTime: cook,
    totalTime: parseDuration(one('totalTime')) ?? (prep || cook ? (prep ?? 0) + (cook ?? 0) : undefined),
    yieldText: y.text,
    servings: y.servings,
    ingredients: ingredients.length ? [{ items: uniq(ingredients) }] : [],
    instructions: steps.length ? [{ steps: uniq(steps) }] : [],
    notes: notesFromDom(doc),
    tags: [],
    extractedVia: 'microdata',
  }
}

// ───────────────────────────── Heuristic ─────────────────────────────

const ING_RE = /ingredient/i
const STEP_RE = /instruction|direction|method|preparation|steps?\b/i

function bestList(doc: Document, re: RegExp, itemSelectors: string[]): string[] {
  // 1) known plugin selectors
  for (const sel of itemSelectors) {
    const items = Array.from(doc.querySelectorAll(sel)).map((e) => clean(e.textContent)).filter(Boolean)
    if (items.length >= 2) return uniq(items)
  }
  // 2) containers whose class/id matches, take the one with most <li>
  let best: string[] = []
  const containers = Array.from(doc.querySelectorAll('[class], [id]')).filter((el) =>
    re.test((el.getAttribute('class') || '') + ' ' + (el.id || '')),
  )
  for (const c of containers) {
    const items = Array.from(c.querySelectorAll('li')).map((e) => clean(e.textContent)).filter((t) => t && t.length < 600)
    if (items.length > best.length) best = items
  }
  if (best.length >= 2) return uniq(best)
  // 3) heading followed by a list
  const heads = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,strong,b,p')).filter((h) => re.test(h.textContent || '') && (h.textContent || '').length < 40)
  for (const h of heads) {
    let n: Element | null = h.nextElementSibling ?? h.parentElement?.nextElementSibling ?? null
    for (let i = 0; n && i < 4; i++, n = n.nextElementSibling) {
      const list = n.matches('ul,ol') ? n : n.querySelector('ul,ol')
      if (list) {
        const items = Array.from(list.querySelectorAll('li')).map((e) => clean(e.textContent)).filter(Boolean)
        if (items.length >= 2) return items
      }
    }
  }
  return []
}

export function fromHeuristics(doc: Document, url: string): ParsedRecipe | undefined {
  const ingredients = bestList(doc, ING_RE, [
    '.wprm-recipe-ingredient', '.tasty-recipes-ingredients li', '.mv-create-ingredients li',
    '.ingredients-item-name', '.recipe-ingredients li', '[class*="ingredient"] li',
  ])
  const steps = bestList(doc, STEP_RE, [
    '.wprm-recipe-instruction-text', '.tasty-recipes-instructions li', '.mv-create-instructions li',
    '.recipe-directions__list--item', '.recipe-instructions li', '[class*="instruction"] li', '[class*="direction"] li',
  ])
  if (ingredients.length < 2 && steps.length < 2) return undefined
  const title = metaContent(doc, 'og:title', 'twitter:title') || clean(doc.querySelector('h1')?.textContent) || clean(doc.title)
  return {
    title,
    description: metaContent(doc, 'og:description', 'description'),
    url,
    siteName: siteNameFor(doc, url),
    image: absUrl(metaContent(doc, 'og:image', 'twitter:image') || doc.querySelector('article img, main img')?.getAttribute('src') || undefined, url),
    ingredients: ingredients.length ? [{ items: ingredients }] : [],
    instructions: steps.length ? [{ steps }] : [],
    notes: notesFromDom(doc),
    tags: [],
    extractedVia: 'heuristic',
  }
}

// ───────────────────────────── Markdown (r.jina.ai default output) ─────────────────────────────

export function fromMarkdown(md: string, url: string): ParsedRecipe | undefined {
  const lines = md.split(/\r?\n/)
  const title = clean(/^Title:\s*(.+)$/m.exec(md)?.[1] || /^#\s+(.+)$/m.exec(md)?.[1] || '')
  const image = /!\[[^\]]*\]\((https?:[^)\s]+)/.exec(md)?.[1]
  const section = (re: RegExp) => {
    const out: string[] = []
    let on = false
    for (const raw of lines) {
      const l = raw.trim()
      const isHead = /^#{1,6}\s|^\*\*[^*]+\*\*$|^[A-Z][A-Za-z ]{2,30}:?$/.test(l) || /^[-=]{3,}$/.test(l)
      if (isHead && re.test(l)) { on = true; continue }
      if (on && isHead && out.length && !/^[-=]{3,}$/.test(l)) break
      if (!on) continue
      const m = /^(?:[-*+•]|\d+[.)])\s+(.+)$/.exec(l)
      if (m) out.push(clean(m[1].replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '')))
    }
    return out.filter(Boolean)
  }
  const ingredients = section(/ingredient/i)
  const steps = section(/instruction|direction|method|preparation|steps/i)
  if (ingredients.length < 2 && steps.length < 2) return undefined
  return {
    title: title || hostLabel(url),
    url,
    siteName: hostLabel(url),
    image,
    ingredients: ingredients.length ? [{ items: ingredients }] : [],
    instructions: steps.length ? [{ steps }] : [],
    notes: [],
    tags: [],
    extractedVia: 'markdown',
  }
}

// ───────────────────────────── RDFa ─────────────────────────────

export function fromRdfa(doc: Document, url: string): ParsedRecipe | undefined {
  const scope = Array.from(doc.querySelectorAll('[typeof]')).find((el) => /(^|\s|:|\/)Recipe(\s|$)/.test(el.getAttribute('typeof') || ''))
  if (!scope) return undefined
  const props = (name: string) =>
    Array.from(scope.querySelectorAll('[property]')).filter((el) =>
      (el.getAttribute('property') || '').split(/\s+/).some((p) => p.replace(/^.*[:/#]/, '') === name),
    )
  const val = (el: Element) => el.getAttribute('content') ?? el.getAttribute('src') ?? el.getAttribute('href') ?? el.getAttribute('datetime') ?? el.textContent ?? ''
  const one = (n: string) => { const e = props(n)[0]; return e ? val(e) : undefined }
  const many = (n: string) => props(n).map((e) => clean(val(e))).filter(Boolean)
  const steps: string[] = []
  for (const el of props('recipeInstructions')) {
    const inner = Array.from(el.querySelectorAll('li, p'))
    steps.push(...(inner.length ? inner.map((x) => clean(x.textContent)) : splitBlock(el.innerHTML)))
  }
  const prep = parseDuration(one('prepTime'))
  const cook = parseDuration(one('cookTime'))
  const y = parseYield(one('recipeYield'))
  const ingredients = [...many('recipeIngredient'), ...many('ingredients')]
  return {
    title: clean(one('name')) || metaContent(doc, 'og:title') || clean(doc.title),
    description: clean(one('description')) || undefined,
    url,
    siteName: siteNameFor(doc, url),
    author: clean(one('author')) || undefined,
    image: absUrl(one('image'), url) || absUrl(metaContent(doc, 'og:image'), url),
    prepTime: prep,
    cookTime: cook,
    totalTime: parseDuration(one('totalTime')) ?? (prep || cook ? (prep ?? 0) + (cook ?? 0) : undefined),
    yieldText: y.text,
    servings: y.servings,
    ingredients: ingredients.length ? [{ items: uniq(ingredients) }] : [],
    instructions: steps.filter(Boolean).length ? [{ steps: uniq(steps.filter(Boolean)) }] : [],
    notes: notesFromDom(doc),
    tags: [],
    extractedVia: 'rdfa',
  }
}

// ───────────────────────────── Recipe plugins (no schema needed) ─────────────────────────────

interface PluginSpec {
  name: string
  /** steps live as one run of prose directly inside the step element (Jetpack): split it into sentences */
  proseSteps?: boolean
  root: string
  title?: string
  image?: string
  ingGroup?: string
  ingGroupTitle?: string
  ing: string
  stepGroup?: string
  stepGroupTitle?: string
  step: string
  prep?: string
  cook?: string
  total?: string
  servings?: string
  notes?: string
}

const PLUGINS: PluginSpec[] = [
  {
    name: 'WP Recipe Maker', root: '.wprm-recipe-container, .wprm-recipe', title: '.wprm-recipe-name', image: '.wprm-recipe-image img',
    ingGroup: '.wprm-recipe-ingredient-group', ingGroupTitle: '.wprm-recipe-group-name', ing: '.wprm-recipe-ingredient',
    stepGroup: '.wprm-recipe-instruction-group', stepGroupTitle: '.wprm-recipe-group-name', step: '.wprm-recipe-instruction-text, .wprm-recipe-instruction',
    prep: '.wprm-recipe-prep_time-container, .wprm-recipe-prep_time', cook: '.wprm-recipe-cook_time-container, .wprm-recipe-cook_time',
    total: '.wprm-recipe-total_time-container, .wprm-recipe-total_time', servings: '.wprm-recipe-servings', notes: '.wprm-recipe-notes',
  },
  {
    name: 'Tasty Recipes', root: '.tasty-recipes', title: '.tasty-recipes-title, h2', image: '.tasty-recipes-image img',
    ingGroup: '.tasty-recipes-ingredients-body > div, .tasty-recipes-ingredients', ingGroupTitle: 'h4, h3', ing: '.tasty-recipes-ingredients li, [data-tr-ingredient-checkbox]',
    stepGroup: '.tasty-recipes-instructions-body > div, .tasty-recipes-instructions', stepGroupTitle: 'h4, h3', step: '.tasty-recipes-instructions li, .tasty-recipes-instructions p',
    prep: '.tasty-recipes-prep-time', cook: '.tasty-recipes-cook-time', total: '.tasty-recipes-total-time', servings: '.tasty-recipes-yield', notes: '.tasty-recipes-notes',
  },
  {
    name: 'Mediavine Create', root: '.mv-create-card, .mv-recipe-card, [class*="mv-create"]', title: '.mv-create-title', image: '.mv-create-image img',
    ingGroup: '.mv-create-ingredients', ingGroupTitle: 'h4, h3', ing: '.mv-create-ingredients li',
    stepGroup: '.mv-create-instructions', stepGroupTitle: 'h4, h3', step: '.mv-create-instructions li',
    prep: '.mv-create-time-prep', cook: '.mv-create-time-active, .mv-create-time-cook', total: '.mv-create-time-total', servings: '.mv-create-yield', notes: '.mv-create-notes',
  },
  {
    name: 'ZipList / Yummly', root: '#zlrecipe-container, .zlrecipe-container, .zlmeta, [id^="zlrecipe"]', title: '#zlrecipe-title, .zlrecipe-title',
    ing: '#zlrecipe-ingredients-list li, .zlrecipe-ingredients li, .ingredient', step: '#zlrecipe-instructions-list li, .zlrecipe-instructions li, .instruction',
    prep: '#zlrecipe-prep-time, .zlrecipe-prep-time', cook: '#zlrecipe-cook-time', total: '#zlrecipe-total-time', servings: '#zlrecipe-yield, .zlrecipe-yield',
  },
  {
    name: 'Cooked', root: '.cooked-recipe, .cooked-recipe-ingredients, .cooked-recipe-directions', title: '.cooked-recipe-title, h1',
    ing: '.cooked-single-ingredient .cooked-ing-name, .cooked-single-ingredient', step: '.cooked-single-direction .cooked-dir-content, .cooked-dir-content',
    total: '.cooked-total-time', servings: '.cooked-servings',
  },
  {
    name: 'EasyRecipe', root: '.easyrecipe', title: '.ERSName', image: '.ERSImage img, img',
    ing: '.ERSIngredients li, .ingredient', step: '.ERSInstructions li, .instruction', prep: '.ERSPrepTime time, .preptime', cook: '.ERSCookTime time, .cooktime',
    total: '.ERSTotalTime time', servings: '.ERSServes, .yield', notes: '.ERSNotes',
  },
  {
    name: 'Jetpack Recipe', root: '.jetpack-recipe', title: '.jetpack-recipe-title', image: '.jetpack-recipe-image',
    ing: '.jetpack-recipe-ingredients li', step: '.jetpack-recipe-directions', proseSteps: true,
    total: '.jetpack-recipe-time', servings: '.jetpack-recipe-servings', notes: '.jetpack-recipe-notes',
  },
  {
    name: 'Recipe Card Blocks / WPZOOM', root: '.wp-block-wpzoom-recipe-card-block-recipe-card, .recipe-card-block', title: '.recipe-card-title',
    ing: '.ingredients-list li', step: '.directions-list li',
  },
]

function timeIn(root: Element, sel?: string): number | undefined {
  if (!sel) return undefined
  const el = root.querySelector(sel)
  if (!el) return undefined
  const iso = el.querySelector('[datetime]')?.getAttribute('datetime') || el.getAttribute('datetime') || el.querySelector('meta[content]')?.getAttribute('content')
  return parseDuration(iso || clean(el.textContent).replace(/^(prep|cook|total)( time)?:?/i, ''))
}

function groupsIn(root: Element, groupSel: string | undefined, titleSel: string | undefined, itemSel: string): { title?: string; items: string[] }[] {
  const text = (el: Element) => clean(el.textContent).replace(/^▢\s*/, '')
  if (groupSel) {
    const groups = Array.from(root.querySelectorAll(groupSel))
      .map((g) => ({ title: titleSel ? clean(g.querySelector(titleSel)?.textContent) || undefined : undefined, items: uniq(Array.from(g.querySelectorAll(itemSel)).map(text).filter(Boolean)) }))
      .filter((g) => g.items.length)
    // nested group selectors can double count; keep only innermost distinct groups
    const seen = new Set<string>()
    const out = groups.filter((g) => { const k = g.items.join('|'); if (seen.has(k)) return false; seen.add(k); return true })
    if (out.length) {
      const all = uniq(out.flatMap((g) => g.items))
      if (out.reduce((n, g) => n + g.items.length, 0) === all.length) return out
      return [{ items: all }]
    }
  }
  const items = uniq(Array.from(root.querySelectorAll(itemSel)).map(text).filter(Boolean))
  return items.length ? [{ items }] : []
}

/** Steps written as list items or paragraphs if present, else one prose block split into 1-2 sentence steps. */
function proseStepsIn(root: Element, sel: string): StepGroup[] {
  const el = root.querySelector(sel)
  if (!el) return []
  const li = Array.from(el.querySelectorAll('li')).map((x) => clean(x.textContent)).filter(Boolean)
  if (li.length) return [{ steps: li }]
  // own text only: trailing <p>s inside are usually the author's notes
  const own = clean(Array.from(el.childNodes).filter((n) => n.nodeType === 3 || (n as Element).tagName === 'BR' || (n as Element).tagName === 'STRONG' || (n as Element).tagName === 'EM' || (n as Element).tagName === 'A').map((n) => n.textContent).join(' '))
  const text = own.length > 40 ? own : clean(el.querySelector('p')?.textContent || el.textContent)
  const sentences = text.match(/[^.!?]+(?:[.!?]+(?:\s*\([^)]*\))?|$)/g)?.map((x) => x.trim()).filter((x) => x.length > 1) ?? []
  const steps: string[] = []
  for (const sn of sentences) {
    const last = steps[steps.length - 1]
    if (last && (last.length < 70 || sn.length < 30)) steps[steps.length - 1] = `${last} ${sn}`
    else steps.push(sn)
  }
  return steps.length ? [{ steps }] : []
}

export function fromPlugins(doc: Document, url: string): ParsedRecipe | undefined {
  for (const p of PLUGINS) {
    const root = doc.querySelector(p.root)
    if (!root) continue
    const scope = root.closest('body') ? (doc.querySelectorAll(p.root).length > 1 ? doc.body : root) : root
    const ingredients = groupsIn(scope, p.ingGroup, p.ingGroupTitle, p.ing)
    const stepGroups = p.proseSteps ? proseStepsIn(scope, p.step) : groupsIn(scope, p.stepGroup, p.stepGroupTitle, p.step).map((g) => ({ title: g.title, steps: g.items }))
    if (!ingredients.length && !stepGroups.length) continue
    const prep = timeIn(scope, p.prep)
    const cook = timeIn(scope, p.cook)
    const y = parseYield(p.servings ? clean(scope.querySelector(p.servings)?.textContent).replace(/^(yield|serves|servings)\s*:?\s*/i, '') || undefined : undefined)
    const notesEl = p.notes ? scope.querySelector(p.notes) : null
    const img = p.image ? scope.querySelector(p.image) : null
    return {
      title: clean(p.title ? scope.querySelector(p.title)?.textContent : '') || metaContent(doc, 'og:title') || clean(doc.querySelector('h1')?.textContent) || clean(doc.title),
      description: metaContent(doc, 'og:description', 'description'),
      url,
      siteName: siteNameFor(doc, url),
      image: absUrl(img?.getAttribute('data-src') || img?.getAttribute('data-lazy-src') || img?.getAttribute('src') || metaContent(doc, 'og:image') || undefined, url),
      prepTime: prep,
      cookTime: cook,
      totalTime: timeIn(scope, p.total) ?? (prep || cook ? (prep ?? 0) + (cook ?? 0) : undefined),
      yieldText: y.text,
      servings: y.servings,
      ingredients,
      instructions: stepGroups,
      notes: notesEl ? uniq(Array.from(notesEl.querySelectorAll('li, p')).map((x) => clean(x.textContent)).filter((t) => t && !/^notes?:?$/i.test(t))).slice(0, 12) : notesFromDom(doc),
      tags: [],
      extractedVia: 'plugin',
    }
  }
  return undefined
}

// ───────────────────────────── Next.js / embedded app JSON ─────────────────────────────

const ING_KEYS = ['recipeIngredient', 'ingredients', 'ingredientLines', 'ingredientList', 'ingredient_sections', 'ingredientGroups']
const STEP_KEYS = ['recipeInstructions', 'instructions', 'steps', 'directions', 'method', 'preparationSteps', 'instruction_sections']

function textish(v: any): string[] {
  if (v == null) return []
  if (typeof v === 'string') return splitIfBlock(v).map(clean).filter(Boolean)
  if (typeof v === 'number') return []
  if (Array.isArray(v)) return v.flatMap(textish)
  if (typeof v === 'object') {
    for (const k of ['text', 'display_text', 'raw_text', 'description', 'content', 'html', 'name', 'ingredient', 'line']) {
      if (typeof v[k] === 'string' && v[k].trim()) {
        const extra = [v.quantity ?? v.amount, v.unit].filter((x) => typeof x === 'string' || typeof x === 'number')
        const base = clean(v[k])
        return [k === 'name' && extra.length && !/^\d/.test(base) ? `${extra.join(' ')} ${base}` : base]
      }
    }
    for (const k of ['items', 'steps', 'ingredients', 'components', 'instructions', 'itemListElement']) if (Array.isArray(v[k])) return textish(v[k])
  }
  return []
}

/** Find a recipe-shaped object anywhere in a big JSON blob (Next.js, Nuxt, Gatsby, Remix payloads). */
export function findRecipeObject(data: any, depth = 0): J | undefined {
  if (!data || typeof data !== 'object' || depth > 16) return undefined
  if (!Array.isArray(data)) {
    const ingKey = ING_KEYS.find((k) => Array.isArray(data[k]) && textish(data[k]).length >= 2)
    const stepKey = STEP_KEYS.find((k) => data[k] && textish(data[k]).length >= 1)
    if (ingKey && stepKey && (data.name || data.title || data.headline)) return { ...data, __ing: ingKey, __step: stepKey }
  }
  for (const v of Object.values(data)) {
    const f = findRecipeObject(v, depth + 1)
    if (f) return f
  }
  return undefined
}

export function fromNextData(doc: Document, url: string): ParsedRecipe | undefined {
  const blobs = Array.from(doc.querySelectorAll('script#__NEXT_DATA__, script[type="application/json"], script#__NUXT_DATA__, script[data-hypernova-key]'))
    .map((s) => parseJsonLoose(s.textContent || ''))
    .filter(Boolean)
  for (const data of blobs) {
    // 1. proper schema.org Recipe nodes hiding in the payload
    const nodes = findRecipeNodes(data)
    if (nodes.length) {
      const fake = doc.implementation.createHTMLDocument('')
      const sc = fake.createElement('script')
      sc.type = 'application/ld+json'
      sc.textContent = JSON.stringify(nodes)
      fake.head.append(sc)
      Array.from(doc.querySelectorAll('meta')).forEach((m) => fake.head.append(m.cloneNode(true)))
      const r = fromJsonLd(fake, url)
      if (r) return { ...r, extractedVia: 'next-data' }
    }
    // 2. a recipe-shaped object with its own field names
    const o = findRecipeObject(data)
    if (o) {
      const steps = textish(o[o.__step])
      const ingredients = textish(o[o.__ing])
      const y = parseYield(o.recipeYield ?? o.yield ?? o.servings ?? o.num_servings)
      const prep = parseDuration(o.prepTime ?? o.prep_time ?? o.prep_time_minutes)
      const cook = parseDuration(o.cookTime ?? o.cook_time ?? o.cook_time_minutes)
      return {
        title: clean(o.name || o.title || o.headline),
        description: clean(o.description) || metaContent(doc, 'og:description') || undefined,
        url,
        siteName: siteNameFor(doc, url),
        image: pickImage(o.image ?? o.thumbnail_url ?? o.photo ?? o.images, url) || absUrl(metaContent(doc, 'og:image'), url),
        prepTime: prep,
        cookTime: cook,
        totalTime: parseDuration(o.totalTime ?? o.total_time ?? o.total_time_minutes) ?? (prep || cook ? (prep ?? 0) + (cook ?? 0) : undefined),
        yieldText: y.text,
        servings: y.servings,
        ingredients: ingredients.length ? [{ items: uniq(ingredients) }] : [],
        instructions: steps.length ? [{ steps: uniq(steps) }] : [],
        notes: [],
        tags: [],
        extractedVia: 'next-data',
      }
    }
  }
  return undefined
}

// ───────────────────────────── Plain text (Safari Reader / select-all / heading-based) ─────────────────────────────

const UNIT = '(?:cups?|c\\.|tbsps?|tablespoons?|tsps?|teaspoons?|t\\.|oz|ounces?|lbs?|pounds?|g|grams?|kg|kilograms?|ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|pinch(?:es)?|dash(?:es)?|cloves?|cans?|tins?|sticks?|slices?|pieces?|bunch(?:es)?|sprigs?|heads?|handfuls?|packages?|pkgs?|quarts?|qts?|pints?|pts?|large|medium|small|whole|stalks?|fillets?|knobs?|jars?|bottles?|bags?|drops?|scoops?|sheets?)'
const QTY = '(?:\\d+(?:[.,/]\\d+)?(?:\\s+\\d/\\d)?|[¼½¾⅓⅔⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚]|\\d+\\s*[¼½¾⅓⅔⅛⅜⅝⅞]|a|an|one|two|three|four|half)'
const ING_LINE = new RegExp(`^(?:[-*•▢☐□◦·]\\s*)?(?:${QTY}\\s*(?:[-–to]+\\s*${QTY}\\s*)?(?:${UNIT}\\b\\.?)?|${UNIT}\\b|(?:salt|pepper|oil|water|butter|sugar|flour)\\b)`, 'i')
const STEP_START = /^(?:step\s*)?\d+[.):]\s+|^(?:preheat|heat|add|mix|stir|whisk|combine|place|bake|cook|bring|pour|season|serve|remove|transfer|cut|chop|slice|melt|beat|fold|let|cover|simmer|boil|roast|grill|fry|toss|spread|sprinkle|top|in a|using|set|line|make|prepare|turn|reduce|return|drain|rinse|blend|process|knead|roll|shape|divide|chill|refrigerate|freeze|garnish)\b/i
export const ING_HEAD = /^(?:#+\s*)?(?:for the\s+.+|ingredients?|what you(?:'|’)ll need|you(?:'|’)ll need|shopping list)\s*:?$/i
export const STEP_HEAD = /^(?:#+\s*)?(?:instructions?|directions?|method|preparation|steps|how to make(?: it)?|to make|procedure)\s*:?$/i
const STOP_HEAD = /^(?:#+\s*)?(?:notes?|tips?|nutrition(?: facts| information)?|storage|faq|video|reviews?|comments?|related|you may also like|more recipes|equipment|leave a (?:comment|review)|did you make this)\b/i

export function looksLikeIngredient(line: string): boolean {
  const l = line.trim()
  return l.length > 1 && l.length < 140 && ING_LINE.test(l) && !/[.!?]\s+\w+.*[.!?]$/.test(l)
}

function stripBullet(l: string) {
  return l.replace(/^(?:[-*•▢☐□◦·]|\d+[.)]|step\s*\d+[.:)]?)\s*/i, '').trim()
}

/**
 * Turn pasted recipe text (Safari Reader, select-all, a note) into a recipe.
 * Uses headings when present, otherwise ingredient-shaped lines vs sentence-shaped steps.
 */
export function fromText(raw: string, url = ''): ParsedRecipe | undefined {
  const lines = raw.replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim())
  const ingGroups: IngredientGroup[] = []
  const stepGroups: StepGroup[] = []
  const notes: string[] = []
  let mode: 'none' | 'ing' | 'step' | 'notes' | 'stop' = 'none'
  let pendingTitle: string | undefined
  let title = ''
  let prepTime: number | undefined, cookTime: number | undefined, totalTime: number | undefined
  let yieldText: string | undefined
  const pre: string[] = []

  for (const line of lines) {
    if (!line) continue
    const t = line.replace(/^#+\s*/, '')
    const tm = /^(prep(?:aration)?|cook(?:ing)?|total|active)(?:\s*time)?\s*[:\-–]?\s*(\d.{0,30}|an? (?:hour|half).{0,20})$/i.exec(t)
    if (tm && parseDuration(tm[2]) !== undefined) {
      const m = parseDuration(tm[2])
      if (/^prep/i.test(tm[1])) prepTime = m
      else if (/^cook|^active/i.test(tm[1])) cookTime = m
      else totalTime = m
      continue
    }
    const ym = /^(?:serves|servings|yield|makes)\s*:?\s*(.+)$/i.exec(t)
    if (ym && t.length < 60) { yieldText = ym[0]; continue }
    if (ING_HEAD.test(t)) {
      mode = 'ing'
      pendingTitle = /^for the/i.test(t) ? t.replace(/:$/, '') : undefined
      if (pendingTitle) ingGroups.push({ title: pendingTitle, items: [] })
      continue
    }
    if (STEP_HEAD.test(t)) { mode = 'step'; continue }
    if (/^notes?|^tips?/i.test(t) && t.length < 30) { mode = 'notes'; continue }
    if (STOP_HEAD.test(t) && t.length < 40) { mode = 'stop'; continue }
    if (mode === 'ing') {
      // a sub-heading inside ingredients ("For the sauce:" / "Sauce")
      if (/:$/.test(t) && t.length < 40 && !looksLikeIngredient(t)) { ingGroups.push({ title: t.replace(/:$/, ''), items: [] }); continue }
      if (!ingGroups.length) ingGroups.push({ items: [] })
      // a long sentence after the list means the method began without a heading
      if (!looksLikeIngredient(t) && t.length > 90 && ingGroups.some((g) => g.items.length >= 2)) { mode = 'step'; }
      else { ingGroups[ingGroups.length - 1].items.push(stripBullet(t)); continue }
    }
    if (mode === 'step') {
      if (/:$/.test(t) && t.length < 40) { stepGroups.push({ title: t.replace(/:$/, ''), steps: [] }); continue }
      if (!stepGroups.length) stepGroups.push({ steps: [] })
      const s = stripBullet(t)
      if (s.length > 2 && !/^step\s*\d+$/i.test(t)) stepGroups[stepGroups.length - 1].steps.push(s)
      continue
    }
    if (mode === 'notes') { notes.push(stripBullet(t)); continue }
    if (mode === 'none') pre.push(t)
  }

  // No headings at all: classify lines by shape.
  if (!ingGroups.some((g) => g.items.length) && !stepGroups.some((g) => g.steps.length)) {
    const ing: string[] = []
    const steps: string[] = []
    for (const l of pre) {
      if (looksLikeIngredient(l) && l.length < 100 && !STEP_START.test(l.replace(/^\d+[.)]\s*/, 'X '))) ing.push(stripBullet(l))
      else if (l.length > 25 && /[a-z]/.test(l) && (STEP_START.test(l) || /\.\s*$/.test(l))) steps.push(stripBullet(l))
    }
    if (ing.length) ingGroups.push({ items: ing })
    if (steps.length) stepGroups.push({ steps })
  }
  title = pre.find((l) => l.length > 2 && l.length < 90 && !looksLikeIngredient(l) && !/^https?:/i.test(l) && !/^(by |jump to|print|pin|save|rate)/i.test(l)) || ''
  const ingredients = ingGroups.filter((g) => g.items.length)
  const instructions = stepGroups.filter((g) => g.steps.length)
  if (!ingredients.length && !instructions.length) return undefined
  const y = parseYield(yieldText?.replace(/^(serves|servings|yield|makes)\s*:?\s*/i, (m) => (/makes/i.test(m) ? 'Makes ' : '')))
  return {
    title: title || 'Untitled recipe',
    url,
    siteName: url ? hostLabel(url) : 'by hand',
    prepTime, cookTime,
    totalTime: totalTime ?? (prepTime || cookTime ? (prepTime ?? 0) + (cookTime ?? 0) : undefined),
    yieldText: y.text,
    servings: y.servings,
    ingredients,
    instructions,
    notes: notes.slice(0, 12),
    tags: [],
    extractedVia: 'text',
  }
}

/** Heading-driven fallback over a real DOM: "Ingredients" / "Directions" headings and what follows them. */
export function fromHeadings(doc: Document, url: string): ParsedRecipe | undefined {
  const root = doc.querySelector('article, main, [role="main"], .entry-content, .post-content') || doc.body
  if (!root) return undefined
  // Flatten the content into lines, keeping headings and list items on their own line.
  const out: string[] = []
  const walk = (el: Element) => {
    const tag = el.tagName.toLowerCase()
    if (['script', 'style', 'noscript', 'nav', 'footer', 'aside', 'form', 'svg', 'button', 'iframe', 'header'].includes(tag)) return
    if (/comment|related|sidebar|share|newsletter|ad-|advert|promo|footer|nav/i.test(el.getAttribute('class') || '') && tag !== 'main' && tag !== 'article') return
    if (/^h[1-6]$|^li$|^p$|^dt$|^dd$|^tr$/.test(tag) || (tag === 'strong' && el.parentElement?.childNodes.length === 1)) {
      const t = clean(el.textContent)
      if (t) out.push(/^h[1-6]$/.test(tag) ? `## ${t}` : t)
      if (tag !== 'li' || !el.querySelector('ul,ol')) return
    }
    if (tag === 'br') out.push('')
    for (const c of Array.from(el.children)) walk(c)
  }
  walk(root)
  const r = fromText(out.join('\n'), url)
  if (!r) return undefined
  const ing = r.ingredients.reduce((n, g) => n + g.items.length, 0)
  if (ing < 2) return undefined
  return {
    ...r,
    title: metaContent(doc, 'og:title', 'twitter:title') || clean(doc.querySelector('h1')?.textContent) || r.title,
    description: metaContent(doc, 'og:description', 'description'),
    siteName: siteNameFor(doc, url),
    image: absUrl(metaContent(doc, 'og:image', 'twitter:image'), url),
    notes: r.notes.length ? r.notes : notesFromDom(doc),
    extractedVia: 'heuristic',
  }
}

/** Whatever we can say about any page (title, photo, blurb), so a card is never empty. */
export function pageBasics(html: string, url: string): ParsedRecipe {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return {
    title: metaContent(doc, 'og:title', 'twitter:title') || clean(doc.querySelector('h1')?.textContent) || clean(doc.title) || hostLabel(url),
    description: metaContent(doc, 'og:description', 'description', 'twitter:description'),
    url,
    siteName: siteNameFor(doc, url),
    image: absUrl(metaContent(doc, 'og:image', 'twitter:image'), url),
    ingredients: [],
    instructions: [],
    notes: [],
    tags: [],
    extractedVia: 'page',
  }
}

/** AMP and print versions a page links to (often lighter and easier to read). */
export function alternateLinks(html: string, base: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const out: string[] = []
  const add = (u?: string | null) => {
    const a = absUrl(u || undefined, base)
    if (a && a !== base && !out.includes(a) && /^https?:/.test(a)) out.push(a)
  }
  add(doc.querySelector('link[rel="amphtml"]')?.getAttribute('href'))
  doc.querySelectorAll('a.wprm-recipe-print, a.tasty-recipes-print-button, .tasty-recipes-print a, a.mv-create-print-button, a[href*="/wprm_print/"], a[href*="print=1"], a[href*="/print/"]').forEach((a) => add(a.getAttribute('href')))
  return out.slice(0, 3)
}

// ───────────────────────────── entry ─────────────────────────────

export function quality(r?: ParsedRecipe): number {
  if (!r) return 0
  const ing = r.ingredients.reduce((n, g) => n + g.items.length, 0)
  const st = r.instructions.reduce((n, g) => n + g.steps.length, 0)
  return (ing >= 2 ? 2 : ing ? 1 : 0) + (st >= 1 ? 2 : 0) + (r.image ? 1 : 0) + (r.title ? 1 : 0)
}

function mergeRecipes(a: ParsedRecipe, b: ParsedRecipe): ParsedRecipe {
  const n = (r: ParsedRecipe, k: 'ingredients' | 'instructions') => (r[k] as any[]).reduce((x, g) => x + (g.items ?? g.steps).length, 0)
  return {
    ...b,
    ...Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length))),
    ingredients: n(a, 'ingredients') >= n(b, 'ingredients') ? a.ingredients : b.ingredients,
    instructions: n(a, 'instructions') >= n(b, 'instructions') ? a.instructions : b.instructions,
    extractedVia: b.extractedVia,
  } as ParsedRecipe
}

/** Parse an HTML document string into a recipe. Returns undefined if nothing recipe-like is found. */
export function parseRecipeHtml(html: string, url: string): ParsedRecipe | undefined {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const tryEach = (fns: (() => ParsedRecipe | undefined)[]) => {
    let top: ParsedRecipe | undefined
    for (const f of fns) {
      let r: ParsedRecipe | undefined
      try {
        r = f()
      } catch {
        r = undefined
      }
      if (r && quality(r) > quality(top)) top = r
      if (top && quality(top) >= 6) break
    }
    return top
  }
  let best = tryEach([() => fromJsonLd(doc, url), () => fromMicrodata(doc, url), () => fromRdfa(doc, url)])
  // structured data sometimes lists ingredients but no steps (or vice versa): try richer sources
  if (!best || quality(best) < 5) {
    const more = tryEach([() => fromPlugins(doc, url), () => fromNextData(doc, url), () => fromHeuristics(doc, url), () => fromHeadings(doc, url)])
    if (more && quality(more) > quality(best)) best = best ? mergeRecipes(best, more) : more
  }
  if (!best) return undefined
  best.ingredients = best.ingredients.map((g) => ({ ...g, items: g.items.map(tidyIngredient).filter(Boolean) }))
  best.instructions = best.instructions.map((g) => ({ ...g, steps: g.steps.flatMap(splitNumberedStep) }))
  // fill gaps from the page
  if (!best.image) best.image = absUrl(metaContent(doc, 'og:image', 'twitter:image'), url)
  if (!best.notes.length) best.notes = notesFromDom(doc)
  if (!best.title) best.title = metaContent(doc, 'og:title') || hostLabel(url)
  const site = best.siteName.toLowerCase()
  best.title = best.title
    .replace(/\s+[|–—-]\s+([^|–—-]+)$/, (m, tail: string) => {
      const t = tail.trim().toLowerCase()
      return t && (site.includes(t) || t.includes(site) || /recipe|kitchen|cook|food|\.com/.test(t)) ? '' : m
    })
    .trim()
  const ingCount = best.ingredients.reduce((n, g) => n + g.items.length, 0)
  const stepCount = best.instructions.reduce((n, g) => n + g.steps.length, 0)
  if (ingCount === 0 && stepCount === 0) return undefined
  return best
}
