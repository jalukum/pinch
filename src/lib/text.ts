const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', deg: '°', frac12: '½',
  frac14: '¼', frac34: '¾', frac13: '⅓', frac23: '⅔', frac18: '⅛', times: '×', eacute: 'é',
  egrave: 'è', ecirc: 'ê', agrave: 'à', aacute: 'á', ccedil: 'ç', ntilde: 'ñ', ouml: 'ö',
  uuml: 'ü', auml: 'ä', iuml: 'ï', ocirc: 'ô', icirc: 'î', reg: '®', trade: '™', copy: '©',
  frasl: '⁄', minus: '−', shy: '', zwj: '', zwnj: '', thinsp: ' ', ensp: ' ', emsp: ' ',
  bull: '•', middot: '·', laquo: '«', raquo: '»', szlig: 'ß', oslash: 'ø', aring: 'å',
}

/** Decode HTML entities (named + numeric). Runs twice to undo double-encoding like &amp;#39; */
export function decodeEntities(input: string): string {
  let s = input
  for (let i = 0; i < 2; i++) {
    const next = s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, (m, ent: string) => {
      if (ent[0] === '#') {
        const code = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10)
        if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return m
        try { return String.fromCodePoint(code) } catch { return m }
      }
      const v = NAMED[ent.toLowerCase()]
      return v !== undefined ? v : m
    })
    if (next === s) break
    s = next
  }
  return s
}

/** Strip tags, decode entities, collapse whitespace. */
export function clean(input: unknown): string {
  if (input == null) return ''
  let s = String(input)
  s = s.replace(/<br\s*\/?>/gi, ' ').replace(/<\/(p|li|div)>/gi, ' ')
  s = s.replace(/<[^>]*>/g, '')
  s = decodeEntities(s)
  s = s.replace(/<[^>]*>/g, '') // tags that were entity-encoded
  return s.replace(/[\u200b\u00ad]/g, '').replace(/\s+/g, ' ').trim()
}

/** Split a block of HTML/text into paragraphs/lines (used when instructions are one big string). */
export function splitBlock(input: string): string[] {
  const s = decodeEntities(String(input))
  const parts = s
    .replace(/<\/(p|li|div|h\d)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .split(/\n+|\r+/)
    .map((x) => clean(x))
    .filter(Boolean)
  return parts
}

export function hostLabel(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\.|^m\./, '')
    return h
  } catch {
    return ''
  }
}

export function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr))
}

/** Fix the punctuation debris recipe plugins leave when they glue amount/unit/name/notes together. */
export function tidyIngredient(s: string): string {
  return s
    .replace(/\(\s*\(/g, '(').replace(/\)\s*\)/g, ')')
    .replace(/\(\s*[,;]\s*/g, '(')
    .replace(/\s+([,;)])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** "1. Preheat… 2. Meanwhile… 3. Add…" crammed into one step → separate steps. */
export function splitNumberedStep(s: string): string[] {
  const re = /(?:^|\s)(\d{1,2})[.)]\s+(?=[A-Z])/g
  const hits: { n: number; at: number; len: number }[] = []
  for (let m; (m = re.exec(s)); ) hits.push({ n: Number(m[1]), at: m.index, len: m[0].length })
  // need a run 1,2,(3…) or k,k+1 in order to trust it
  const seq = hits.filter((h, i) => (i > 0 && h.n === hits[i - 1].n + 1) || (hits[i + 1] && hits[i + 1].n === h.n + 1))
  if (seq.length < 2) return [s]
  const out: string[] = []
  const head = s.slice(0, seq[0].at).trim()
  if (head) out.push(head)
  seq.forEach((h, i) => out.push(s.slice(h.at + h.len, seq[i + 1]?.at ?? s.length).trim()))
  return out.filter(Boolean)
}
