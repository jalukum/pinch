import type { Recipe } from './types'

const DB = 'pinch'
const STORE = 'recipes'
let dbp: Promise<IDBDatabase> | undefined

function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1)
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' })
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
  }
  return dbp
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((res, rej) => {
        const t = d.transaction(STORE, mode)
        const req = fn(t.objectStore(STORE))
        t.oncomplete = () => res(req ? (req as IDBRequest<T>).result : (undefined as T))
        t.onerror = () => rej(t.error)
        t.onabort = () => rej(t.error)
      }),
  )
}

export const store = {
  all: async (): Promise<Recipe[]> => {
    const list = await tx<Recipe[]>('readonly', (s) => s.getAll())
    return list.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))
  },
  put: (r: Recipe) => tx('readwrite', (s) => s.put(r)),
  remove: (id: string) => tx('readwrite', (s) => s.delete(id)),
  get: (id: string) => tx<Recipe | undefined>('readonly', (s) => s.get(id)),
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
  version: 1
  exportedAt: string
  recipes: Recipe[]
}

export function validateBackup(data: any): Recipe[] {
  const list = Array.isArray(data) ? data : data?.recipes
  if (!Array.isArray(list)) throw new Error('That file doesn’t look like a Pinch backup.')
  return list
    .filter((r) => r && typeof r.title === 'string' && Array.isArray(r.ingredients) && Array.isArray(r.instructions))
    .map((r) => ({ notes: [], tags: [], siteName: '', url: '', ...r, id: String(r.id || newId()) }))
}
