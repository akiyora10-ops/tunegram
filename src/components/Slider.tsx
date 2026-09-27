import { useCallback, useRef, useState, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { clamp } from '../lib/format'

interface SliderProps {
  /** 0..1 */
  value: number
  onChange: (value: number) => void
  /** Fired once at the end of a drag, for expensive seeks. */
  onCommit?: (value: number) => void
  className?: string
  trackClassName?: string
  ariaLabel: string
  title?: string
  children?: ReactNode
  disabled?: boolean
  /** Draws the filled portion in the accent colour. */
  accent?: boolean
}

/**
 * Click-and-drag track used for both the playback position and the volume.
 * The handle is revealed on hover, matching the reference player bar.
 */
export function Slider({
  value,
  onChange,
  onCommit,
  className,
  trackClassName,
  ariaLabel,
  title,
  children,
  disabled = false,
  accent = true
}: SliderProps): React.JSX.Element {
  const railRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [hovering, setHovering] = useState(false)

  const ratioFromEvent = useCallback((clientX: number): number => {
    const rail = railRef.current
    if (!rail) return 0
    const rect = rail.getBoundingClientRect()
    if (rect.width === 0) return 0
    return clamp((clientX - rect.left) / rect.width, 0, 1)
  }, [])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return
      event.preventDefault()
      const ratio = ratioFromEvent(event.clientX)
      setDragging(true)
      onChange(ratio)
      const target = event.currentTarget
      target.setPointerCapture(event.pointerId)

      const onMove = (moveEvent: PointerEvent): void => {
        onChange(ratioFromEvent(moveEvent.clientX))
      }
      const onUp = (upEvent: PointerEvent): void => {
        target.releasePointerCapture(upEvent.pointerId)
        target.removeEventListener('pointermove', onMove)
        target.removeEventListener('pointerup', onUp)
        target.removeEventListener('pointercancel', onUp)
        setDragging(false)
        onCommit?.(ratioFromEvent(upEvent.clientX))
      }
      target.addEventListener('pointermove', onMove)
      target.addEventListener('pointerup', onUp)
      target.addEventListener('pointercancel', onUp)
    },
    [disabled, onChange, onCommit, ratioFromEvent]
  )

  const percent = `${clamp(value, 0, 1) * 100}%`
  const visible = dragging || hovering

  return (
    <div
      ref={railRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamp(value, 0, 1) * 100)}
      aria-disabled={disabled}
      title={title}
      onPointerDown={handlePointerDown}
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onKeyDown={(event) => {
        if (disabled) return
        const step = event.shiftKey ? 0.1 : 0.02
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
          event.preventDefault()
          const next = clamp(value + step, 0, 1)
          onChange(next)
          onCommit?.(next)
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
          event.preventDefault()
          const next = clamp(value - step, 0, 1)
          onChange(next)
          onCommit?.(next)
        } else if (event.key === 'Home') {
          event.preventDefault()
          onChange(0)
          onCommit?.(0)
        } else if (event.key === 'End') {
          event.preventDefault()
          onChange(1)
          onCommit?.(1)
        }
      }}
      className={cn(
        'no-drag group relative flex h-3 w-full cursor-pointer touch-none items-center',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
    >
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-full bg-progress-track transition-[height] duration-100',
          visible ? 'h-3' : 'h-1',
          trackClassName
        )}
      >
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full', accent ? 'bg-ink' : 'bg-accent')}
          style={{ width: percent }}
        />
      </div>
      <div
        className={cn(
          'pointer-events-none absolute h-3 w-3 -translate-x-1/2 rounded-full bg-ink shadow-[0_0_4px_rgb(0_0_0/0.6)] transition-opacity duration-100',
          visible ? 'opacity-100' : 'opacity-0'
        )}
        style={{ left: percent }}
      />
      {children}
    </div>
  )
}
