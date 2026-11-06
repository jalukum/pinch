const UNI: Record<string, number> = {
  '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4, '⅕': 1 / 5, '⅖': 2 / 5, '⅗': 3 / 5,
  '⅘': 4 / 5, '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8,
}
const UNI_CHARS = Object.keys(UNI).join('')

const NUM = `(?:\\d+\\s+\\d+\\s*[/⁄]\\s*\\d+|\\d+\\s*[${UNI_CHARS}]|\\d+\\s*[/⁄]\\s*\\d+|\\d*\\.\\d+|\\d+|[${UNI_CHARS}])`
const LEAD = new RegExp(`^(\\s*)(${NUM})(\\s*(?:-|–|to)\\s*(${NUM}))?`)

export function parseQty(s: string): number | undefined {
  const t = s.trim()
  let m = /^(\d+)\s+(\d+)\s*[/⁄]\s*(\d+)$/.exec(t)
  if (m) return +m[1] + +m[2] / +m[3]
  m = new RegExp(`^(\\d+)\\s*([${UNI_CHARS}])$`).exec(t)
  if (m) return +m[1] + UNI[m[2]]
  m = /^(\d+)\s*[/⁄]\s*(\d+)$/.exec(t)
  if (m) return +m[2] ? +m[1] / +m[2] : undefined
  if (UNI[t] !== undefined) return UNI[t]
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : undefined
}

const FRACS: [number, string][] = [
  [0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'], [5 / 8, '⅝'],
  [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'], [1, ''],
]

export function formatQty(n: number): string {
  if (n >= 20) return String(Math.round(n))
  let whole = Math.floor(n)
  const frac = n - whole
  let best = FRACS[0]
  for (const f of FRACS) if (Math.abs(f[0] - frac) < Math.abs(best[0] - frac)) best = f
  if (Math.abs(best[0] - frac) > 0.07 && n < 10) {
    return String(Math.round(n * 10) / 10)
  }
  if (best[0] === 1) whole += 1
  const fs = best[0] === 1 ? '' : best[1]
  if (!whole && !fs) return String(Math.round(n * 100) / 100)
  return `${whole || ''}${fs}`
}

/** Scale the leading quantity (or range) of an ingredient line. */
export function scaleIngredient(line: string, factor: number): string {
  if (factor === 1) return line
  const m = LEAD.exec(line)
  if (!m) return line
  const a = parseQty(m[2])
  if (a === undefined) return line
  let out = m[1] + formatQty(a * factor)
  if (m[3] && m[4]) {
    const b = parseQty(m[4])
    if (b !== undefined) out += '–' + formatQty(b * factor)
  }
  return out + line.slice(m[0].length)
}
