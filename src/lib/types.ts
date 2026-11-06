export interface IngredientGroup {
  title?: string
  items: string[]
}

export interface StepGroup {
  title?: string
  steps: string[]
}

export interface Recipe {
  id: string
  title: string
  description?: string
  url: string
  siteName: string
  author?: string
  image?: string // remote url
  imageData?: string // cached data: URL for offline
  prepTime?: number // minutes
  cookTime?: number
  totalTime?: number
  yieldText?: string
  servings?: number
  ingredients: IngredientGroup[]
  instructions: StepGroup[]
  notes: string[]
  tags: string[]
  savedAt?: number
  extractedVia?: 'json-ld' | 'microdata' | 'rdfa' | 'plugin' | 'next-data' | 'heuristic' | 'markdown' | 'text' | 'page' | 'manual'
}

export type ParsedRecipe = Omit<Recipe, 'id' | 'savedAt' | 'imageData'>
