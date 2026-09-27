import { useMemo } from 'react'
import { Search as SearchIcon } from 'lucide-react'
import { player } from '../player/engine'
import { libraryStore } from '../state/libraryStore'
import { useLibrary, usePlayer, useSearchQuery, useSettings } from '../hooks'
import { searchTracks, totalDuration } from '../lib/selectors'
import { formatCount, formatDurationLong } from '../lib/format'
import { CollectionHeader } from '../components/CollectionHeader'
import { TrackList } from '../components/TrackList'
import { EmptyState } from '../components/EmptyState'

/** Live client-side search across title, artist, album, file name and folder. */
export function Search(): React.JSX.Element {
  const library = useLibrary()
  const settings = useSettings()
  const query = useSearchQuery()
  const playerState = usePlayer()

  const results = useMemo(() => {
    const all = searchTracks(library, query, 500)
    return settings.showUnverified ? all : all.filter((t) => t.verified)
  }, [library, query, settings.showUnverified])

  if (!library.hasScanned) return <EmptyState />

  if (query.trim() === '') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <SearchIcon size={30} className="text-muted" />
        <h1 className="text-xl font-bold text-ink">Search your library</h1>
        <p className="max-w-sm text-[13px] leading-relaxed text-muted">
          Type in the box above to filter {formatCount(library.tracks.length, 'track')} by title, artist, album, file
          name or folder. Everything runs locally — nothing leaves your machine.
        </p>
        {library.tracks.length > 0 ? (
          <button
            type="button"
            onClick={() => player.playTracks(library.tracks, 0)}
            className="mt-2 rounded-full bg-accent px-5 py-2 text-[13px] font-bold text-black transition-colors hover:bg-accent-hover"
          >
            Play everything
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-col">
      <CollectionHeader
        kind="library"
        title="Search"
        subtitle={`${formatCount(results.length, 'result')} · ${formatDurationLong(totalDuration(results))}`}
        meta={`for “${query.trim()}”`}
        tracks={results}
        artTrack={results[0]}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        <TrackList
          tracks={results}
          sortKey={library.sort.key}
          sortDir={library.sort.dir}
          onSort={(key) => libraryStore.toggleSort(key)}
          currentPath={playerState.current?.path ?? null}
          isPlaying={playerState.isPlaying}
          showFolder
          emptyMessage={`Nothing matched “${query.trim()}”. Try a different spelling, or clear the search to browse everything.`}
        />
      </div>
    </div>
  )
}
