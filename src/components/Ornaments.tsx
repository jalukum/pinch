/* Decorative hand-drawn pieces: SVG filters, stamps, dividers, illustrations. */

export function SvgDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        {/* gently roughen strokes/edges so stamps look inked, not vector-perfect */}
        <filter id="ink" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.2" xChannelSelector="R" yChannelSelector="G" result="d" />
          <feTurbulence type="fractalNoise" baseFrequency="0.35" numOctaves="3" seed="8" result="spots" />
          <feColorMatrix in="spots" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 1.75" result="mask" />
          <feComposite in="d" in2="mask" operator="in" />
        </filter>
        <filter id="wobble">
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="1" seed="2" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" />
        </filter>
      </defs>
    </svg>
  )
}

/** A rubber-stamp impression with rough ink. */
export function Stamp({ text, sub, tone = 'terracotta', rotate = -7, size = 'md' }: { text: string; sub?: string; tone?: 'terracotta' | 'olive' | 'ink'; rotate?: number; size?: 'sm' | 'md' }) {
  const w = size === 'sm' ? 112 : 150
  const h = size === 'sm' ? 46 : 60
  return (
    <svg className={`stamp stamp--${tone}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ transform: `rotate(${rotate}deg)` }} role="img" aria-label={text}>
      <g filter="url(#ink)">
        <rect x="3" y="3" width={w - 6} height={h - 6} rx="5" fill="none" stroke="currentColor" strokeWidth="2.6" />
        <rect x="7.5" y="7.5" width={w - 15} height={h - 15} rx="3" fill="none" stroke="currentColor" strokeWidth="1" />
        <text x={w / 2} y={sub ? h / 2 + 2 : h / 2 + 6} textAnchor="middle" fill="currentColor" className="stamp__text" fontSize={size === 'sm' ? 17 : 22}>{text}</text>
        {sub && <text x={w / 2} y={h / 2 + 15} textAnchor="middle" fill="currentColor" className="stamp__sub" fontSize="8.5">{sub}</text>}
      </g>
    </svg>
  )
}

export function Divider() {
  return (
    <div className="divider" aria-hidden>
      <svg viewBox="0 0 300 24" preserveAspectRatio="none" className="divider__line">
        <path d="M2 13c22-1.6 44 .9 66-.4 20-1.1 38-.2 58-.6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M174 12.4c22 .7 40-.8 62 .3 21 .9 41-.6 62 .4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <g transform="translate(136 1)" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 11.5c9-.3 19 .2 26 0" />
          <path d="M8 11.3c-2.4-2.6-2.2-5.7.4-7.6 1.6 2.6 1.4 5.4-.4 7.6z" />
          <path d="M14.4 11.3c-1.4-3.4-.6-6.6 2.2-8.2 1 3.2.2 6.2-2.2 8.2z" />
          <path d="M8.4 11.6c-2.2 2.4-2 5.4.4 7.4 1.6-2.4 1.4-5.2-.4-7.4z" />
          <path d="M14.6 11.7c-1.2 3.2-.4 6.2 2.2 7.8 1-3 .2-5.8-2.2-7.8z" />
          <path d="M21 11.4c-.6-2.6.6-4.8 3-5.6.4 2.6-.8 4.6-3 5.6z" />
          <path d="M21 11.8c-.6 2.4.6 4.4 3 5.4.4-2.4-.8-4.4-3-5.4z" />
        </g>
      </svg>
    </div>
  )
}

/** Empty-state illustration: wooden spoon & whisk crossed, with a sprig. */
export function EmptyArt() {
  return (
    <svg className="empty-art" viewBox="0 0 220 150" aria-hidden filter="url(#wobble)">
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* spoon */}
        <path className="wood" d="M60 28c13-6 30 2 32 16 2 13-9 22-21 21-12-1-20-11-19-21 .4-6 3-12 8-16z" />
        <path d="M86 58c14 18 33 44 58 76 3 4 9 1 7-3-19-34-37-60-52-80" />
        <path d="M66 36c-4 4-5 10-3 15" opacity=".5" />
        {/* whisk */}
        <path d="M150 20c-14 2-22 20-18 36 2 8 8 12 13 12s11-5 12-13c3-16-1-33-7-35z" />
        <path d="M151 20c-3 12-4 30-4 48" />
        <path d="M140 27c1 13 3 27 7 41" />
        <path d="M160 26c-2 14-6 28-11 42" />
        <path d="M147 68c-4 18-12 40-22 64-1 4 4 6 6 3 11-22 19-44 22-66" />
        {/* sprig */}
        <path d="M24 138c14-14 26-22 42-28" />
        <path d="M36 128c-6-3-8-9-6-14 6 2 8 8 6 14zM46 121c-4-4-5-10-2-14 5 3 6 9 2 14zM56 115c-3-5-2-10 2-13 3 4 2 10-2 13z" />
        <path d="M37 128c3 5 9 6 13 3-3-5-9-6-13-3zM47 121c3 4 9 5 13 2-3-4-9-5-13-2z" />
      </g>
    </svg>
  )
}

/** Washi tape strip */
export function Tape({ className = '', tone = 'mustard' }: { className?: string; tone?: 'mustard' | 'sage' | 'rose' }) {
  return <span className={`tape tape--${tone} ${className}`} aria-hidden />
}
