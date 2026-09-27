import { useMemo } from 'react'
import { useLibrary, usePlayer, useSettings } from '../hooks'
import { player } from '../player/engine'
import { formatCount, formatDurationLong } from '../lib/format'
import { recentlyAdded, recentlyPlayed, totalDuration } from '../lib/selectors'
import { AlbumRow, HomeGrid } from '../components/HomeGrid'
import { EmptyState } from '../components/EmptyState'

export function Home(): React.JSX.Element {
  const library = useLibrary()
  const settings = useSettings()
  const playerState = usePlayer()

  // The store hands out a new state object on every mutation, so `library`
  // identity is a sufficient dependency for the derived shelves.
  const recent = useMemo(() => recentlyPlayed(library, 12), [library])
  const added = useMemo(() => recentlyAdded(library, 12), [library])

  if (!library.hasScanned) return <EmptyState />

  return (
    <div className="flex flex-col gap-8 px-6 py-6">
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-ink">Good listening</h1>
            <p className="mt-1 text-[13px] text-muted">
              {formatCount(library.tracks.length, 'track')} · {formatDurationLong(totalDuration(library.tracks))}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {settings.libraryFolders.length > 1 ? (
              <span className="text-[12px] text-muted">{settings.libraryFolders.length} folders</span>
            ) : null}
            {library.root ? (
              <span className="max-w-[280px] truncate text-[12px] text-muted" title={library.root}>
                {library.root}
              </span>
            ) : null}
          </div>
        </div>

        <HomeGrid />
      </section>

      {recent.length > 0 ? (
        <section>
          <h2 className="mb-3 text-xl font-bold tracking-tight text-ink">Recently played</h2>
          <AlbumRow tracks={recent} currentPath={playerState.current?.path ?? null} isPlaying={playerState.isPlaying} />
        </section>
      ) : null}

      {added.length > 0 ? (
        <section>
          <h2 className="mb-3 text-xl font-bold tracking-tight text-ink">Recently added</h2>
          <AlbumRow tracks={added} currentPath={playerState.current?.path ?? null} isPlaying={playerState.isPlaying} />
        </section>
      ) : null}

      {recent.length === 0 && added.length === 0 ? (
        <p className="pb-4 text-center text-[13px] text-muted">
          Nothing to preview yet — open{' '}
          <button
            type="button"
            onClick={() => player.playTracks(library.tracks, 0)}
            className="text-ink underline underline-offset-2"
          >
            All Songs
          </button>{' '}
          to start listening.
        </p>
      ) : null}
    </div>
  )
}
