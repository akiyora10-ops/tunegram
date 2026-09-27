import { useMemo } from 'react'
import { FolderOpen, Heart, History, ListMusic } from 'lucide-react'
import { player } from '../player/engine'
import { libraryStore } from '../state/libraryStore'
import { settingsStore } from '../state/settingsStore'
import { notifyStore } from '../state/notifyStore'
import { useLibrary, usePlayer, useRoute, useSearchQuery, useSettings } from '../hooks'
import { visibleTracks } from '../lib/selectors'
import { CollectionHeader } from '../components/CollectionHeader'
import { TrackList } from '../components/TrackList'
import { EmptyState } from '../components/EmptyState'

/**
 * Handles every track-list route: the full library, Liked Songs, Recently
 * Played, a folder, or a user playlist.
 */
export function Library(): React.JSX.Element {
  const route = useRoute()
  const library = useLibrary()
  const settings = useSettings()
  const query = useSearchQuery()
  const playerState = usePlayer()

  const tracks = useMemo(
    () => visibleTracks(library, route, query, { showUnverified: settings.showUnverified, playlists: settings.playlists }),
    [library, route, query, settings.showUnverified, settings.playlists]
  )

  const presentation = useMemo(() => {
    switch (route.kind) {
      case 'favorites':
        return {
          kind: 'playlist' as const,
          title: 'Liked Songs',
          icon: Heart,
          subtitle: 'Everything you have hearted',
          empty: 'Tracks you heart will collect here.'
        }
      case 'recent':
        return {
          kind: 'playlist' as const,
          title: 'Recently Played',
          icon: History,
          subtitle: 'Your last listens, newest first',
          empty: 'Play something and it will show up here.'
        }
      case 'folder':
        return {
          kind: 'folder' as const,
          title: route.id ?? 'Folder',
          icon: FolderOpen,
          subtitle: library.root ?? undefined,
          empty: 'No playable files in this folder.'
        }
      case 'playlist': {
        const playlist = settings.playlists.find((p) => p.id === route.id)
        return {
          kind: 'playlist' as const,
          title: playlist?.name ?? 'Playlist',
          icon: ListMusic,
          subtitle: 'Local playlist',
          empty: 'This playlist is empty. Right-click a track to add it.'
        }
      }
      default:
        return {
          kind: 'library' as const,
          title: query ? 'Search results' : 'All Songs',
          icon: ListMusic,
          subtitle: library.root ?? undefined,
          empty: query ? `Nothing matched “${query}”.` : 'No audio files found yet.'
        }
    }
  }, [route, settings.playlists, query, library.root])

  if (!library.hasScanned) return <EmptyState />

  const artTrack = route.kind === 'library' ? tracks[0] : tracks[0]
  const emptyMessage = tracks.length === 0 && library.scanning ? 'Still reading your library…' : presentation.empty

  return (
    <div className="flex min-h-0 flex-col">
      <CollectionHeader
        kind={presentation.kind}
        title={presentation.title}
        subtitle={presentation.subtitle}
        meta={library.tracks.length > 0 ? `${library.tracks.length.toLocaleString()} files scanned` : ''}
        tracks={tracks}
        artTrack={artTrack}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        {route.kind === 'playlist' ? (
          <PlaylistToolbar playlistId={route.id ?? ''} onChanged={(playlists) => settingsStore.update({ playlists })} />
        ) : null}

        {library.scanning ? <ScanningBanner /> : null}

        <TrackList
          tracks={tracks}
          sortKey={library.sort.key}
          sortDir={library.sort.dir}
          onSort={(key) => libraryStore.toggleSort(key)}
          currentPath={playerState.current?.path ?? null}
          isPlaying={playerState.isPlaying}
          showFolder={route.kind === 'library' || route.kind === 'search'}
          emptyMessage={emptyMessage}
          onRemove={route.kind === 'playlist' ? (index) => void removeFromPlaylist(route.id ?? '', index) : undefined}
        />
      </div>
    </div>
  )
}

function ScanningBanner(): React.JSX.Element {
  const library = useLibrary()
  const percent = library.progress.total > 0 ? Math.round((library.progress.scanned / library.progress.total) * 100) : 0
  return (
    <div className="mx-2 mb-2 flex items-center gap-3 rounded bg-card px-3 py-2 text-[12px] text-muted">
      <div className="h-1 w-24 overflow-hidden rounded-full bg-divider">
        <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${percent}%` }} />
      </div>
      Scanning {library.progress.scanned.toLocaleString()} of {library.progress.total.toLocaleString()} files…
    </div>
  )
}

interface PlaylistToolbarProps {
  playlistId: string
  onChanged: (playlists: ReturnType<typeof settingsStore.get>['playlists']) => void
}

function PlaylistToolbar({ playlistId, onChanged }: PlaylistToolbarProps): React.JSX.Element | null {
  const settings = useSettings()
  const playlist = settings.playlists.find((p) => p.id === playlistId)
  if (!playlist) return null

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <button
        type="button"
        onClick={async () => {
          const next = await window.tunegram.playlists.remove(playlistId)
          onChanged(next)
          notifyStore.push(`Deleted “${playlist.name}”`, 'info')
        }}
        className="rounded-full border border-divider px-3 py-1 text-[12px] font-semibold text-muted transition-colors hover:border-accent hover:text-ink"
      >
        Delete playlist
      </button>
      <button
        type="button"
        onClick={() => {
          const paths = libraryStore.get().tracks.map((t) => t.path)
          void window.tunegram.playlists.addTracks(playlistId, paths).then(onChanged)
        }}
        className="rounded-full border border-divider px-3 py-1 text-[12px] font-semibold text-muted transition-colors hover:border-accent hover:text-ink"
      >
        Add all tracks
      </button>
      <button
        type="button"
        onClick={() => {
          const order = player.getSnapshot().queue
          if (order.length > 0) player.playTracks(order, 0)
        }}
        className="rounded-full border border-divider px-3 py-1 text-[12px] font-semibold text-muted transition-colors hover:border-accent hover:text-ink"
      >
        Play queue
      </button>
    </div>
  )
}

async function removeFromPlaylist(playlistId: string, index: number): Promise<void> {
  const next = await window.tunegram.playlists.removeTrack(playlistId, index)
  settingsStore.update({ playlists: next })
}
