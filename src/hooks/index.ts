import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { AppSettings, Track } from '@shared/types'
import type { LibraryState } from '../state/libraryStore'
import type { Route } from '../state/navStore'
import type { Notice } from '../state/notifyStore'
import type { PlayerSnapshot } from '../player/engine'
import { player } from '../player/engine'
import { libraryStore } from '../state/libraryStore'
import { navStore } from '../state/navStore'
import { notifyStore } from '../state/notifyStore'
import { settingsStore } from '../state/settingsStore'

export function useSettings(): AppSettings {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.get)
}

export function useLibrary(): LibraryState {
  return useSyncExternalStore(libraryStore.subscribe, libraryStore.get, libraryStore.get)
}

export function usePlayer(): PlayerSnapshot {
  return useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot)
}

export function useRoute(): Route {
  return useSyncExternalStore(navStore.subscribe, navStore.get, navStore.get)
}

export function useSearchQuery(): string {
  return useSyncExternalStore(navStore.subscribe, navStore.query, navStore.query)
}

export function useNotices(): Notice[] {
  return useSyncExternalStore(notifyStore.subscribe, notifyStore.get, notifyStore.get)
}

/**
 * Plays a slice of tracks, resuming from the track that is already playing when
 * the user clicks a row inside the queue that is already loaded.
 */
export function usePlaySlice(): (tracks: Track[], index: number) => void {
  return useCallback((tracks: Track[], index: number) => {
    const snapshot = player.getSnapshot()
    const target = tracks[index]
    if (!target) return
    if (snapshot.current?.path === target.path && snapshot.queue.length > 0) {
      player.togglePlay()
      return
    }
    player.playTracks(tracks, index)
  }, [])
}

export function useDoubleClickToPlay(): (tracks: Track[]) => (index: number) => void {
  return useCallback(
    (tracks: Track[]) => (index: number) => {
      player.playTracks(tracks, index)
    },
    []
  )
}

/** Subscribes to a window event for the lifetime of the component. */
export function useEvent(type: string, handler: () => void): void {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  }, [handler])
  useEffect(() => {
    const listener = (): void => ref.current()
    window.addEventListener(type, listener)
    return () => window.removeEventListener(type, listener)
  }, [type])
}

export function useDebouncedValue<T>(value: T, delay = 150): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = (): void => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}

export interface DragSortState {
  from: number
  to: number
}

export function useDragSort(onReorder: (from: number, to: number) => void): {
  drag: DragSortState | null
  handlers: (index: number) => {
    onDragStart: () => void
    onDragOver: (event: React.DragEvent) => void
    onDrop: () => void
    onDragEnd: () => void
  }
} {
  const [drag, setDrag] = useState<DragSortState | null>(null)

  const handlers = useCallback(
    (index: number) => ({
      onDragStart: () => setDrag({ from: index, to: index }),
      onDragOver: (event: React.DragEvent) => {
        event.preventDefault()
        setDrag((current) => (current && current.to !== index ? { ...current, to: index } : current))
      },
      onDrop: () => {
        setDrag((current) => {
          if (current && current.from !== current.to) onReorder(current.from, current.to)
          return null
        })
      },
      onDragEnd: () => setDrag(null)
    }),
    [onReorder]
  )

  return useMemo(() => ({ drag, handlers }), [drag, handlers])
}
