import type { IngredientGroup, Recipe, StepGroup } from './types'
import { parseYield } from './parse'

/** Groups → editable text. A group title is written as "## Title". */
export function groupsToText(groups: { title?: string; items?: string[]; steps?: string[] }[]): string {
  return groups
    .map((g) => [g.title ? `## ${g.title}` : '', ...(g.items ?? g.steps ?? [])].filter(Boolean).join('\n'))
    .join('\n\n')
}

function textToGroups(text: string): { title?: string; lines: string[] }[] {
  const out: { title?: string; lines: string[] }[] = [{ lines: [] }]
  for (const raw of text.split('\n')) {
    const l = raw.trim()
    if (!l) continue
    const head = /^#{1,3}\s*(.+)$/.exec(l) || (/^(?:for the .+|[A-Z][\w ’'&-]{1,30}):$/i.exec(l) ? [l, l.replace(/:$/, '')] : null)
    if (head) {
      out.push({ title: head[1].trim(), lines: [] })
      continue
    }
    out[out.length - 1].lines.push(l.replace(/^(?:[-*•▢]|\d+[.)])\s+/, ''))
  }
  return out.filter((g) => g.lines.length)
}

export const textToIngredients = (t: string): IngredientGroup[] => textToGroups(t).map((g) => ({ title: g.title, items: g.lines }))
export const textToSteps = (t: string): StepGroup[] => textToGroups(t).map((g) => ({ title: g.title, steps: g.lines }))

/** "1 hr 10 min", "70", "1:10" → minutes */
export function minutesFrom(s: string): number | undefined {
  const t = s.trim().toLowerCase()
  if (!t) return undefined
  if (/^\d+$/.test(t)) return +t
  const c = /^(\d+):(\d{2})$/.exec(t)
  if (c) return +c[1] * 60 + +c[2]
  const h = /(\d+(?:\.\d+)?)\s*h/.exec(t)
  const m = /(\d+)\s*m/.exec(t)
  const v = (h ? parseFloat(h[1]) * 60 : 0) + (m ? +m[1] : 0)
  return v || undefined
}

export interface EditFields {
  title: string
  image: string
  prep: string
  cook: string
  makes: string
  ingredients: string
  steps: string
  notes: string
}

const mins = (n?: number) => (n ? (n >= 60 ? `${Math.floor(n / 60)} hr${n % 60 ? ` ${n % 60} min` : ''}` : `${n} min`) : '')

export function toFields(r: Recipe): EditFields {
  return {
    title: r.title === 'Untitled recipe' ? '' : r.title,
    image: r.image && !r.image.startsWith('data:') ? r.image : '',
    prep: mins(r.prepTime),
    cook: mins(r.cookTime),
    makes: r.yieldText || '',
    ingredients: groupsToText(r.ingredients),
    steps: groupsToText(r.instructions),
    notes: r.notes.join('\n'),
  }
}

export function fromFields(r: Recipe, f: EditFields): Recipe {
  const prepTime = minutesFrom(f.prep)
  const cookTime = minutesFrom(f.cook)
  const y = parseYield(f.makes.trim() || undefined)
  const image = f.image.trim() || undefined
  const keepTotal = r.prepTime === prepTime && r.cookTime === cookTime
  return {
    ...r,
    title: f.title.trim() || 'Untitled recipe',
    image,
    imageData: image === r.image ? r.imageData : undefined,
    prepTime,
    cookTime,
    totalTime: keepTotal && r.totalTime ? r.totalTime : prepTime || cookTime ? (prepTime ?? 0) + (cookTime ?? 0) : undefined,
    yieldText: y.text,
    servings: y.servings,
    ingredients: textToIngredients(f.ingredients),
    instructions: textToSteps(f.steps),
    notes: f.notes.split('\n').map((x) => x.trim()).filter(Boolean),
    siteName: r.siteName || 'by hand',
    extractedVia: r.extractedVia === 'page' || !r.extractedVia ? 'manual' : r.extractedVia,
  }
}

export function blankRecipe(id: string, url = ''): Recipe {
  let siteName = 'by hand'
  try {
    if (url) siteName = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    /* ignore */
  }
  return { id, title: '', url, siteName, ingredients: [], instructions: [], notes: [], tags: [], extractedVia: 'manual' }
}
