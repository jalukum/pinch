import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { extractRecipe, PROXIES } from './lib/fetcher'
import { parseRecipeHtml } from './lib/parse'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Small hook for debugging/testing from the console.
;(window as any).__pinch = { extractRecipe, parseRecipeHtml, PROXIES }

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
