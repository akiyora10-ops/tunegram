import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

interface IconButtonProps {
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
  children: ReactNode
  title: string
  active?: boolean
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
  /** Renders at Spotify's hover-in reveal strength instead of always-on. */
  dim?: boolean
}

const ICON_SIZES: Record<NonNullable<IconButtonProps['size']>, number> = {
  sm: 14,
  md: 16,
  lg: 20
}

export function IconButton({
  onClick,
  children,
  title,
  active = false,
  disabled = false,
  size = 'md',
  className,
  dim = false
}: IconButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      style={{ width: ICON_SIZES[size] + 16, height: ICON_SIZES[size] + 16 }}
      className={cn(
        'no-drag grid place-items-center rounded-full transition-[color,background-color,transform] duration-150',
        'text-muted hover:text-ink active:scale-95 disabled:pointer-events-none disabled:opacity-40',
        active && 'text-accent',
        dim ? 'opacity-70 hover:opacity-100' : 'opacity-100',
        className
      )}
    >
      {children}
    </button>
  )
}
