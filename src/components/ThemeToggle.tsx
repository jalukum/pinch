import { useEffect, useState } from 'react'

type Mode = 'auto' | 'light' | 'dark'
const KEY = 'pinch.theme'
const NEXT: Record<Mode, Mode> = { auto: 'light', light: 'dark', dark: 'auto' }
const LABEL: Record<Mode, string> = { auto: 'Auto', light: 'Day', dark: 'Night' }

/** A little rubber stamp in the masthead: Auto (half sun/half moon) → Day (sun) → Night (moon). */
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>(() => (document.documentElement.getAttribute('data-theme-mode') as Mode) || 'auto')
  useEffect(() => {
    try {
      if (mode === 'auto') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, mode)
    } catch {
      /* private mode: still applies for this visit */
      document.documentElement.setAttribute('data-theme', mode === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode)
    }
    ;(window as any).__pinchTheme?.()
  }, [mode])
  return (
    <button
      className={`theme-stamp is-${mode}`}
      onClick={() => setMode((m) => NEXT[m])}
      aria-label={`Theme: ${LABEL[mode]}. Tap to change.`}
      title="Day, night or automatic"
    >
      <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {mode === 'light' && (
          <>
            <path d="M16.2 10.6c3 0 5.4 2.4 5.3 5.4-.1 2.9-2.5 5.3-5.4 5.2-2.9 0-5.2-2.4-5.2-5.3 0-2.9 2.3-5.3 5.3-5.3z" />
            <path d="M16 3.8v3M16.1 25.3v3M3.9 16.1h3M25.2 16h3M7.3 7.2l2.1 2.1M22.6 22.6l2.1 2.1M7.4 24.8l2-2M22.6 9.5l2.1-2.2" />
          </>
        )}
        {mode === 'dark' && (
          <>
            <path d="M20.6 6.3c-1 1.3-1.6 3-1.6 4.8 0 4.4 3.5 8 7.9 8.1-1.4 3.6-4.9 6.1-9 6-5.3-.1-9.6-4.5-9.5-9.8.1-4.6 3.4-8.4 7.8-9.3 1.5-.3 3-.2 4.4.2z" />
            <path d="M24.4 5.2l.5 1.4 1.4.4-1.3.6-.4 1.4-.6-1.3-1.4-.4 1.3-.6zM27 11.6l.3.8.8.3-.8.3-.3.8-.3-.8-.8-.3.8-.3z" />
          </>
        )}
        {mode === 'auto' && (
          <>
            <path d="M16.1 8.4c4.2 0 7.6 3.4 7.5 7.6-.1 4.1-3.5 7.5-7.6 7.4-4.1 0-7.4-3.4-7.4-7.5 0-4.1 3.3-7.5 7.5-7.5z" />
            <path d="M16 8.5c-.2 5 .1 10-.1 14.9" />
            <path d="M16 8.6c2.3 1.4 3.6 4.1 3.4 7.2-.2 3.1-1.6 5.6-3.4 7.5" />
            <path d="M16 3.6v2.4M7.1 7.3l1.6 1.7M3.8 16h2.4M7.2 24.8l1.6-1.6" />
          </>
        )}
      </svg>
      <span>{LABEL[mode]}</span>
    </button>
  )
}
