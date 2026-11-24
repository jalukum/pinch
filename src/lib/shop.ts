import { formatQty, parseQty, scaleIngredient } from './scale'
import type { IngredientGroup } from './types'

/** A recipe as it appears on the shopping list (with the cook's current scale). */
export interface ShopRecipe {
  id: string
  title: string
  servings?: number
  baseServings?: number
  factor: number
  ingredients: IngredientGroup[]
}

export interface ShopShare {
  id: string
  title: string
  text: string
}

export interface ShopLine {
  key: string
  text: string
  recipes: ShopShare[]
}

const UNI = '½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞'
const NUM = `(?:\\d+\\s+\\d+\\s*[/⁄]\\s*\\d+|\\d+\\s*[${UNI}]|\\d+\\s*[/⁄]\\s*\\d+|\\d*\\.\\d+|\\d+|[${UNI}])`

type Dim = 'vol' | 'weight' | string

interface UnitDef {
  names: string[]
  dim: Dim
  toBase: number
  out: string
}

// Volume base is teaspoons (1 cup = 48 tsp, 1 tbsp = 3 tsp, 1 tsp = 5 ml).
// Weight base is grams.
const UNITS: UnitDef[] = [
  { names: ['fluid ounces', 'fluid ounce', 'fl. oz.', 'fl. oz', 'fl oz', 'floz'], dim: 'vol', toBase: 6, out: 'fl oz' },
  { names: ['tablespoons', 'tablespoon', 'tbsps', 'tbsp', 'tbs', 'tb'], dim: 'vol', toBase: 3, out: 'tbsp' },
  { names: ['teaspoons', 'teaspoon', 'tsps', 'tsp'], dim: 'vol', toBase: 1, out: 'tsp' },
  { names: ['milliliters', 'millilitres', 'milliliter', 'millilitre', 'ml'], dim: 'vol', toBase: 0.202884, out: 'ml' },
  { names: ['liters', 'litres', 'liter', 'litre', 'l'], dim: 'vol', toBase: 202.884, out: 'l' },
  { names: ['cups', 'cup'], dim: 'vol', toBase: 48, out: 'cup' },
  { names: ['pints', 'pint', 'pt'], dim: 'vol', toBase: 96, out: 'pint' },
  { names: ['quarts', 'quart', 'qt'], dim: 'vol', toBase: 192, out: 'quart' },
  { names: ['kilograms', 'kilogram', 'kgs', 'kg'], dim: 'weight', toBase: 1000, out: 'kg' },
  { names: ['pounds', 'pound', 'lbs', 'lb'], dim: 'weight', toBase: 453.59237, out: 'lb' },
  { names: ['ounces', 'ounce', 'oz'], dim: 'weight', toBase: 28.349523125, out: 'oz' },
  { names: ['grams', 'gram', 'g'], dim: 'weight', toBase: 1, out: 'g' },
  { names: ['cloves', 'clove'], dim: 'clove', toBase: 1, out: 'clove' },
  { names: ['pinches', 'pinch'], dim: 'pinch', toBase: 1, out: 'pinch' },
  { names: ['dashes', 'dash'], dim: 'dash', toBase: 1, out: 'dash' },
  { names: ['cans', 'can'], dim: 'can', toBase: 1, out: 'can' },
  { names: ['sticks', 'stick'], dim: 'stick', toBase: 1, out: 'stick' },
  { names: ['bunches', 'bunch'], dim: 'bunch', toBase: 1, out: 'bunch' },
  { names: ['packages', 'package', 'pkgs', 'pkg', 'packs', 'pack'], dim: 'pkg', toBase: 1, out: 'package' },
  { names: ['slices', 'slice'], dim: 'slice', toBase: 1, out: 'slice' },
  { names: ['heads', 'head'], dim: 'head', toBase: 1, out: 'head' },
  { names: ['sprigs', 'sprig'], dim: 'sprig', toBase: 1, out: 'sprig' },
  { names: ['ears', 'ear'], dim: 'ear', toBase: 1, out: 'ear' },
  { names: ['pieces', 'piece'], dim: 'piece', toBase: 1, out: 'piece' },
]

const UNIT_RE = new RegExp(`^(${UNITS.flatMap((u) => u.names.map(esc)).sort((a, b) => b.length - a.length).join('|')})\\b\\.?`, 'i')

function esc(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findUnit(rest: string): { def: UnitDef; rest: string } | undefined {
  const m = UNIT_RE.exec(rest)
  if (!m) return undefined
  const def = UNITS.find((u) => u.names.includes(m[1].toLowerCase().replace(/\.$/, ''))) || UNITS.find((u) => u.names.some((n) => n === m[1].toLowerCase() || n + '.' === m[1].toLowerCase()))
  if (!def) return undefined
  return { def, rest: rest.slice(m[0].length).replace(/^of\s+/i, '').trim() }
}

const PREP_LEAD = /^(?:fresh|chopped|minced|diced|sliced|grated|peeled|seeded|crushed|trimmed|cleaned|halved|quartered|cubed|julienned|zested|juiced|softened|melted|room temperature|room-temperature|packed|sifted|divided|optional|plus more|finely|roughly|thinly|coarsely|lightly|freshly|extra-virgin|extra virgin|virgin|organic|pure|large|medium|small|whole|all-purpose|all purpose|plain)\s+/i
const PREP_TAIL = /\s*(?:,|;)\s*(?:chopped|minced|diced|sliced|grated|peeled|seeded|crushed|trimmed|softened|melted|sifted|packed|divided|optional|to taste|for serving|for garnish|plus more|room temperature|fresh|finely.*|thinly.*|roughly.*).*$/i
const PREP_END = /\s+(?:chopped|minced|diced|sliced|grated|peeled|fresh|softened|melted|sifted|packed|divided|optional|to taste)$/i

const ALIASES: Record<string, string> = {
  'confectioners sugar': 'powdered sugar',
  'confectioner sugar': 'powdered sugar',
  'icing sugar': 'powdered sugar',
  'scallion': 'green onion',
  'spring onion': 'green onion',
  'garbanzo bean': 'chickpea',
  'garbanzo': 'chickpea',
  'cilantro leaf': 'cilantro',
  'coriander leaf': 'cilantro',
}

const IRREG_SING: Record<string, string> = {
  leaves: 'leaf', loaves: 'loaf', tomatoes: 'tomato', potatoes: 'potato',
  berries: 'berry', cherries: 'cherry', babies: 'baby', shallots: 'shallot',
  radishes: 'radish', cloves: 'clove', limes: 'lime', lemons: 'lemon',
  onions: 'onion', eggs: 'egg', cookies: 'cookie', bunches: 'bunch',
}
const IRREG_PLUR: Record<string, string> = {
  leaf: 'leaves', loaf: 'loaves', tomato: 'tomatoes', potato: 'potatoes',
  berry: 'berries', cherry: 'cherries', shallot: 'shallots', radish: 'radishes',
  lime: 'limes', lemon: 'lemons', onion: 'onions', egg: 'eggs', cookie: 'cookies',
  clove: 'cloves', bunch: 'bunches',
}
const UNCOUNTABLE = new Set([
  'flour', 'sugar', 'salt', 'pepper', 'oil', 'olive oil', 'water', 'milk', 'butter',
  'rice', 'pasta', 'dough', 'frosting', 'icing', 'batter', 'juice', 'vinegar',
  'vanilla', 'cinnamon', 'honey', 'syrup', 'molasses', 'couscous', 'asparagus',
  'garlic', 'ginger', 'basil', 'oregano', 'thyme', 'rosemary', 'parsley', 'cilantro',
  'dill', 'cumin', 'paprika', 'cocoa', 'chocolate', 'cream', 'sour cream', 'yogurt',
  'cheese', 'parmesan', 'broth', 'stock', 'wine', 'soy sauce', 'fish sauce',
  'powdered sugar', 'brown sugar', 'cornstarch', 'cornflour', 'polenta', 'oatmeal',
  'oat', 'coffee', 'tea',
])

export function singularize(word: string): string {
  const w = word.trim().toLowerCase()
  if (!w) return w
  if (IRREG_SING[w]) return IRREG_SING[w]
  if (UNCOUNTABLE.has(w)) return w
  if (/(ss|us|is|ox)$/i.test(w) || /^(molasses|couscous|asparagus|canvas)$/i.test(w)) return w
  if (/ies$/i.test(w) && w.length > 4) return w.slice(0, -3) + 'y'
  if (/oes$/i.test(w) && w.length > 4) return w.slice(0, -2)
  if (/shes$|ches$|xes$|zes$/i.test(w)) return w.slice(0, -2)
  if (/s$/i.test(w) && !/ss$/i.test(w) && w.length > 3) return w.slice(0, -1)
  return w
}

export function pluralize(name: string, n: number): string {
  const raw = name.trim()
  if (Math.abs(n - 1) < 0.001) {
    const parts = raw.split(' ')
    parts[parts.length - 1] = singularize(parts[parts.length - 1]) || parts[parts.length - 1]
    return parts.join(' ')
  }
  const parts = raw.split(' ')
  const last = singularize(parts[parts.length - 1]) || parts[parts.length - 1]
  if (UNCOUNTABLE.has(parts.map((p, i) => (i === parts.length - 1 ? last : p)).join(' ')) || UNCOUNTABLE.has(last)) {
    parts[parts.length - 1] = last
    return parts.join(' ')
  }
  parts[parts.length - 1] = IRREG_PLUR[last] || (/[sxz]$|[cs]h$/.test(last) ? last + 'es' : /[^aeiou]y$/.test(last) ? last.slice(0, -1) + 'ies' : last + 's')
  return parts.join(' ')
}

export function normalizeName(s: string): string {
  let t = s.toLowerCase().replace(/[®©™]/g, '').replace(/\([^)]*\)/g, ' ')
  t = t.replace(PREP_TAIL, '')
  t = t.replace(/\s+/g, ' ').trim()
  t = t.replace(/^(?:of|the|and)\s+/, '')
  while (PREP_LEAD.test(t)) t = t.replace(PREP_LEAD, '')
  t = t.replace(PREP_END, '')
  t = t.replace(/\s+/g, ' ').trim()
  const words = t.split(' ').map((w, i, a) => (i === a.length - 1 ? singularize(w) : w))
  t = words.join(' ').trim()
  return ALIASES[t] || t
}

export interface ParsedIngredient {
  lo?: number
  hi?: number
  unit?: string
  dim?: Dim
  toBase?: number
  name: string
  key: string
  raw: string
}

const QTY_RE = new RegExp(`^\\s*(${NUM})(?:\\s*(?:-|–|to)\\s*(${NUM}))?\\s*`, 'i')

export function parseIngredient(line: string): ParsedIngredient {
  const raw = line.replace(/^▢\s*/, '').trim()
  let rest = raw
  let lo: number | undefined
  let hi: number | undefined
  const a = /^(?:a|an|one)\s+(?=pinch|dash|handful|splash|knob|clove)\b/i.exec(rest)
  if (a) {
    lo = hi = 1
    rest = rest.slice(a[0].length)
  } else {
    const m = QTY_RE.exec(rest)
    if (m && parseQty(m[1]) !== undefined) {
      lo = parseQty(m[1])
      hi = m[2] ? parseQty(m[2]) : lo
      if (hi === undefined) hi = lo
      rest = rest.slice(m[0].length)
    }
  }
  const u = findUnit(rest)
  let unit: string | undefined
  let dim: Dim | undefined
  let toBase: number | undefined
  if (u) {
    unit = u.def.out
    dim = u.def.dim
    toBase = u.def.toBase
    rest = u.rest
  } else if (lo !== undefined) {
    dim = 'count'
    toBase = 1
  }
  const key = normalizeName(rest) || normalizeName(raw) || raw.toLowerCase()
  const name = key
  return { lo, hi, unit, dim, toBase, name, key, raw }
}

const NICE = [0, 1 / 8, 1 / 4, 1 / 3, 3 / 8, 1 / 2, 5 / 8, 2 / 3, 3 / 4, 7 / 8, 1]

function isNice(n: number, slack = 0.04): boolean {
  if (!Number.isFinite(n) || n <= 0) return false
  const whole = Math.floor(n + 1e-9)
  const frac = n - whole
  return NICE.some((f) => Math.abs(frac - f) <= slack)
}

function almost(a: number, b: number, eps = 0.04) {
  return Math.abs(a - b) <= eps
}

function formatUnit(qty: number, unit: string): string {
  const u = qty === 1 || almost(qty, 1) ? unit : pluralize(unit, qty)
  // short units that don't take an s
  const invariable = new Set(['tsp', 'tbsp', 'g', 'kg', 'ml', 'oz', 'lb', 'fl oz', 'l'])
  const word = invariable.has(unit) ? unit : u
  return `${formatQty(qty)} ${word}`
}

function formatVolume(tsp: number, hint?: string): string {
  if (tsp <= 0) return formatUnit(0, 'tsp')
  const cups = tsp / 48
  const allowCup = hint === 'cup' || hint === 'pint' || hint === 'quart' || hint === 'ml' || hint === 'l' || hint === 'fl oz' || cups >= 0.49
  if (allowCup && cups >= 0.24 && isNice(cups, 0.03)) return formatUnit(cups, 'cup')
  const tbsp = tsp / 3
  const rem = tsp - Math.floor(tbsp + 1e-9) * 3
  if (tbsp >= 1 && rem > 0.2 && rem < 2.8 && almost(rem, Math.round(rem)) && almost(Math.floor(tbsp + 1e-9), Math.floor(tbsp))) {
    const whole = Math.floor(tbsp + 1e-9)
    return `${formatUnit(whole, 'tbsp')} + ${formatUnit(Math.round(rem * 8) / 8, 'tsp')}`
  }
  if (tbsp >= 1 && isNice(tbsp, 0.05)) return formatUnit(tbsp, 'tbsp')
  return formatUnit(tsp, 'tsp')
}

function formatWeight(g: number, imperial: boolean): string {
  if (imperial) {
    const lb = g / 453.59237
    if (lb >= 0.95 && isNice(lb, 0.03)) return formatUnit(lb, 'lb')
    const oz = g / 28.349523125
    if (oz >= 0.45) return formatUnit(Math.abs(oz - Math.round(oz)) < 0.08 ? Math.round(oz) : oz, 'oz')
  }
  if (g >= 950 && isNice(g / 1000, 0.03)) return formatUnit(g / 1000, 'kg')
  if (g >= 10) return `${Math.round(g)} g`
  return formatUnit(g, 'g')
}

function formatQtyDim(lo: number, hi: number, dim: Dim, unitHint?: string, imperial?: boolean): string {
  if (dim === 'vol') {
    if (almost(lo, hi)) return formatVolume(lo, unitHint)
    const a = formatVolume(lo, unitHint)
    const b = formatVolume(hi, unitHint)
    const unitOf = (s: string) => {
      const m = /\s([a-z].*)$/i.exec(s)
      return m ? m[1] : ''
    }
    const numOf = (s: string) => s.slice(0, s.length - (unitOf(s) ? unitOf(s).length + 1 : 0))
    if (unitOf(a) === unitOf(b) && unitOf(b)) return `${numOf(a)}–${b}`
    return `${a}–${b}`
  }
  if (dim === 'weight') {
    if (almost(lo, hi)) return formatWeight(lo, !!imperial)
    const b = formatWeight(hi, !!imperial)
    const a = formatWeight(lo, !!imperial)
    const unit = b.replace(/^[\d⅛⅜⅝⅞¼⅓½⅔¾⅕⅖⅗⅘⅙⅚. /]+/, '').trim()
    const aNum = a.replace(/ [a-z].*$/i, '')
    return `${aNum}–${b.startsWith(aNum) ? b : b}`
  }
  const out = unitHint || ''
  if (!out) {
    return almost(lo, hi) ? formatQty(lo) : `${formatQty(lo)}–${formatQty(hi)}`
  }
  if (almost(lo, hi)) return formatUnit(lo, out)
  return `${formatQty(lo)}–${formatUnit(hi, out)}`
}

interface Agg {
  dim: Dim
  lo: number
  hi: number
  unitHint?: string
  imperial: boolean
  metric: boolean
  texts: { rec: ShopRecipe; text: string }[]
}

function addTo(agg: Agg | undefined, bit: { lo: number; hi: number; dim: Dim; unit?: string; toBase: number; rec: ShopRecipe; text: string }): Agg {
  const lo = bit.lo * bit.toBase
  const hi = bit.hi * bit.toBase
  const imperial = bit.unit === 'oz' || bit.unit === 'lb'
  const metric = bit.unit === 'g' || bit.unit === 'kg'
  if (!agg) return { dim: bit.dim, lo, hi, unitHint: bit.unit, imperial, metric, texts: [{ rec: bit.rec, text: bit.text }] }
  agg.lo += lo
  agg.hi += hi
  if (imperial) agg.imperial = true
  if (metric) agg.metric = true
  if (bit.unit) agg.unitHint = bit.unit
  agg.texts.push({ rec: bit.rec, text: bit.text })
  return agg
}

function formatAgg(a: Agg, name: string, countNoun: boolean): string {
  if (a.dim === 'count' || countNoun) {
    const label = pluralize(name, almost(a.hi, a.lo) ? a.lo : a.hi)
    if (almost(a.lo, a.hi)) return `${formatQty(a.lo)} ${label}`
    return `${formatQty(a.lo)}–${formatQty(a.hi)} ${label}`
  }
  const preferImp = a.imperial && !a.metric
  const qty = formatQtyDim(a.lo, a.hi, a.dim, a.unitHint, preferImp)
  return `${qty} ${name}`.replace(/\s+/g, ' ').trim()
}

function mergeGroup(key: string, bits: { rec: ShopRecipe; text: string; parsed: ParsedIngredient }[]): ShopLine {
  const name = key
  const byDim = new Map<string, Agg>()
  const unqty: { rec: ShopRecipe; text: string }[] = []
  for (const b of bits) {
    const p = b.parsed
    if (p.lo === undefined || !p.dim || p.toBase === undefined) {
      unqty.push({ rec: b.rec, text: b.text })
      continue
    }
    const dim = p.dim
    byDim.set(dim, addTo(byDim.get(dim), { lo: p.lo, hi: p.hi ?? p.lo, dim, unit: p.unit, toBase: p.toBase, rec: b.rec, text: b.text }))
  }
  const parts: string[] = []
  const recipes: ShopShare[] = []
  const seen = new Set<string>()
  const pushRec = (id: string, title: string, text: string) => {
    const k = id + '|' + text
    if (seen.has(k)) return
    seen.add(k)
    const existing = recipes.find((r) => r.id === id)
    if (existing) existing.text += `, ${text}`
    else recipes.push({ id, title, text })
  }
  const dimOrder = ['count', 'vol', 'weight']
  const dims = [...byDim.keys()].sort((a, b) => {
    const ia = dimOrder.indexOf(a), ib = dimOrder.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b)
  })
  for (const d of dims) {
    const a = byDim.get(d)!
    parts.push(formatAgg(a, name, d === 'count'))
    for (const t of a.texts) pushRec(t.rec.id, t.rec.title, t.text)
  }
  for (const u of unqty) pushRec(u.rec.id, u.rec.title, u.text)

  let text: string
  if (parts.length === 0) text = bits[0] ? (normalizeName(bits[0].parsed.name) || bits[0].text) : name
  else if (parts.length === 1) text = parts[0]
  else {
    // "1 cup + 200 g flour" — name once at the end
    const stripped = parts.map((p) => (p.endsWith(name) ? p.slice(0, -name.length).trim() : p))
    text = `${stripped.join(' + ')} ${name}`.replace(/\s+/g, ' ').trim()
  }
  if (parts.length && unqty.length && !parts.some((p) => /salt|pepper|to taste/.test(p))) {
    // quantified + bare name: keep the quantified line (markers still list both)
  }
  return { key, text, recipes }
}

/** Build a merged shopping list from one or more (possibly scaled, possibly grouped) recipes. */
export function shoppingList(recipes: ShopRecipe[]): ShopLine[] {
  const bits: { rec: ShopRecipe; text: string; parsed: ParsedIngredient }[] = []
  const order: string[] = []
  const groups = new Map<string, typeof bits>()
  for (const rec of recipes) {
    for (const g of rec.ingredients) {
      for (const item of g.items) {
        const text = scaleIngredient(item, rec.factor || 1)
        const parsed = parseIngredient(text)
        const k = parsed.key || text.toLowerCase()
        parsed.key = k
        const bit = { rec, text, parsed }
        bits.push(bit)
        if (!groups.has(k)) { groups.set(k, []); order.push(k) }
        groups.get(k)!.push(bit)
      }
    }
  }
  return order.map((k) => mergeGroup(k, groups.get(k)!)).filter((l) => l.text)
}

export function shopFactor(servings: number | undefined, base?: number): number {
  if (!servings || servings <= 0) return 1
  return base && base > 0 ? servings / base : servings
}

export function initials(title: string): string {
  const words = title.replace(/[^A-Za-z0-9\s]/g, ' ').trim().split(/\s+/).filter((w) => w && !/^(the|a|an|and|of|for)$/i.test(w))
  if (!words.length) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export function listAsText(recipes: ShopRecipe[], lines: ShopLine[]): string {
  const heads = recipes.map((r) => {
    const scale = r.baseServings && r.servings ? `${r.servings} serv.` : r.factor && r.factor !== 1 ? `×${formatQty(r.factor)}` : ''
    return scale ? `${r.title} (${scale})` : r.title
  })
  const out = ['SHOPPING LIST', heads.join(', '), '']
  for (const l of lines) {
    const who = l.recipes.map((r) => r.title).join(', ')
    out.push(`• ${l.text}  (${who})`)
  }
  return out.join('\n')
}
