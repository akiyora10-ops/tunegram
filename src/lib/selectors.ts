import type { Playlist, Track, TrackSort, TrackSortKey } from '@shared/types'
import type { LibraryState } from '../state/libraryStore'
import type { Route } from '../state/navStore'

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function compareTracks(a: Track, b: Track, key: TrackSortKey, dir: 'asc' | 'desc'): number {
  const sign = dir === 'asc' ? 1 : -1
  let result: number
  switch (key) {
    case 'duration':
      result = a.duration - b.duration
      break
    case 'addedAt':
      result = a.modifiedMs - b.modifiedMs
      break
    case 'playCount':
      result = a.playCount - b.playCount
      break
    case 'lastPlayedAt':
      result = (a.lastPlayedAt ?? 0) - (b.lastPlayedAt ?? 0)
      break
    case 'album':
      result = collator.compare(a.album || '￿', b.album || '￿')
      break
    case 'artist':
      result = collator.compare(a.artist || '￿', b.artist || '￿')
      break
    case 'fileName':
      result = collator.compare(a.fileName, b.fileName)
      break
    case 'title':
    default:
      result = collator.compare(a.title, b.title)
      break
  }
  if (result === 0) result = collator.compare(a.artist, b.artist)
  return result * sign
}

export function sortTracks(tracks: Track[], sort: TrackSort): Track[] {
  return [...tracks].sort((a, b) => compareTracks(a, b, sort.key, sort.dir))
}

export interface SliceOptions {
  showUnverified: boolean
  playlists: Playlist[]
}

export function visibleTracks(state: LibraryState, route: Route, query: string, options: SliceOptions): Track[] {
  let pool: Track[]

  switch (route.kind) {
    case 'favorites':
      pool = state.tracks.filter((t) => t.favorite)
      break
    case 'recent':
      pool = state.tracks.filter((t) => t.lastPlayedAt !== null)
      break
    case 'folder':
      pool = state.tracks.filter((t) => t.folder === route.id)
      break
    case 'playlist': {
      const playlist = options.playlists.find((p) => p.id === route.id)
      pool = playlist
        ? playlist.trackPaths.map((path) => state.byPath.get(path)).filter((t): t is Track => !!t)
        : []
      break
    }
    case 'search':
    case 'library':
    default:
      pool = state.tracks
      break
  }

  if (!options.showUnverified) pool = pool.filter((t) => t.verified)

  const needle = query.trim().toLowerCase()
  if (needle) pool = pool.filter((t) => matches(t, needle))

  return sortTracks(pool, state.sort)
}

export function matches(track: Track, needle: string): boolean {
  if (track.title.toLowerCase().includes(needle)) return true
  if (track.artist.toLowerCase().includes(needle)) return true
  if (track.album.toLowerCase().includes(needle)) return true
  if (track.fileName.toLowerCase().includes(needle)) return true
  if (track.folder.toLowerCase().includes(needle)) return true
  return false
}

export function searchTracks(state: LibraryState, query: string, limit = 200): Track[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const out: Track[] = []
  for (const track of state.tracks) {
    if (matches(track, needle)) {
      out.push(track)
      if (out.length >= limit) break
    }
  }
  return out
}

export function recentlyAdded(state: LibraryState, limit = 12): Track[] {
  return [...state.tracks].sort((a, b) => b.modifiedMs - a.modifiedMs).slice(0, limit)
}

export function recentlyPlayed(state: LibraryState, limit = 12): Track[] {
  return state.tracks
    .filter((t) => t.lastPlayedAt !== null)
    .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
    .slice(0, limit)
}

export function totalDuration(tracks: Track[]): number {
  return tracks.reduce((sum, t) => sum + (t.duration || 0), 0)
}
