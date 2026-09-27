import type { LibraryFolder, ScanError, ScanResult, Track, TrackSort, TrackSortKey } from '@shared/types'
import { notifyStore } from './notifyStore'

type Listener = () => void

export interface ScanProgress {
  active: boolean
  scanned: number
  total: number
  current: string
}

export interface LibraryState {
  root: string | null
  tracks: Track[]
  byPath: Map<string, Track>
  folders: LibraryFolder[]
  errors: ScanError[]
  stats: ScanResult['stats'] | null
  scanning: boolean
  progress: ScanProgress
  hasScanned: boolean
  sort: TrackSort
  /** Bumped whenever a track's mutable fields (favourite, play count) change. */
  revision: number
}

/**
 * Single source of truth for the music library. Slices (`All Songs`, `Favorites`,
 * one folder, …) are derived on demand by the selectors in `selectors.ts`.
 */
class LibraryStore {
  private state: LibraryState = {
    root: null,
    tracks: [],
    byPath: new Map(),
    folders: [],
    errors: [],
    stats: null,
    scanning: false,
    progress: { active: false, scanned: 0, total: 0, current: '' },
    hasScanned: false,
    sort: { key: 'title', dir: 'asc' },
    revision: 0
  }

  private listeners = new Set<Listener>()

  get = (): LibraryState => this.state

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }

  private set(patch: Partial<LibraryState>): void {
    this.state = { ...this.state, ...patch }
    this.emit()
  }

  setSort(sort: TrackSort): void {
    this.set({ sort })
  }

  /** Clears the in-flight scan flag when main reports it stopped. */
  finishScanning(): void {
    this.set({ scanning: false, progress: { active: false, scanned: 0, total: 0, current: '' } })
  }

  toggleSort(key: TrackSortKey): void {
    const current = this.state.sort
    this.set({ sort: { key, dir: current.key === key && current.dir === 'asc' ? 'desc' : 'asc' } })
  }

  applyScan(result: ScanResult | null): void {
    if (!result) return
    const byPath = new Map<string, Track>()
    for (const track of result.tracks) byPath.set(track.path, track)
    this.set({
      root: result.root,
      tracks: result.tracks,
      byPath,
      folders: result.folders,
      errors: result.errors,
      stats: result.stats,
      hasScanned: true,
      scanning: false,
      progress: { active: false, scanned: 0, total: 0, current: '' }
    })
  }

  setProgress(scanned: number, total: number, current: string): void {
    this.set({
      scanning: total > 0,
      progress: { active: total > 0, scanned, total, current }
    })
  }

  async scan(root?: string): Promise<ScanResult | null> {
    this.set({ scanning: true })
    try {
      const result = await window.tunegram.library.scan(root)
      if (result) this.applyScan(result)
      else this.set({ scanning: false, hasScanned: true, progress: { active: false, scanned: 0, total: 0, current: '' } })
      return result
    } catch (error) {
      this.set({ scanning: false })
      notifyStore.push(`Scan failed: ${error instanceof Error ? error.message : String(error)}`, 'error')
      return null
    }
  }

  async rescan(): Promise<ScanResult | null> {
    try {
      const result = await window.tunegram.library.rescan()
      this.applyScan(result)
      return result
    } catch (error) {
      notifyStore.push(`Rescan failed: ${error instanceof Error ? error.message : String(error)}`, 'error')
      return null
    }
  }

  trackByPath(path: string): Track | undefined {
    return this.state.byPath.get(path)
  }

  tracksByPaths(paths: string[]): Track[] {
    const out: Track[] = []
    for (const path of paths) {
      const track = this.state.byPath.get(path)
      if (track) out.push(track)
    }
    return out
  }

  /** Applies a favourite change locally and persists it. */
  async toggleFavorite(path: string): Promise<boolean> {
    const track = this.state.byPath.get(path)
    if (!track) return false
    const favorite = !track.favorite
    this.patchTrack(path, { favorite })
    try {
      await window.tunegram.library.setFavorite({ path, favorite })
    } catch (error) {
      console.error('[library] could not save favourite', error)
    }
    return favorite
  }

  patchTrack(path: string, patch: Partial<Track>): void {
    const existing = this.state.byPath.get(path)
    if (!existing) return
    const updated: Track = { ...existing, ...patch }
    const tracks = this.state.tracks.map((t) => (t.path === path ? updated : t))
    const byPath = new Map(this.state.byPath)
    byPath.set(path, updated)
    this.set({ tracks, byPath, revision: this.state.revision + 1 })
  }

  async markPlayed(path: string, increment = true): Promise<void> {
    const track = this.state.byPath.get(path)
    if (!track) return
    this.patchTrack(path, {
      playCount: track.playCount + (increment ? 1 : 0),
      lastPlayedAt: Date.now()
    })
    try {
      await window.tunegram.library.markPlayed({ path, increment })
    } catch (error) {
      console.error('[library] could not record play', error)
    }
  }

  /** Replaces the playlist list after a mutation, keeping settings in sync. */
  setPlaylists(playlists: import('@shared/types').Playlist[]): void {
    void window.tunegram.settings.set({ playlists })
  }
}

export const libraryStore = new LibraryStore()

/** Wires the main-process progress stream into the store. */
export function connectLibraryEvents(): void {
  window.tunegram.library.onScanProgress(({ scanned, total, current }) => {
    if (total === 0 && scanned === 0) {
      libraryStore.finishScanning()
    } else {
      libraryStore.setProgress(scanned, total, current)
    }
  })
}
