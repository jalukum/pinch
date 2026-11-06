/**
 * Sites that probably won't open through a link, and why. Based on real tests (Nov 2026) plus
 * publishers known to sit behind logins or paywalls. "Probably" on purpose: some days they work.
 */
export interface Fussy {
  name: string
  match: RegExp
  why: string
}

export const FUSSY: Fussy[] = [
  { name: 'NYT Cooking', match: /(^|\.)cooking\.nytimes\.com$/, why: 'many recipes sit behind a subscriber wall' },
  { name: 'America’s Test Kitchen, Cook’s Illustrated, Cook’s Country', match: /(^|\.)(americastestkitchen|cooksillustrated|cookscountry)\.com$/, why: 'members-only pages' },
  { name: 'Milk Street', match: /(^|\.)177milkstreet\.com$/, why: 'members-only pages' },
  { name: 'Bon Appétit & Epicurious', match: /(^|\.)(bonappetit|epicurious)\.com$/, why: 'sometimes paywalled; the free ones usually work' },
  { name: 'Allrecipes, Serious Eats, Simply Recipes & other People Inc sites', match: /(^|\.)(allrecipes|seriouseats|simplyrecipes|eatingwell|foodandwine|thespruceeats|marthastewart|bhg|southernliving|myrecipes|realsimple)\.com$/, why: 'the publisher turns away reading apps, so the card usually comes from a saved archive copy and takes 8–10 seconds' },
  { name: 'Instagram, TikTok, Facebook & Pinterest posts', match: /(^|\.)(instagram\.com|tiktok\.com|facebook\.com|fb\.watch|pinterest\.[a-z.]+|pin\.it)$/, why: 'the recipe is in a caption or video behind a login, not on a page' },
  { name: 'YouTube videos', match: /(^|\.)(youtube\.com|youtu\.be)$/, why: 'the recipe is spoken, not written down' },
]

export function fussyFor(url: string): Fussy | undefined {
  try {
    const h = new URL(url).hostname.toLowerCase()
    return FUSSY.find((f) => f.match.test(h))
  } catch {
    return undefined
  }
}
