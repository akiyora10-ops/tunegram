import { GripVertical, ListX, Trash2, X } from 'lucide-react'
import { player } from '../player/engine'
import { usePlayer } from '../hooks'
import { cn } from '../lib/cn'
import { formatDuration } from '../lib/format'
import { Artwork } from './Artwork'
import { IconButton } from './IconButton'
import { panelStore } from '../state/panelStore'

/** "Up next" drawer, toggled from the mini-player. */
export function QueuePanel(): React.JSX.Element | null {
  const state = usePlayer()

  // Entries in play order (shuffle permutation included).
  const entries = state.order
    .map((queueIndex, position) => ({ track: state.queue[queueIndex], position }))
    .filter((entry): entry is { track: NonNullable<typeof entry.track>; position: number } => !!entry.track)

  const upNext = entries.filter((entry) => entry.position > state.orderPos)
  const finished = entries.filter((entry) => entry.position < state.orderPos)
  const current = entries.find((entry) => entry.position === state.orderPos)

  return (
    <aside
      className="absolute right-2 bottom-[calc(var(--tg-player-height)+8px)] z-30 flex max-h-[70vh] w-[380px] flex-col overflow-hidden rounded-lg border border-divider bg-card/95 shadow-[0_24px_60px_rgb(0_0_0/0.65)] backdrop-blur-md"
      role="dialog"
      aria-label="Queue"
    >
      <header className="flex items-center justify-between border-b border-divider px-4 py-3">
        <div>
          <h2 className="text-[15px] font-bold text-ink">Queue</h2>
          <p className="text-[12px] text-muted">
            {state.queue.length} track{state.queue.length === 1 ? '' : 's'}
            {state.shuffle ? ' · shuffled' : ''}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <IconButton title="Clear upcoming" size="sm" dim onClick={() => player.clearQueue(false)}>
            <ListX size={16} />
          </IconButton>
          <IconButton title="Close queue" size="sm" dim onClick={() => panelStore.setQueueOpen(false)}>
            <X size={16} />
          </IconButton>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {current ? (
          <Section label="Now playing">
            <QueueRow
              track={current.track}
              active
              isPlaying={state.isPlaying}
              onPlay={() => player.jumpTo(current.position)}
            />
          </Section>
        ) : (
          <p className="px-4 py-6 text-center text-[13px] text-muted">Nothing queued yet.</p>
        )}

        {upNext.length > 0 ? (
          <Section label={`Next up (${upNext.length})`}>
            {upNext.map((entry) => (
              <QueueRow
                key={`${entry.track.path}-${entry.position}`}
                track={entry.track}
                position={entry.position}
                reorderable
                onPlay={() => player.jumpTo(entry.position)}
                onRemove={() => player.removeFromQueue(entry.position)}
                onReorder={(from, to) => player.moveInQueue(from, to)}
              />
            ))}
          </Section>
        ) : null}

        {finished.length > 0 ? (
          <Section label="Played">
            {finished
              .slice()
              .reverse()
              .map((entry) => (
                <QueueRow
                  key={`${entry.track.path}-${entry.position}`}
                  track={entry.track}
                  dimmed
                  position={entry.position}
                  onPlay={() => player.jumpTo(entry.position)}
                />
              ))}
          </Section>
        ) : null}
      </div>

      {state.queue.length > 0 ? (
        <footer className="flex items-center justify-between border-t border-divider px-4 py-2">
          <span className="text-[12px] text-muted">Total {formatTotal(state.queue)}</span>
          <button
            type="button"
            onClick={() => player.clearQueue(true)}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-muted transition-colors hover:text-ink"
          >
            <Trash2 size={13} />
            Clear queue
          </button>
        </footer>
      ) : null}
    </aside>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="mb-1">
      <h3 className="px-4 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted">{label}</h3>
      {children}
    </section>
  )
}

interface QueueRowProps {
  track: { id: string; path: string; title: string; artist: string; hasArt: boolean; duration: number }
  active?: boolean
  dimmed?: boolean
  isPlaying?: boolean
  position?: number
  reorderable?: boolean
  onPlay: () => void
  onRemove?: () => void
  onReorder?: (from: number, to: number) => void
}

function QueueRow({
  track,
  active = false,
  dimmed = false,
  isPlaying = false,
  position,
  reorderable = false,
  onPlay,
  onRemove,
  onReorder
}: QueueRowProps): React.JSX.Element {
  return (
    <div
      draggable={reorderable}
      onDragStart={(event) => {
        if (position === undefined) return
        event.dataTransfer.setData('text/tunegram-queue', String(position))
        event.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={(event) => {
        if (position !== undefined) event.preventDefault()
      }}
      onDrop={(event) => {
        const raw = event.dataTransfer.getData('text/tunegram-queue')
        const from = Number(raw)
        if (position === undefined || Number.isNaN(from) || from === position) return
        event.preventDefault()
        onReorder?.(from, position)
      }}
      className={cn(
        'group flex items-center gap-3 px-3 py-1.5 transition-colors hover:bg-row-hover',
        active && 'bg-row-hover',
        dimmed && 'opacity-50'
      )}
    >
      {reorderable ? (
        <GripVertical size={13} className="shrink-0 cursor-grab text-muted opacity-0 transition-opacity group-hover:opacity-60" />
      ) : (
        <span className="w-[13px] shrink-0" />
      )}

      <button type="button" onClick={onPlay} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Artwork trackId={track.id} hasArt={track.hasArt} alt={track.title} className="h-10 w-10 rounded" />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-[13px]', active ? 'text-accent' : 'text-ink')}>{track.title}</span>
          <span className="block truncate text-[12px] text-muted">{track.artist || 'Unknown Artist'}</span>
        </span>
      </button>

      {isPlaying ? (
        <span className="flex h-3.5 items-end gap-[2px]" aria-label="Playing">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="equalizer-bar w-[2px] rounded-sm bg-accent"
              style={{ animationDelay: `${i * 140}ms` }}
            />
          ))}
        </span>
      ) : null}

      <span className="shrink-0 text-[11px] tabular-nums text-muted">{formatDuration(track.duration)}</span>

      {onRemove ? (
        <button
          type="button"
          title="Remove from queue"
          aria-label="Remove from queue"
          onClick={onRemove}
          className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  )
}

function formatTotal(queue: { duration: number }[]): string {
  const seconds = queue.reduce((sum, t) => sum + (t.duration || 0), 0)
  const minutes = Math.round(seconds / 60)
  return minutes >= 60 ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min` : `${minutes} min`
}
