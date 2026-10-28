import { useId } from 'react'

/**
 * Single LedgerFlow mark for the sidebar, authentication pages, and legal header.
 * Colours come from the shared CSS design tokens so the logo tracks light/dark themes.
 */
export default function BrandMark({ className = '', title = 'LedgerFlow logo' }) {
  const gradientId = useId().replace(/:/g, '')
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--lf-brand)" />
          <stop offset="100%" stopColor="var(--lf-brand-hover)" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="11" fill={`url(#${gradientId})`} />
      <path d="M10 11.5h7.5c2.1 0 3.5 1.2 3.5 3.1v14c-1.1-1.2-2.2-1.7-4-1.7H10z" fill="#FFFFFF" />
      <path d="M30 11.5h-5.5c-2.1 0-3.5 1.2-3.5 3.1v14c1.1-1.2 2.2-1.7 4-1.7H30z" fill="var(--lf-brand-subtle)" />
      <path d="M12.5 16h5M12.5 20h5M24 16h3.5M24 20h3.5" stroke="var(--lf-brand-hover)" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="29.2" cy="28.2" r="5" fill="var(--lf-accent)" />
      <path d="M26.8 28.2h4.5m-1.8-1.8 1.8 1.8-1.8 1.8" stroke="#FFFFFF" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
