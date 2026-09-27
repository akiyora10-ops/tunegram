import { memo, useState } from 'react'
import { AlertTriangle, GripVertical, Heart, MoreHorizontal, Play, X } from 'lucide-react'
import type { Track, TrackSortKey } from '@shared/types'
import { player } from '../player/engine'
import { libraryStore } from '../state/libraryStore'
import { cn } from '../lib/cn'
import { formatDuration, formatRelativeTime } from '../lib/format'
import { Artwork } from './Artwork'
import { TrackContextMenu } from './TrackContextMenu'

/** One column template, shared by the header and every row so they line up. */
const GRID =
  'grid items-center gap-3 sm:gap-4 grid-cols-[20px_minmax(0,1fr)_56px_28px] md:grid-cols-[20px_minmax(0,2.4fr)_minmax(0,1.6fr)_minmax(0,1.7fr)_56px_28px]'

export interface TrackListProps {
  tracks: Track[]
  sortKey: TrackSortKey
  sortDir: 'asc' | 'desc'
  onSort: (key: TrackSortKey) => void
  currentPath?: string | null
  isPlaying?: boolean
  emptyMessage?: string
  showFolder?: boolean
  /** Enables drag handles and the remove button. */
  onRemove?: (index: number) => void
  onReorder?: (from: number, to: number) => void
  showHeader?: boolean
}

export function TrackList({
  tracks,
  sortKey,
  sortDir,
  onSort,
  currentPath,
  isPlaying,
  emptyMessage,
  showFolder = false,
  onRemove,
  onReorder,
  showHeader = true
}: TrackListProps): React.JSX.Element {
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragTo, setDragTo] = useState<number | null>(null)

  if (tracks.length === 0) {
    return (
      <div className="grid place-items-center px-6 py-16 text-center">
        <p className="max-w-sm text-[14px] leading-relaxed text-muted">{emptyMessage ?? 'Nothing here yet.'}</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-col">
      {showHeader ? (
        <div
          className={cn(
            GRID,
            'sticky top-0 z-10 border-b border-divider bg-base/95 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted backdrop-blur sm:px-4'
          )}
        >
          <HeaderCell className="justify-center" label="#" align="center" />
          <HeaderCell label="Title" sortKey="title" active={sortKey === 'title'} dir={sortDir} onSort={onSort} />
          <HeaderCell
            label="Artist"
            sortKey="artist"
            active={sortKey === 'artist'}
            dir={sortDir}
            onSort={onSort}
            className="hidden md:flex"
          />
          <HeaderCell
            label="Album"
            sortKey="album"
            active={sortKey === 'album'}
            dir={sortDir}
            onSort={onSort}
            className="hidden md:flex"
          />
          <HeaderCell
            label="Time"
            sortKey="duration"
            active={sortKey === 'duration'}
            dir={sortDir}
            onSort={onSort}
            className="justify-end text-right"
            align="right"
          />
          <span />
        </div>
      ) : null}

      <div role="list" className="flex flex-col pb-2">
        {tracks.map((track, index) => (
          <TrackRow
            key={track.path}
            track={track}
            index={index}
            tracks={tracks}
            active={track.path === currentPath}
            isPlaying={!!isPlaying && track.path === currentPath}
            showFolder={showFolder}
            onRemove={onRemove}
            reorderable={!!onReorder}
            dragging={dragFrom === index}
            dragTarget={dragTo === index && dragFrom !== null && dragFrom !== index}
            onDragStart={() => {
              setDragFrom(index)
              setDragTo(index)
            }}
            onDragOver={
              onReorder
                ? (event) => {
                    event.preventDefault()
                    setDragTo(index)
                  }
                : undefined
            }
            onDragEnd={() => {
              if (dragFrom !== null && dragTo !== null && dragFrom !== dragTo) onReorder?.(dragFrom, dragTo)
              setDragFrom(null)
              setDragTo(null)
            }}
          />
        ))}
      </div>
    </div>
  )
}

interface TrackRowProps {
  track: Track
  index: number
  tracks: Track[]
  active: boolean
  isPlaying: boolean
  showFolder: boolean
  onRemove?: (index: number) => void
  reorderable: boolean
  dragging: boolean
  dragTarget: boolean
  onDragStart: () => void
  onDragOver?: (event: React.DragEvent) => void
  onDragEnd: () => void
}

const TrackRow = memo(function TrackRow({
  track,
  index,
  tracks,
  active,
  isPlaying,
  showFolder,
  onRemove,
  reorderable,
  dragging,
  dragTarget,
  onDragStart,
  onDragOver,
  onDragEnd
}: TrackRowProps): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)

  const startPlaying = (): void => {
    if (active) {
      player.togglePlay()
      return
    }
    player.playTracks(tracks, index)
  }

  return (
    <div
      role="listitem"
      draggable={reorderable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDoubleClick={startPlaying}
      onContextMenu={(event) => {
        event.preventDefault()
        setMenuOpen(true)
      }}
      className={cn(
        GRID,
        'group relative px-3 py-2 transition-colors sm:px-4',
        active ? 'bg-row-hover' : 'hover:bg-row-hover',
        dragging && 'opacity-40',
        dragTarget && 'border-t-2 border-accent'
      )}
    >
      <div className="relative flex justify-center">
        <button
          type="button"
          onClick={startPlaying}
          title={active && isPlaying ? 'Pause' : 'Play'}
          aria-label={active && isPlaying ? 'Pause' : `Play ${track.title}`}
          className="grid h-6 w-5 place-items-center"
        >
          {active ? (
            <EqualizerBars playing={isPlaying} />
          ) : (
            <>
              <span className="tabular-nums text-[13px] text-muted transition-opacity group-hover:opacity-0">
                {index + 1}
              </span>
              <Play
                size={14}
                fill="currentColor"
                className="absolute text-ink opacity-0 transition-opacity group-hover:opacity-100"
              />
            </>
          )}
        </button>
        {reorderable ? (
          <GripVertical
            size={12}
            className="absolute -left-1 top-1/2 -translate-y-1/2 cursor-grab text-muted opacity-0 transition-opacity group-hover:opacity-50"
          />
        ) : null}
      </div>

      <div className="flex min-w-0 items-center gap-3">
        <Artwork trackId={track.id} hasArt={track.hasArt} alt={track.title} className="h-10 w-10 rounded" />
        <div className="min-w-0 flex-1">
          <div className={cn('truncate text-[14px]', active ? 'text-accent' : 'text-ink')} title={track.title}>
            {track.title}
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted">
            {!track.verified ? (
              <span
                title={`Unrecognised file extension “${track.ext}”. It is listed here anyway, but playing it may need an automatic conversion.`}
                className="inline-flex shrink-0 items-center gap-1 rounded bg-warning/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-warning"
              >
                <AlertTriangle size={10} />
                unverified
              </span>
            ) : null}
            {showFolder && track.folder ? (
              <span className="truncate">in {track.folder}</span>
            ) : null}
            {track.lastPlayedAt ? (
              <span className="hidden shrink-0 truncate lg:inline">played {formatRelativeTime(track.lastPlayedAt)}</span>
            ) : null}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void libraryStore.toggleFavorite(track.path)}
        title={track.favorite ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
        className={cn(
          'hidden min-w-0 items-center gap-1.5 truncate text-left text-[12px] text-muted transition-colors hover:text-ink hover:underline md:flex',
          track.favorite && 'text-accent'
        )}
      >
        <Heart
          size={12}
          fill={track.favorite ? 'currentColor' : 'none'}
          className={cn('shrink-0', track.favorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-60')}
        />
        <span className="truncate">{track.artist || 'Unknown Artist'}</span>
      </button>

      <span className="hidden min-w-0 truncate text-[12px] text-muted md:block" title={track.album}>
        {track.album || '—'}
      </span>

      <span className="text-right text-[12px] tabular-nums text-muted">{formatDuration(track.duration)}</span>

      <div className="flex justify-end">
        <button
          type="button"
          title={onRemove ? 'Remove from this list' : 'More options'}
          aria-label={onRemove ? 'Remove from this list' : 'More options'}
          onClick={() => (onRemove ? onRemove(index) : setMenuOpen(true))}
          className="grid h-6 w-6 place-items-center rounded text-muted opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
        >
          {onRemove ? <X size={14} /> : <MoreHorizontal size={16} />}
        </button>
      </div>

      {menuOpen ? <TrackContextMenu track={track} onClose={() => setMenuOpen(false)} onRemove={onRemove ? () => onRemove(index) : undefined} /> : null}
    </div>
  )
})

/** Three animated bars marking the row that is currently playing. */
function EqualizerBars({ playing }: { playing: boolean }): React.JSX.Element {
  if (!playing) {
    return <span className="h-3.5 w-3.5" aria-hidden="true" />
  }
  return (
    <span className="flex h-3.5 items-end gap-[2px]" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="equalizer-bar w-[2px] rounded-sm bg-accent"
          style={{ animationDelay: `${i * 140}ms` }}
        />
      ))}
    </span>
  )
}

interface HeaderCellProps {
  label: string
  className?: string
  sortKey?: TrackSortKey
  active?: boolean
  dir?: 'asc' | 'desc'
  onSort?: (key: TrackSortKey) => void
  align?: 'left' | 'right' | 'center'
}

function HeaderCell({ label, className, sortKey, active, dir, onSort, align = 'left' }: HeaderCellProps): React.JSX.Element {
  const alignClass = align === 'right' ? 'justify-end text-right' : align === 'center' ? 'justify-center text-center' : ''
  if (!sortKey || !onSort) {
    return <span className={cn('truncate', className, alignClass)}>{label}</span>
  }
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn('flex min-w-0 items-center gap-1 truncate transition-colors hover:text-ink', className, alignClass, active && 'text-ink')}
    >
      {label}
      {active ? (
        <span aria-hidden="true" className="text-[8px] leading-none">
          {dir === 'asc' ? '▲' : '▼'}
        </span>
      ) : null}
    </button>
  )
}
