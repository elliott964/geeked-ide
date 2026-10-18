import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

function base({ size = 22, ...rest }: P) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...rest
  }
}

export function Logo({ size = 28, id = 'logo' }: { size?: number; id?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={`lg-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b6cff" />
          <stop offset="0.55" stopColor="#5c8dff" />
          <stop offset="1" stopColor="#3dd6f5" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="17" fill={`url(#lg-${id})`} />
      <path d="M44.5 23.5 A14.5 14.5 0 1 0 46.5 36 H33" fill="none" stroke="#fff" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M49 9.5 l1.6 3.9 3.9 1.6 -3.9 1.6 -1.6 3.9 -1.6 -3.9 -3.9 -1.6 3.9 -1.6z" fill="#fff" opacity="0.95" />
    </svg>
  )
}

export const GitHub = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none" viewBox="0 0 24 24">
    <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
  </svg>
)

export const Windows = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M3 5.4 10.4 4.4v7.1H3zM11.4 4.3 21 3v8.5h-9.6zM3 12.5h7.4v7.1L3 18.6zM11.4 12.5H21V21l-9.6-1.3z" />
  </svg>
)

export const Chat = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12Z" />
    <path d="M8.5 11h7M8.5 14h4.5" />
  </svg>
)

export const Toolbox = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="7" width="18" height="13" rx="2.5" />
    <path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7M3 12.5h18M10 12.5v2h4v-2" />
  </svg>
)

export const Globe = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
  </svg>
)

export const MapIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z" />
    <path d="M9 4v13.5M15 6.5V20" />
  </svg>
)

export const Shield = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </svg>
)

export const Folder = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2.5h6.5A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
    <path d="M12 11v5M9.5 13.5h5" />
  </svg>
)

export const Bolt = (p: P) => (
  <svg {...base(p)}>
    <path d="M13 2 4.5 13.5H12L11 22l8.5-11.5H12z" />
  </svg>
)

export const Sparkle = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z" />
    <path d="M19 15.5c.3 1.6 1 2.3 2.5 2.5-1.5.2-2.2.9-2.5 2.5-.3-1.6-1-2.3-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5Z" />
  </svg>
)

export const Star = (p: P) => (
  <svg {...base(p)}>
    <path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1-4.5-4.2 6.1-.8z" />
  </svg>
)

export const Flame = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 21c-3.9 0-7-2.8-7-6.6 0-3.1 2-5.2 3.6-7 .4 1.7 1.3 2.8 2.4 3.2C11 7 12.6 4.5 15 3c-.3 2.6.6 4.4 2 6.2 1.2 1.5 2 3.1 2 5.2 0 3.8-3.1 6.6-7 6.6Z" />
  </svg>
)

export const Lock = (p: P) => (
  <svg {...base(p)}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </svg>
)

export const Check = (p: P) => (
  <svg {...base({ size: 14, strokeWidth: 2.6, ...p })}>
    <path d="m5 12.5 4.2 4.2L19 7" />
  </svg>
)

export const Plus = (p: P) => (
  <svg {...base({ size: 16, strokeWidth: 2.2, ...p })}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const Download = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.5v12M7 11l5 5 5-5M4.5 20.5h15" />
  </svg>
)

export const Question = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.3a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.2-2.4 3.7M12 17.2h.01" />
  </svg>
)

export const Milestone = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3v18M5 6h11l3 3-3 3H5z" />
  </svg>
)

export const Gauge = (p: P) => (
  <svg {...base(p)}>
    <path d="M4.5 17a8.5 8.5 0 1 1 15 0" />
    <path d="m12 13 4-4" />
  </svg>
)
