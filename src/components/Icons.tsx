import type { SVGProps } from 'react'

/* Hand-drawn style icons: round caps, slightly wobbly paths, 24px grid. */
type P = SVGProps<SVGSVGElement> & { size?: number }
const base = (size = 22) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
})

export const IconBack = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M19.5 12.3c-4.6-.2-9.3.1-14.6-.2" /><path d="M10.2 6.4C8.4 8.3 6.6 10.1 4.8 12.1c1.9 1.8 3.6 3.6 5.5 5.6" /></svg>
)
export const IconClock = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12.2 3.6c4.7-.1 8.4 3.9 8.2 8.6-.2 4.6-4 8.1-8.6 8-4.5-.2-8-3.9-7.9-8.4.1-4.4 3.6-8.1 8.3-8.2z" /><path d="M12 7.4c.1 1.7 0 3.3.1 5l3.1 2" /></svg>
)
export const IconServes = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M3.4 14.2c5.8.2 11.4-.1 17.2.1" /><path d="M5 14c.3-4.2 3.3-7 7-7s6.6 2.9 6.9 7" /><path d="M12 7V5.3" /><path d="M10.6 5.1c.9-.1 1.9 0 2.8-.1" /><path d="M6 17.6c4 .3 8 .2 12-.1" /></svg>
)
export const IconSpoon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M15.6 3.5c2.6.4 4.6 2.6 4 5.1-.6 2.6-3.6 4.1-5.9 3.2-2.1-.8-2.9-3.4-1.8-5.6.8-1.6 2.1-2.9 3.7-2.7z" /><path d="M13.4 11.2C10.3 14 7.2 17 4 20.3" /></svg>
)
export const IconWhisk = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M14.1 9.9 4.3 19.8" /><path d="M14.3 9.6c-1.7-3-1.2-6 1.2-6.4 2.7-.4 5.6 2.4 5.2 5-.3 2.3-3.4 2.9-6.4 1.4z" /><path d="M14.3 9.6c.2-2.4 1.1-4.4 2.6-5.4" /><path d="M14.3 9.6c2.2-.5 4.4-1.6 5.9-3.4" /><path d="M14.2 9.7c1.3-1.8 2.5-3.5 3.7-4.9" /></svg>
)
export const IconSprig = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4.5 20c4-4.2 8.3-9 14.6-15.6" /><path d="M9 15.2c-2.2-.3-3.6-1.8-3.8-4 2.1 0 3.6 1.5 3.8 4z" /><path d="M12.5 11.4c-2.1-.4-3.4-2-3.4-4.2 2 .1 3.4 1.7 3.4 4.2z" /><path d="M9.1 15.1c.6-2 2.3-3 4.4-2.8-.6 2-2.3 3-4.4 2.8z" /><path d="M12.6 11.3c.8-2 2.6-2.9 4.5-2.4-.8 1.9-2.5 2.8-4.5 2.4z" /><path d="M16 7.6c-1.4-.8-2-2.3-1.6-3.9 1.5.6 2.1 2.2 1.6 3.9z" /></svg>
)
export const IconShare = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12.1 15.2c-.1-3.8 0-7.7-.1-11.4" /><path d="M8.3 7.2c1.3-1.2 2.5-2.4 3.8-3.6 1.2 1.2 2.4 2.4 3.7 3.7" /><path d="M8.2 10.3H6.1c-.6 0-1 .4-1 1-.1 2.7 0 5.6 0 8.2 0 .5.4.9 1 .9 4 .1 7.9.1 11.8 0 .6 0 1-.4 1-1v-8.2c0-.5-.4-.9-1-.9h-2.1" /></svg>
)
export const IconTrash = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4.6 6.6c4.9-.2 9.9-.1 14.8 0" /><path d="M9.4 6.4c0-1.1.1-2.2.3-2.8 1.5-.1 3-.1 4.5 0 .2.7.2 1.7.3 2.8" /><path d="M6.4 6.8c.3 4.3.6 8.6 1 12.8.1.6.5.9 1 .9 2.4.1 4.8.1 7.2 0 .5 0 .9-.4 1-.9.4-4.2.6-8.5.9-12.8" /><path d="M10.2 10.4c.1 2.4.1 4.8.2 7" /><path d="M13.9 10.4c-.1 2.4-.1 4.7-.2 7" /></svg>
)
export const IconClip = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M9 4.6H7c-.9 0-1.6.7-1.6 1.6.1 4.6 0 9.1.1 13.7 0 .8.7 1.5 1.5 1.5 3.3.1 6.7.1 10 0 .8 0 1.5-.7 1.5-1.5V6.2c0-.9-.7-1.6-1.6-1.6h-2" /><path d="M9.1 3.4c1.9 0 3.9-.1 5.8 0 .2.9.2 1.9 0 2.8-1.9.1-3.9.1-5.8 0-.2-.9-.1-1.9 0-2.8z" /><path d="M8.9 11.1c2.1.1 4.2 0 6.3.1" /><path d="M8.9 14.6c1.5 0 2.9.1 4.4 0" /></svg>
)
export const IconSun = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12.1 8.1c2.2 0 4 1.8 3.9 4-.1 2.1-1.9 3.9-4 3.8-2.1 0-3.8-1.8-3.8-3.9 0-2.1 1.7-3.9 3.9-3.9z" /><path d="M12 2.9v2.2M12.1 18.9v2.3M3 12.1h2.2M18.9 12h2.2M5.6 5.5l1.6 1.6M16.9 16.8l1.6 1.6M5.6 18.4l1.6-1.5M16.9 7.2l1.5-1.6" /></svg>
)
export const IconPlus = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12.1 5.2c-.1 4.6.1 9.1-.1 13.6M5.3 12.1c4.5-.1 9 .1 13.5-.1" /></svg>
)
export const IconMinus = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M5.3 12.1c4.5-.1 9 .1 13.5-.1" /></svg>
)
export const IconLink = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M13.6 4.7c2.2-.1 4.3-.1 5.7 0 .1 1.5.1 3.6 0 5.7" /><path d="M19.2 4.8c-3 3.1-5.9 6-8.9 9" /><path d="M17.3 13.6c0 1.9.1 3.8 0 5.2 0 .4-.3.7-.7.7-3.9.1-7.8.1-11.6 0-.4 0-.6-.3-.6-.7-.1-3.8-.1-7.6 0-11.4 0-.4.3-.7.7-.7h5.1" /></svg>
)
export const IconBox = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M3.6 9.3c5.6-.1 11.2 0 16.8-.1.2 3.6.1 7.3-.1 10.8-5.5.2-11 .1-16.5 0-.3-3.5-.3-7.2-.2-10.7z" /><path d="M6 9.2c.1-1.9.2-3.7.6-5.4 1.9-.2 3.8-.1 5.7 0 .3 1.8.3 3.6.3 5.4" /><path d="M11 9.2c.3-1.5.6-2.8 1-4 1.9 0 3.9 0 5.8.2.3 1.3.4 2.6.4 3.8" /><path d="M10.1 13c1.3.1 2.6 0 3.8.1" /></svg>
)
export const IconRefresh = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M19.4 12.3c-.1 4-3.4 7.4-7.5 7.3-4.1-.1-7.4-3.5-7.3-7.6.1-4.1 3.6-7.4 7.7-7.2 2.2.1 4.1 1.1 5.5 2.7" /><path d="M18.6 3.9c.1 1.5.2 3 .1 4.4-1.5.1-3 .1-4.5 0" /></svg>
)
export const IconCheck = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M5 12.8c1.4 1.4 2.8 2.9 4.1 4.4 3.2-3.8 6.4-7.5 9.9-11" /></svg>
)
export const IconPencil = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M15.6 4.9c1.2-1.2 2.6-1.3 3.6-.3 1 1 .9 2.4-.3 3.6L8.4 18.6l-4.3 1.2 1.2-4.2z" /><path d="M13.8 6.8l3.5 3.4M5.4 15.7c1 .4 2.2 1.6 2.7 2.7" /></svg>
)
export const IconNote = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M6.2 3.6c3.9.2 7.8-.1 11.7.1.2 5.6-.1 11.2.2 16.8-3.9-.2-7.9.1-11.8-.1-.2-5.6.1-11.2-.1-16.8z" /><path d="M9 8.3h6.1M9 11.8h6.4M9 15.3h3.8" /></svg>
)
