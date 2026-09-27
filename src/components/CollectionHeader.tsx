import { Play, Shuffle } from 'lucide-react'
import type { Track } from '@shared/types'
import { player } from '../player/engine'
import { cn } from '../lib/cn'
import { formatCount, formatDurationLong } from '../lib/format'
import { totalDuration } from '../lib/selectors'
import { Artwork } from './Artwork'

export interface CollectionHeaderProps {
  kind: 'album' | 'playlist' | 'folder' | 'library'
  title: string
  subtitle?: string
  meta: string
  tracks: Track[]
  artTrack?: Track
  favoriteTrack?: Track
}

/**
 * The large gradient header shown at the top of a track collection, matching
 * the tinted hero in the reference screenshots.
 */
export function CollectionHeader({
  kind,
  title,
  subtitle,
  meta,
  tracks,
  artTrack,
  favoriteTrack
}: CollectionHeaderProps): React.JSX.Element {
  const gradient = gradientFor(kind, title)

  return (
    <header
      className="relative px-6 pt-6 pb-5"
      style={{ background: `linear-gradient(180deg, ${gradient} 0%, transparent 100%)` }}
    >
      <div className="flex flex-col items-end gap-5 sm:flex-row sm:items-end">
        {artTrack ? (
          <Artwork
            trackId={artTrack.id}
            hasArt={artTrack.hasArt}
            alt={title}
            className="h-[180px] w-[180px] shrink-0 rounded-lg shadow-[0_16px_44px_rgb(0_0_0/0.55)]"
          />
        ) : (
          <div
            className="grid h-[180px] w-[180px] shrink-0 place-items-center rounded-lg shadow-[0_16px_44px_rgb(0_0_0/0.55)]"
            style={{ background: gradientSolid(kind) }}
          >
            <span className="text-5xl font-black text-white/90">{initial(title)}</span>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink/70">{kindLabel(kind)}</p>
          <h1 className={cn('mt-1 text-3xl font-bold tracking-tight text-ink sm:text-5xl')} title={title}>
            {title}
          </h1>
          {subtitle ? <p className="mt-1 truncate text-[13px] text-muted">{subtitle}</p> : null}
          <p className="mt-2 text-[12px] text-muted">
            {meta}
            {tracks.length > 0 ? ` · ${formatDurationLong(totalDuration(tracks))}` : ''}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-5">
        <button
          type="button"
          disabled={tracks.length === 0}
          onClick={() => player.playTracks(favoriteTrack ? [favoriteTrack, ...tracks.filter((t) => t.path !== favoriteTrack.path)] : tracks, 0)}
          title="Play"
          aria-label="Play"
          className="grid h-11 w-11 place-items-center rounded-full bg-accent text-black shadow-[0_8px_20px_rgb(0_0_0/0.45)] transition-transform hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
        >
          <Play size={20} fill="currentColor" className="ml-0.5" />
        </button>
        <button
          type="button"
          disabled={tracks.length === 0}
          onClick={() => {
            if (!player.getSnapshot().shuffle) player.setShuffle(true)
            const copy = [...tracks]
            for (let i = copy.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1))
              ;[copy[i], copy[j]] = [copy[j], copy[i]]
            }
            player.playTracks(copy, 0)
          }}
          title="Shuffle play"
          aria-label="Shuffle play"
          className="grid h-11 w-11 place-items-center rounded-full bg-accent/90 text-black transition-transform hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
        >
          <Shuffle size={20} />
        </button>
        <span className="text-[12px] text-muted">{formatCount(tracks.length, 'track')}</span>
      </div>
    </header>
  )
}

function kindLabel(kind: CollectionHeaderProps['kind']): string {
  switch (kind) {
    case 'playlist':
      return 'Playlist'
    case 'folder':
      return 'Folder'
    case 'album':
      return 'Album'
    default:
      return 'Library'
  }
}

function gradientSolid(kind: CollectionHeaderProps['kind']): string {
  switch (kind) {
    case 'playlist':
      return 'linear-gradient(135deg, #4a2740, #2a1425)'
    case 'folder':
      return 'linear-gradient(135deg, #3d3d3d, #1f1f1f)'
    case 'album':
      return 'linear-gradient(135deg, #1f4b34, #14301f)'
    default:
      return 'linear-gradient(135deg, #333333, #1a1a1a)'
  }
}

/** Deterministic hue from the title so each collection gets a stable tint. */
function gradientFor(kind: CollectionHeaderProps['kind'], title: string): string {
  if (kind === 'library') return 'rgba(255,255,255,0.06)'
  let hash = 0
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0
  const hue = hash % 360
  return `hsla(${hue}, 32%, 26%, 0.85)`
}

function initial(title: string): string {
  return (title.trim()[0] ?? '#').toUpperCase()
}
