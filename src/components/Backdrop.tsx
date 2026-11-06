import { memo } from 'react'

/*
 * The kitchen surface behind everything: faint hand-drawn ingredients, flourishes and stains.
 * Light theme reads as ink sketches on parchment; dark theme as chalk on a wooden board
 * (with knife scores and flour dust). One fixed SVG, no filters, so it costs almost nothing.
 */

function sprig(x: number, y: number, len: number, angle: number, leaves = 9) {
  const parts: string[] = []
  const rad = (angle * Math.PI) / 180
  const dx = Math.cos(rad), dy = Math.sin(rad)
  const nx = -dy, ny = dx
  const bend = len * 0.12
  parts.push(`M${x},${y} q${dx * len * 0.5 + nx * bend},${dy * len * 0.5 + ny * bend} ${dx * len},${dy * len}`)
  for (let i = 1; i <= leaves; i++) {
    const t = i / (leaves + 1)
    const b = 4 * t * (1 - t) * bend * 0.5
    const px = x + dx * len * t + nx * b, py = y + dy * len * t + ny * b
    const side = i % 2 ? 1 : -1
    const l = 15 - t * 6
    const lx = px + (dx * 0.55 + nx * side) * l, ly = py + (dy * 0.55 + ny * side) * l
    const cx1 = px + (dx * 0.1 + nx * side * 0.75) * l + dx * 3, cy1 = py + (dy * 0.1 + ny * side * 0.75) * l + dy * 3
    const cx2 = px + (dx * 0.6 + nx * side * 0.35) * l - nx * side * 2, cy2 = py + (dy * 0.6 + ny * side * 0.35) * l - ny * side * 2
    parts.push(`M${px.toFixed(1)},${py.toFixed(1)} Q${cx1.toFixed(1)},${cy1.toFixed(1)} ${lx.toFixed(1)},${ly.toFixed(1)} Q${cx2.toFixed(1)},${cy2.toFixed(1)} ${px.toFixed(1)},${py.toFixed(1)}`)
  }
  return parts.join(' ')
}

function wheat(x: number, y: number, len: number) {
  const p = [`M${x},${y} c-2,${-len * 0.4} 3,${-len * 0.7} 6,${-len}`]
  for (let i = 0; i < 7; i++) {
    const t = 0.45 + i * 0.075
    const px = x + 6 * t * t, py = y - len * t
    p.push(`M${px.toFixed(1)},${py.toFixed(1)} c-9,-2 -12,-9 -11,-14 c6,1 10,7 11,14z`)
    p.push(`M${px.toFixed(1)},${py.toFixed(1)} c9,-3 12,-10 11,-15 c-6,2 -10,8 -11,15z`)
  }
  p.push(`M${x + 6},${y - len} l1,-12 M${x + 4},${y - len + 2} l-5,-11 M${x + 8},${y - len + 2} l6,-10`)
  return p.join(' ')
}

const lemonSegs = Array.from({ length: 9 }, (_, i) => {
  const a = (i / 9) * Math.PI * 2 + 0.2
  const b = ((i + 1) / 9) * Math.PI * 2 + 0.2
  const r = 25
  const m = (a + b) / 2
  return `M${(Math.cos(a) * 4).toFixed(1)},${(Math.sin(a) * 4).toFixed(1)} Q${(Math.cos(a + 0.05) * 18).toFixed(1)},${(Math.sin(a + 0.05) * 18).toFixed(1)} ${(Math.cos(a + 0.08) * r).toFixed(1)},${(Math.sin(a + 0.08) * r).toFixed(1)} Q${(Math.cos(m) * (r + 3)).toFixed(1)},${(Math.sin(m) * (r + 3)).toFixed(1)} ${(Math.cos(b - 0.08) * r).toFixed(1)},${(Math.sin(b - 0.08) * r).toFixed(1)} Q${(Math.cos(b - 0.05) * 18).toFixed(1)},${(Math.sin(b - 0.05) * 18).toFixed(1)} ${(Math.cos(b) * 4).toFixed(1)},${(Math.sin(b) * 4).toFixed(1)}`
}).join(' ')

const PEPPER = [[52, 238], [63, 247], [47, 256], [332, 455], [344, 448], [338, 466], [96, 772], [108, 781], [326, 812]]
const DUST = Array.from({ length: 70 }, (_, i) => {
  // two soft flour drifts, seeded so they never move
  const s = Math.sin(i * 12.9898) * 43758.5453
  const r1 = s - Math.floor(s)
  const s2 = Math.sin(i * 78.233) * 12345.678
  const r2 = s2 - Math.floor(s2)
  const left = i % 2 === 0
  const cx = left ? 40 + r1 * 120 : 250 + r1 * 120
  const cy = left ? 560 + r2 * 120 : 120 + r2 * 110
  return [cx, cy, 0.6 + ((r1 * 7) % 1.6)]
})

export const Backdrop = memo(function Backdrop() {
  return (
    <div className="backdrop" aria-hidden>
      <svg viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice" className="backdrop__svg">
        <defs>
          <radialGradient id="bd-flour" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="currentColor" stopOpacity=".55" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* knife scores + flour: only on the dark board */}
        <g className="bd-board">
          <path d="M-10 318 L170 286 M20 342 L210 300 M240 610 L410 572 M260 628 L400 600 M-6 700 L120 664 M300 210 L400 176 M150 790 L330 744 M30 150 L140 118 M200 420 L250 408" strokeWidth=".8" />
          <path d="M-10 322 L168 291 M244 614 L408 577" strokeWidth=".5" opacity=".6" />
          <ellipse cx="96" cy="620" rx="95" ry="58" fill="url(#bd-flour)" stroke="none" opacity=".16" />
          <ellipse cx="318" cy="176" rx="80" ry="52" fill="url(#bd-flour)" stroke="none" opacity=".13" />
          {DUST.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="currentColor" stroke="none" opacity={0.18 + (i % 4) * 0.06} />)}
        </g>

        {/* coffee/oil ring stains */}
        <g className="bd-stain">
          <path d="M316 724c16-14 44-12 56 6 12 18 4 44-16 52-20 8-44-2-50-22-3-11 0-27 10-36z" strokeWidth="2.6" />
          <path d="M322 730c13-10 36-8 45 7" strokeWidth="1.2" />
          <path d="M28 404c10-12 32-14 44-2 6 7 8 18 4 28" strokeWidth="2.2" />
        </g>

        {/* the line art */}
        <g className="bd-art" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {/* garlic, top right */}
          <g transform="translate(338 66) rotate(14) scale(.9)">
            <path d="M0-30C-8-18-34-6-32 14-30 30-12 36 0 36 12 36 30 30 32 14 34-6 8-18 0-30Z" />
            <path d="M0-30C-6 0-6 20 0 36M-14-14C-22 6-18 24-9 35M14-14C22 6 18 24 9 35" />
            <path d="M0-30C-1-38 1-44-2-52M-1-52C2-54 3-50 1-47" />
            <path d="M-6 36l-3 6M0 36v7M6 36l3 6" />
          </g>
          {/* single clove */}
          <path d="M292 132c6-10 20-12 24-2 3 8-6 16-16 16-6 0-9-7-8-14zM300 120c1 6 4 10 10 12" transform="rotate(-8 300 130)" />

          {/* rosemary, left */}
          <path d={sprig(8, 214, 120, -38)} strokeWidth="1.1" />
          {/* thyme-ish small sprig, right */}
          <path d={sprig(382, 360, 70, 200, 7)} strokeWidth="1" />

          {/* peppercorns */}
          {PEPPER.map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="3.6" />
              <path d={`M${x - 2} ${y - 1}c1 2 3 2 4 1`} strokeWidth=".8" />
            </g>
          ))}

          {/* wheat, right edge */}
          <g transform="translate(360 560) rotate(-12)"><path d={wheat(0, 0, 120)} strokeWidth="1" /></g>

          {/* chili, lower left */}
          <g transform="translate(18 470) rotate(18)">
            <path d="M0 0C22-6 52 4 72 34 76 41 71 45 65 40 45 20 22 11 0 9Z" />
            <path d="M8 3C26 3 46 12 62 30" strokeWidth=".8" />
            <path d="M0 4C-6 2-10-4-12-11M-2 0C-5-3-4-6 0-6 3-5 3 0 0 2" />
          </g>

          {/* lemon half, bottom right */}
          <g transform="translate(330 650) rotate(-10)">
            <ellipse cx="0" cy="0" rx="33" ry="31" />
            <ellipse cx="0" cy="0" rx="28.5" ry="26.5" strokeWidth=".9" />
            <path d={lemonSegs} strokeWidth=".8" />
            <circle cx="0" cy="0" r="2" />
          </g>
          {/* lemon wedge */}
          <path d="M268 770c18-20 52-22 70-4-22 4-46 8-70 4zM274 768c16-12 40-14 58-4" transform="rotate(-6 300 760)" />

          {/* whisk, bottom left */}
          <g transform="translate(40 800) rotate(-48)">
            <path d="M-4 0h8l2 46c0 4-12 4-12 0z" />
            <path d="M-2 0C-26-20-20-70 0-82 20-70 26-20 2 0" />
            <path d="M-1 0C-14-24-10-66 0-82 10-66 14-24 1 0" />
            <path d="M0 0V-82" />
            <path d="M-6 30h12" strokeWidth=".8" />
          </g>

          {/* flourishes */}
          <path d="M150 168c22-14 44 10 66-2s28-24 46-12c10 7 2 20-8 14-6-4-1-12 5-10" strokeWidth="1" />
          <path d="M4 600c18-6 30 8 48 2 14-5 20-18 34-14 9 3 8 15-1 15" strokeWidth="1" />
          <path d="M210 828c16-12 38-12 52 0s34 10 46-2c6-6 16-3 14 5" strokeWidth="1" />
          <path d="M376 250c-10 8-8 22 4 26M368 262c-6 2-8 8-4 12" strokeWidth=".9" />

          {/* a few little stars / sparks of salt */}
          <path d="M120 70l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM210 520l1.4 4 4 1.4-4 1.4-1.4 4-1.4-4-4-1.4 4-1.4z" strokeWidth=".8" />
        </g>
      </svg>
    </div>
  )
})
