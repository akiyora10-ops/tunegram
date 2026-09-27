import { useMemo } from 'react'
import { Clock3, Folder, Heart, ListMusic, Play, Shuffle, Sparkles } from 'lucide-react'
import type { Track } from '@shared/types'
import { player } from '../player/engine'
import { navStore } from '../state/navStore'
import { useLibrary, usePlayer } from '../hooks'
import { cn } from '../lib/cn'
import { formatCount } from '../lib/format'
import { recentlyAdded } from '../lib/selectors'
import { Artwork } from './Artwork'

/**
 * The shortcut row on the Home view: the built-in slices followed by one card
 * per top-level folder in the library.
 */
export function HomeGrid(): React.JSX.Element {
  const library = useLibrary()
  const playerState = usePlayer()

  // The store hands out a new state object on every mutation, so `library`
  // identity is a sufficient dependency.
  const added = useMemo(() => recentlyAdded(library, 6), [library])
  const favorites = useMemo(() => library.tracks.filter((t) => t.favorite), [library])

  const shortcuts = useMemo(() => {
    const cards: Shortcut[] = [
      {
        id: 'all',
        label: 'All Songs',
        description: formatCount(library.tracks.length, 'track'),
        icon: <ListMusic size={22} />,
        color: 'linear-gradient(135deg, #3d3d3d, #1f1f1f)',
        onOpen: () => navStore.navigate({ kind: 'library' }),
        onPlay: () => player.playTracks(library.tracks, 0)
      },
      {
        id: 'recent',
        label: 'Recently Added',
        description: formatCount(added.length, 'track'),
        icon: <Clock3 size={22} />,
        color: 'linear-gradient(135deg, #1f4b34, #14301f)',
        onOpen: () => navStore.navigate({ kind: 'library' }),
        onPlay: () => player.playTracks(added, 0)
      },
      {
        id: 'liked',
        label: 'Favorites',
        description: formatCount(favorites.length, 'track'),
        icon: <Heart size={22} fill={favorites.length > 0 ? 'currentColor' : 'none'} />,
        color: 'linear-gradient(135deg, #4a2740, #2a1425)',
        onOpen: () => navStore.navigate({ kind: 'favorites' }),
        onPlay: () => player.playTracks(favorites, 0)
      },
      {
        id: 'shuffle',
        label: 'Shuffle All',
        description: 'Random pick from your library',
        icon: <Shuffle size={22} />,
        color: 'linear-gradient(135deg, #1d3b52, #12222e)',
        onOpen: () => {
          if (!playerState.shuffle) player.setShuffle(true)
          player.playTracks(shuffled(library.tracks), 0)
        },
        onPlay: () => {
          if (!playerState.shuffle) player.setShuffle(true)
          player.playTracks(shuffled(library.tracks), 0)
        }
      }
    ]

    for (const folder of library.folders.slice(0, 8)) {
      const tracks = library.tracks.filter((t) => t.folder === folder.name)
      cards.push({
        id: `folder:${folder.name}`,
        label: folder.name,
        description: formatCount(tracks.length, 'track'),
        icon: <Folder size={22} />,
        color: 'linear-gradient(135deg, #333333, #1a1a1a)',
        onOpen: () => navStore.navigate({ kind: 'folder', id: folder.name }),
        onPlay: () => player.playTracks(tracks, 0)
      })
    }

    return cards
  }, [library.tracks, library.folders, added, favorites, playerState.shuffle])

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {shortcuts.map((card) => (
        <ShortcutCard key={card.id} {...card} />
      ))}
    </div>
  )
}

export interface Shortcut {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  color: string
  onOpen: () => void
  onPlay: () => void
}

function ShortcutCard({ label, description, icon, color, onOpen, onPlay }: Shortcut): React.JSX.Element {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      className="group relative flex h-[72px] cursor-pointer items-center gap-4 overflow-hidden rounded bg-card px-4 transition-colors duration-200 hover:bg-card-hover"
    >
      <div
        className="grid h-12 w-12 shrink-0 place-items-center rounded text-white shadow-[0_4px_10px_rgb(0_0_0/0.35)]"
        style={{ background: color }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-bold text-ink">{label}</div>
        <div className="truncate text-[12px] text-muted">{description}</div>
      </div>
      <button
        type="button"
        title={`Play ${label}`}
        aria-label={`Play ${label}`}
        onClick={(event) => {
          event.stopPropagation()
          onPlay()
        }}
        className="mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-black opacity-0 shadow-[0_6px_14px_rgb(0_0_0/0.4)] transition-opacity duration-200 group-hover:opacity-100"
      >
        <Play size={16} fill="currentColor" className="ml-0.5" />
      </button>
    </div>
  )
}

export interface AlbumRowProps {
  tracks: Track[]
  currentPath: string | null
  isPlaying: boolean
}

/** Horizontally scrolling square album cards, as in the reference Home view. */
export function AlbumRow({ tracks, currentPath, isPlaying }: AlbumRowProps): React.JSX.Element {
  return (
    <div className="scrollbar-none -mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
      {tracks.map((track) => {
        const active = track.path === currentPath
        return (
          <button
            key={track.path}
            type="button"
            onClick={() => player.playTrack(track, tracks)}
            className="group w-[168px] shrink-0 text-left"
          >
            <div className="relative mb-2 overflow-hidden rounded-lg shadow-[0_8px_24px_rgb(0_0_0/0.5)]">
              <Artwork
                trackId={track.id}
                hasArt={track.hasArt}
                alt={track.title}
                className="aspect-square w-full"
              />
              <span
                className={cn(
                  'absolute right-2 bottom-2 grid h-9 w-9 place-items-center rounded-full bg-accent text-black shadow-[0_8px_16px_rgb(0_0_0/0.5)] transition-all duration-200',
                  active ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100'
                )}
              >
                {active && isPlaying ? (
                  <Sparkles size={16} />
                ) : (
                  <Play size={16} fill="currentColor" className="ml-0.5" />
                )}
              </span>
            </div>
            <div
              className={cn('truncate text-[13px] font-semibold', active ? 'text-accent' : 'text-ink')}
              title={track.title}
            >
              {track.title}
            </div>
            <div className="truncate text-[12px] text-muted" title={track.artist}>
              {track.artist || 'Unknown Artist'}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}
