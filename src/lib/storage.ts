import type { Recipe } from './types'
import { isFolderIcon } from './folder-icons'

const DB = 'pinch'
const DB_VER = 2
const RECIPES = 'recipes'
const COLLECTIONS = 'collections'
let dbp: Promise<IDBDatabase> | undefined

export interface Collection {
  id: string
  name: string
  createdAt: number
  recipeIds: string[]
  icon?: string
}

function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, DB_VER)
      r.onupgradeneeded = () => {
        const d = r.result
        if (!d.objectStoreNames.contains(RECIPES)) d.createObjectStore(RECIPES, { keyPath: 'id' })
        if (!d.objectStoreNames.contains(COLLECTIONS)) d.createObjectStore(COLLECTIONS, { keyPath: 'id' })
      }
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
  }
  return dbp
}

function tx<T>(storeName: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((res, rej) => {
        const t = d.transaction(storeName, mode)
        const req = fn(t.objectStore(storeName))
        t.oncomplete = () => res(req ? (req as IDBRequest<T>).result : (undefined as T))
        t.onerror = () => rej(t.error)
        t.onabort = () => rej(t.error)
      }),
  )
}

export const store = {
  all: async (): Promise<Recipe[]> => {
    const list = await tx<Recipe[]>(RECIPES, 'readonly', (s) => s.getAll())
    return list.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))
  },
  put: (r: Recipe) => tx(RECIPES, 'readwrite', (s) => s.put(r)),
  remove: (id: string) => tx(RECIPES, 'readwrite', (s) => s.delete(id)),
  get: (id: string) => tx<Recipe | undefined>(RECIPES, 'readonly', (s) => s.get(id)),
}

export const collectionStore = {
  all: async (): Promise<Collection[]> => {
    const list = await tx<Collection[]>(COLLECTIONS, 'readonly', (s) => s.getAll())
    return list.sort((a, b) => a.createdAt - b.createdAt)
  },
  put: (c: Collection) => tx(COLLECTIONS, 'readwrite', (s) => s.put(c)),
  remove: (id: string) => tx(COLLECTIONS, 'readwrite', (s) => s.delete(id)),
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist()
  } catch {
    /* ignore */
  }
}

export interface Backup {
  app: 'pinch'
  version: 1 | 2
  exportedAt: string
  recipes: Recipe[]
  collections?: Collection[]
}

export function validateBackup(data: any): Recipe[] {
  const list = Array.isArray(data) ? data : data?.recipes
  if (!Array.isArray(list)) throw new Error('That file doesn’t look like a Pinch backup.')
  return list
    .filter((r) => r && typeof r.title === 'string' && Array.isArray(r.ingredients) && Array.isArray(r.instructions))
    .map((r) => ({ notes: [], tags: [], siteName: '', url: '', ...r, id: String(r.id || newId()) }))
}

export function collectionsFromBackup(data: any): Collection[] {
  const list = data?.collections
  if (!Array.isArray(list)) return []
  return list
    .filter((c) => c && typeof c.name === 'string' && Array.isArray(c.recipeIds))
    .map((c) => ({
      id: String(c.id || newId()),
      name: String(c.name).trim() || 'Untitled',
      createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now(),
      recipeIds: c.recipeIds.map(String).filter(Boolean),
      icon: isFolderIcon(c.icon) ? c.icon : undefined,
    }))
}

const SHOP_KEY = 'pinch.shop'

export interface ShopEntry {
  id: string
  servings: number
}

export interface ShopState {
  entries: ShopEntry[]
  checks: Record<string, boolean>
}

export function loadShop(): ShopState {
  try {
    const s = JSON.parse(localStorage.getItem(SHOP_KEY) || 'null')
    if (s && Array.isArray(s.entries)) return { entries: s.entries, checks: s.checks && typeof s.checks === 'object' ? s.checks : {} }
  } catch {
    /* ignore */
  }
  return { entries: [], checks: {} }
}

export function saveShop(state: ShopState) {
  try {
    if (!state.entries.length) localStorage.removeItem(SHOP_KEY)
    else localStorage.setItem(SHOP_KEY, JSON.stringify(state))
  } catch {
    /* quota */
  }
}
