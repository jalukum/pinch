/**
 * Sites that probably won't open through a link, and why. Based on real tests (Nov 2026) plus
 * publishers known to sit behind logins or paywalls. "Probably" on purpose: some days they work.
 *
 * With Jaluku's own Cloudflare Worker, most big food sites open fine (live or via a Wayback
 * snapshot). This list is for the ones that still need Paste-the-text / Write-by-hand.
 */
export interface Fussy {
  name: string
  match: RegExp
  why: string
}

export const FUSSY: Fussy[] = [
  { name: 'NYT Cooking', match: /(^|\.)cooking\.nytimes\.com$/, why: 'many recipes sit behind a subscriber wall (free ones usually work)' },
  { name: 'America’s Test Kitchen, Cook’s Illustrated, Cook’s Country', match: /(^|\.)(americastestkitchen|cooksillustrated|cookscountry)\.com$/, why: 'members-only pages' },
  { name: 'Milk Street', match: /(^|\.)177milkstreet\.com$/, why: 'members-only pages' },
  { name: 'Bon Appétit', match: /(^|\.)bonappetit\.com$/, why: 'sometimes paywalled; the free ones usually work' },
  { name: 'YouTube videos', match: /(^|\.)(youtube\.com|youtu\.be)$/, why: 'YouTube doesn’t share captions or sound with apps, so Pinch reads the description and any recipe link in it. If the recipe is only spoken, upload the video' },
  { name: 'Instagram reels', match: /(^|\.)(instagram\.com|instagr\.am)$/, why: 'the caption is read, but reel sound sits behind a login. If the recipe is only spoken, upload the video' },
  { name: 'Facebook & Pinterest posts', match: /(^|\.)(facebook\.com|fb\.watch|pinterest\.[a-z.]+|pin\.it)$/, why: 'the recipe is in a post behind a login, not on a page' },
]

export function fussyFor(url: string): Fussy | undefined {
  try {
    const h = new URL(url).hostname.toLowerCase()
    return FUSSY.find((f) => f.match.test(h))
  } catch {
    return undefined
  }
}
