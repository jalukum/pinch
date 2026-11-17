import { describe, expect, it } from 'vitest'
import { videoPlatform, tidyTitle, toParsed } from '../video'
// @ts-ignore plain JS worker module
import { groundIngredients, recipeLinksFrom, youtubeId, videoPlatform as relayPlatform } from '../../../proxy/video.js'

describe('video links', () => {
  it('spots video links and leaves recipe pages alone', () => {
    expect(videoPlatform('https://www.youtube.com/watch?v=pn1gFPMRCO4')).toBe('youtube')
    expect(videoPlatform('https://youtube.com/shorts/vJNjTo-xWr8?si=x')).toBe('youtube')
    expect(videoPlatform('https://youtu.be/pn1gFPMRCO4')).toBe('youtube')
    expect(videoPlatform('https://www.tiktok.com/@a/video/123')).toBe('tiktok')
    expect(videoPlatform('https://vm.tiktok.com/ZMabc/')).toBe('tiktok')
    expect(videoPlatform('https://www.instagram.com/reel/DIezgZHPjZ4/')).toBe('instagram')
    expect(videoPlatform('https://www.instagram.com/someone/')).toBeNull()
    expect(videoPlatform('https://www.youtube.com/@preppykitchen')).toBeNull()
    expect(videoPlatform('https://www.recipetineats.com/chicken-chow-mein/')).toBeNull()
    expect(relayPlatform('https://m.youtube.com/watch?v=x')).toBe('youtube')
    expect(youtubeId('https://www.youtube.com/shorts/vJNjTo-xWr8')).toBe('vJNjTo-xWr8')
  })
  it('tidies titles', () => {
    expect(tidyTitle('LAZY PASTA 🍝 #pastatok #fyp')).toBe('LAZY PASTA')
    expect(tidyTitle('Easy Fluffy Pancakes #shorts')).toBe('Easy Fluffy Pancakes')
  })
  it('picks recipe links out of a description', () => {
    expect(recipeLinksFrom(['https://www.amazon.com/dp/1', 'https://preppykitchen.com/buttermilk-pancakes/', 'https://instagram.com/x'])).toEqual(['https://preppykitchen.com/buttermilk-pancakes/'])
  })
  it('drops ingredients that were never said or written', () => {
    const kept = groundIngredients([{ text: '2 cups flour' }, { text: '1 tsp vanilla extract' }, { text: 'saffron threads' }], 'add two cups of flour and a splash of vanilla')
    expect(kept.map((k: any) => k.text)).toEqual(['2 cups flour', '1 tsp vanilla extract'])
  })
  it('turns a structured answer into a card and flags unsaid amounts gently', () => {
    const r = toParsed(
      { is_recipe: true, title: 'Alfredo #pasta', servings: '2', ingredients: [{ text: '100 g butter' }, { text: 'parmesan', uncertain: true }, { text: 'salt, to taste' }], steps: ['Melt the butter'], notes: [] },
      { url: 'https://www.tiktok.com/@a/video/1', siteName: 'A · TikTok', heard: true },
    )
    expect(r.title).toBe('Alfredo')
    expect(r.ingredients[0].items).toEqual(['100 g butter', 'parmesan', 'salt, to taste'])
    expect(r.servings).toBe(2)
    expect(r.extractedVia).toBe('video')
    expect(r.notes.at(-1)).toMatch(/didn’t say exact amounts for: parmesan\./)
  })
})
