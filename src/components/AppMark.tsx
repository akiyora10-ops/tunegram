import { cn } from '../lib/cn'

/**
 * TuneGram's own mark: a sound-wave glyph in a rounded squircle. Deliberately
 * unrelated to any streaming service's logo.
 */
export function AppMark({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 32 32" className={cn('shrink-0', className)} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--spice-button)" />
      <g stroke="#000000" strokeWidth="2.4" strokeLinecap="round">
        <path d="M10 12.5v7" />
        <path d="M15 9.5v13" />
        <path d="M20 12.5v7" />
      </g>
    </svg>
  )
}
