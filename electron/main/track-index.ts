import { createHash } from 'node:crypto'
import type { Track } from '@shared/types'
import { createJsonWriter, readJson } from './store'
import { paths } from './paths'

/**
 * Maps stable track ids to absolute file paths. The renderer addresses audio and
 * artwork through the custom protocol using only the id, so the main process
 * needs a way to turn that id back into a real file. The map is persisted so
 * playback still resolves after a restart, before the first rescan finishes.
 */
let index = new Map<string, string>()
let loaded = false

const writer = createJsonWriter<Record<string, string>>(() => paths().pathIndexFile)

export function trackIdForPath(filePath: string): string {
  return createHash('sha1').update(filePath.toLowerCase()).digest('hex').slice(0, 20)
}

export async function loadTrackIndex(): Promise<void> {
  if (loaded) return
  const stored = await readJson<Record<string, string>>(paths().pathIndexFile, {})
  index = new Map(Object.entries(stored))
  loaded = true
}

export function registerTracks(tracks: Track[]): void {
  for (const track of tracks) index.set(track.id, track.path)
  writer.schedule(Object.fromEntries(index))
}

export function registerPath(filePath: string): string {
  const id = trackIdForPath(filePath)
  index.set(id, filePath)
  return id
}

export function pathForTrackId(id: string): string | undefined {
  return index.get(id)
}

/** In-memory view of the whole library, used by the protocol handler. */
const trackCache = new Map<string, Track>()

export function setTrackCache(tracks: Track[]): void {
  trackCache.clear()
  for (const track of tracks) {
    trackCache.set(track.id, track)
    index.set(track.id, track.path)
  }
  writer.schedule(Object.fromEntries(index))
}

export function trackForId(id: string): Track | undefined {
  return trackCache.get(id)
}

export function forgetMissing(pathsSet: Set<string>): void {
  for (const [id, p] of [...index.entries()]) {
    if (!pathsSet.has(p)) index.delete(id)
  }
}
