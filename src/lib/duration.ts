/**
 * Parse an ISO 8601 duration (PT1H30M, P0DT0H45M, PT90M, P1D, PT1H30M0.000S) or loose text
 * ("1 hour 30 mins", "45 minutes", "1h 20m") into whole minutes. Returns undefined if unparseable/zero.
 */
export function parseDuration(input: unknown): number | undefined {
  if (input == null) return undefined
  if (typeof input === 'number') return input > 0 ? Math.round(input) : undefined
  if (Array.isArray(input)) return parseDuration(input[0])
  if (typeof input === 'object') {
    const o = input as Record<string, unknown>
    return parseDuration(o['@value'] ?? o.value ?? o.text)
  }
  const s = String(input).trim()
  if (!s) return undefined
  const iso = /^-?P(?:(\d+(?:[.,]\d+)?)Y)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)W)?(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/i.exec(s)
  if (iso) {
    const n = (i: number) => (iso[i] ? parseFloat(iso[i].replace(',', '.')) : 0)
    const mins = n(4) * 1440 + n(3) * 10080 + n(5) * 60 + n(6) + n(7) / 60
    // years/months in recipe durations are almost always a bug; ignore them
    return mins > 0 ? Math.max(1, Math.round(mins)) : undefined
  }
  // loose text
  let total = 0
  let matched = false
  const re = /(\d+(?:[.,]\d+)?)\s*(days?|d\b|hours?|hrs?|h\b|minutes?|mins?|m\b)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    matched = true
    const v = parseFloat(m[1].replace(',', '.'))
    const u = m[2].toLowerCase()
    if (u.startsWith('d')) total += v * 1440
    else if (u.startsWith('h')) total += v * 60
    else total += v
  }
  if (!matched && /^\d+$/.test(s)) total = parseInt(s, 10)
  return total > 0 ? Math.round(total) : undefined
}

export function formatMinutes(mins?: number): string {
  if (!mins) return ''
  if (mins < 60) return `${mins} min`
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  const parts: string[] = []
  if (d) parts.push(`${d} d`)
  if (h) parts.push(`${h} hr`)
  if (m) parts.push(`${m} min`)
  return parts.join(' ')
}
