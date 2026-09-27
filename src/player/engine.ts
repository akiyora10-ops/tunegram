import type { PlaybackFailure, RepeatMode, Track } from '@shared/types'
import { libraryStore } from '../state/libraryStore'
import { notifyStore } from '../state/notifyStore'
import { settingsStore } from '../state/settingsStore'

export type PlayerEvent = 'songchange' | 'onplaypause' | 'onprogress' | 'onerror' | 'queuechange'

export interface PlayerSnapshot {
  current: Track | null
  isPlaying: boolean
  isLoading: boolean
  positionMs: number
  durationMs: number
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
  /** Play order as queue indices; a permutation when shuffle is on. */
  order: number[]
  /** Position of the current track inside `order`. */
  orderPos: number
  queue: Track[]
  error: PlaybackFailure | null
}

type Listener = () => void

const PROGRESS_INTERVAL_MS = 120

/**
 * Owns the single `<audio>` element and all playback state.
 *
 * Deliberately framework-free: React reads it through `usePlayer`, and the
 * Spicetify shim talks to the very same instance, so extensions control exactly
 * the same playback the UI does.
 */
class PlayerEngine {
  private audio: HTMLAudioElement
  private state: PlayerSnapshot
  private listeners = new Set<Listener>()
  private eventListeners = new Map<PlayerEvent, Set<(payload?: unknown) => void>>()
  private rafId: number | null = null
  private lastEmit = 0
  /** Tracks whose transcode fallback has already been tried this session. */
  private transcodeAttempted = new Set<string>()
  private pendingSeekMs: number | null = null

  constructor() {
    this.audio = new Audio()
    this.audio.preload = 'auto'
    this.audio.volume = settingsStore.get().volume
    this.audio.muted = settingsStore.get().muted

    this.state = {
      current: null,
      isPlaying: false,
      isLoading: false,
      positionMs: 0,
      durationMs: 0,
      volume: this.audio.volume,
      muted: this.audio.muted,
      shuffle: settingsStore.get().shuffle,
      repeat: settingsStore.get().repeat,
      order: [],
      orderPos: -1,
      queue: [],
      error: null
    }

    this.attachMediaListeners()
  }

  // --- subscription ------------------------------------------------------

  getSnapshot = (): PlayerSnapshot => this.state

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Spicetify-style event bus: `songchange`, `onplaypause`, `onprogress`. */
  on(event: PlayerEvent, cb: (payload?: unknown) => void): () => void {
    const set = this.eventListeners.get(event) ?? new Set()
    set.add(cb)
    this.eventListeners.set(event, set)
    return () => set.delete(cb)
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }

  private fire(event: PlayerEvent, payload?: unknown): void {
    const set = this.eventListeners.get(event)
    if (!set) return
    for (const cb of [...set]) {
      try {
        cb(payload)
      } catch (error) {
        console.error(`[player] listener for ${event} threw:`, error)
      }
    }
  }

  private patch(patch: Partial<PlayerSnapshot>, silent = false): void {
    this.state = { ...this.state, ...patch }
    if (!silent) this.emit()
  }

  // --- media element wiring ---------------------------------------------

  private attachMediaListeners(): void {
    const audio = this.audio

    audio.addEventListener('loadstart', () => this.patch({ isLoading: true }))

    audio.addEventListener('loadedmetadata', () => {
      this.patch({ durationMs: Number.isFinite(audio.duration) ? audio.duration * 1000 : 0 })
      if (this.pendingSeekMs !== null) {
        const target = this.pendingSeekMs
        this.pendingSeekMs = null
        if (target > 0) this.seek(target)
      }
    })

    audio.addEventListener('canplay', () => this.patch({ isLoading: false }))

    audio.addEventListener('play', () => {
      this.patch({ isPlaying: true, isLoading: false })
      this.fire('onplaypause', true)
      this.startProgressLoop()
    })

    audio.addEventListener('pause', () => {
      this.patch({ isPlaying: false })
      this.stopProgressLoop()
      this.fire('onplaypause', false)
    })

    audio.addEventListener('timeupdate', () => this.publishProgress())

    audio.addEventListener('durationchange', () => {
      this.patch({ durationMs: Number.isFinite(audio.duration) ? audio.duration * 1000 : 0 })
    })

    audio.addEventListener('volumechange', () => {
      this.patch({ volume: audio.volume, muted: audio.muted })
    })

    audio.addEventListener('ended', () => this.handleEnded())

    audio.addEventListener('error', () => void this.handleMediaError())
  }

  private publishProgress(force = false): void {
    const now = Date.now()
    if (!force && now - this.lastEmit < PROGRESS_INTERVAL_MS) return
    this.lastEmit = now
    this.patch({ positionMs: this.audio.currentTime * 1000 })
    this.fire('onprogress', this.state.positionMs)
  }

  private startProgressLoop(): void {
    if (this.rafId !== null) return
    const tick = (): void => {
      this.publishProgress()
      this.rafId = this.audio.paused ? null : requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  private stopProgressLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.lastEmit = 0
  }

  // --- queue -------------------------------------------------------------

  /** Replaces the queue and starts playing `startIndex` within `tracks`. */
  playTracks(tracks: Track[], startIndex = 0, autoplay = true): void {
    if (tracks.length === 0) return
    const index = Math.max(0, Math.min(tracks.length - 1, startIndex))
    const order = this.buildOrder(tracks.length, tracks[index].path)
    this.patch(
      {
        queue: [...tracks],
        order,
        orderPos: index,
        current: tracks[index],
        error: null,
        positionMs: 0,
        durationMs: tracks[index].duration * 1000
      },
      true
    )
    this.emit()
    this.loadCurrent(autoplay)
    this.fire('songchange', tracks[index])
    this.fire('queuechange')
    void libraryStore.markPlayed(tracks[index].path)
  }

  playTrack(track: Track, context?: Track[], autoplay = true): void {
    if (context && context.length > 0) {
      const index = context.findIndex((t) => t.path === track.path)
      this.playTracks(context, index >= 0 ? index : 0, autoplay)
      return
    }
    this.playTracks([track], 0, autoplay)
  }

  /** Loads (and optionally plays) whatever `current` points at. */
  private loadCurrent(autoplay: boolean): void {
    const track = this.state.current
    if (!track) return
    this.audio.src = window.tunegram.playback.mediaUrl(track.id)
    this.audio.load()
    if (autoplay) {
      const attempt = this.audio.play()
      if (attempt) {
        attempt.catch((error: DOMException) => {
          if (error.name === 'NotAllowedError') {
            // Autoplay was blocked (can happen right after a window regains
            // focus); leave the track cued so the next click starts it.
            this.patch({ isPlaying: false, isLoading: false })
            return
          }
          void this.handleMediaError()
        })
      }
    }
  }

  private buildOrder(length: number, currentPath: string | null): number[] {
    const order = Array.from({ length }, (_, i) => i)
    if (!this.state.shuffle || length < 2) return order
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    if (currentPath) {
      const currentQueueIndex = this.state.queue.findIndex((t) => t.path === currentPath)
      if (currentQueueIndex >= 0) {
        const at = order.indexOf(currentQueueIndex)
        if (at > 0) {
          order.splice(at, 1)
          order.unshift(currentQueueIndex)
        }
      }
    }
    return order
  }

  // --- transport ---------------------------------------------------------

  togglePlay(): void {
    if (!this.state.current) {
      const first = this.state.queue[0] ?? libraryStore.get().tracks[0]
      if (first) this.playTrack(first)
      return
    }
    if (this.audio.paused) {
      const attempt = this.audio.play()
      if (attempt) attempt.catch(() => this.patch({ isPlaying: false }))
    } else {
      this.audio.pause()
    }
  }

  play(): void {
    if (this.audio.paused) {
      const attempt = this.audio.play()
      if (attempt) attempt.catch(() => undefined)
    }
  }

  pause(): void {
    this.audio.pause()
  }

  next(userInitiated = true): void {
    const { order, orderPos, repeat } = this.state
    if (order.length === 0) return
    void userInitiated

    if (orderPos >= order.length - 1) {
      // Past the last track: only repeat modes keep going.
      if (repeat === 'off') {
        this.seek(0)
        this.pause()
        return
      }
      if (repeat === 'one') {
        this.seek(0)
        this.play()
        return
      }
    }
    this.gotoPosition(orderPos + 1)
  }

  back(): void {
    // Match the familiar behaviour: restart the track first, then skip back.
    if (this.audio.currentTime > 3) {
      this.seek(0)
      return
    }
    this.previous()
  }

  previous(): void {
    const { order, orderPos, repeat } = this.state
    if (order.length === 0) return
    if (orderPos <= 0) {
      this.seek(0)
      return
    }
    if (repeat === 'one' && orderPos === order.length - 1) {
      this.gotoPosition(orderPos)
      return
    }
    this.gotoPosition(orderPos - 1)
  }

  private gotoPosition(position: number): void {
    const { order, queue } = this.state
    if (order.length === 0) return
    const clamped = ((position % order.length) + order.length) % order.length
    const track = queue[order[clamped]]
    if (!track) return
    const wasPlaying = this.state.isPlaying || this.state.isLoading
    this.patch({ orderPos: clamped, current: track, error: null, positionMs: 0, durationMs: track.duration * 1000 }, true)
    this.emit()
    this.loadCurrent(wasPlaying)
    this.fire('songchange', track)
    void libraryStore.markPlayed(track.path)
  }

  private handleEnded(): void {
    if (this.state.repeat === 'one') {
      this.seek(0)
      this.play()
      return
    }
    const wasPlaying = this.state.isPlaying
    this.next(false)
    if (!wasPlaying) this.pause()
  }

  // --- seeking -----------------------------------------------------------

  seek(ms: number): void {
    const duration = this.state.durationMs || (Number.isFinite(this.audio.duration) ? this.audio.duration * 1000 : 0)
    const target = Math.max(0, duration > 0 ? Math.min(ms, duration) : ms)
    if (!Number.isFinite(this.audio.duration)) {
      this.pendingSeekMs = target
      return
    }
    try {
      this.audio.currentTime = target / 1000
    } catch (error) {
      console.warn('[player] seek failed', error)
    }
    this.patch({ positionMs: target })
    this.fire('onprogress', target)
  }

  seekRatio(ratio: number): void {
    const clamped = Math.max(0, Math.min(1, ratio))
    this.seek(clamped * this.state.durationMs)
  }

  getProgress(): number {
    return this.state.positionMs
  }

  getDuration(): number {
    return this.state.durationMs
  }

  // --- volume / modes ----------------------------------------------------

  /**
   * Applies persisted preferences at startup without writing them straight
   * back to disk (the values came from there in the first place).
   */
  applySettings(settings: { volume: number; muted: boolean; shuffle: boolean; repeat: RepeatMode }): void {
    this.audio.volume = settings.volume
    this.audio.muted = settings.muted
    const order = this.buildOrder(this.state.queue.length, this.state.current?.path ?? null)
    this.patch({
      volume: settings.volume,
      muted: settings.muted,
      shuffle: settings.shuffle,
      repeat: settings.repeat,
      order: this.state.order.length > 0 ? order : this.state.order
    })
  }

  setVolume(value: number): void {
    const clamped = Math.max(0, Math.min(1, value))
    this.audio.volume = clamped
    this.patch({ volume: clamped, muted: clamped === 0 ? this.audio.muted : false })
    if (clamped > 0 && this.audio.muted) this.audio.muted = false
    settingsStore.update({ volume: clamped })
  }

  setMuted(muted: boolean): void {
    this.audio.muted = muted
    this.patch({ muted })
    settingsStore.update({ muted })
  }

  toggleMute(): void {
    this.setMuted(!this.audio.muted)
  }

  setShuffle(shuffle: boolean): void {
    const { queue, current } = this.state
    const currentIndex = current ? queue.findIndex((t) => t.path === current.path) : -1
    const order = shuffle ? this.buildOrder(queue.length, current?.path ?? null) : queue.map((_, i) => i)
    this.patch({ shuffle, order, orderPos: currentIndex })
    settingsStore.update({ shuffle })
  }

  toggleShuffle(): void {
    this.setShuffle(!this.state.shuffle)
  }

  setRepeat(repeat: RepeatMode): void {
    this.patch({ repeat })
    settingsStore.update({ repeat })
  }

  cycleRepeat(): void {
    const order: RepeatMode[] = ['off', 'all', 'one']
    const next = order[(order.indexOf(this.state.repeat) + 1) % order.length]
    this.setRepeat(next)
  }

  // --- queue editing -----------------------------------------------------

  /** Appends tracks to the end of the queue. */
  addToQueue(tracks: Track[]): void {
    if (tracks.length === 0) return
    const queue = [...this.state.queue, ...tracks]
    if (this.state.order.length === 0) {
      this.patch({ queue, order: queue.map((_, i) => i), orderPos: 0, current: queue[0] })
      this.emit()
      this.loadCurrent(false)
      this.fire('songchange', queue[0])
      this.fire('queuechange')
      return
    }
    const appended = tracks.map((t) => queue.findIndex((q) => q.path === t.path)).filter((i) => i >= 0)
    this.patch({ queue, order: [...this.state.order, ...appended] })
    this.emit()
    this.fire('queuechange')
  }

  /** Inserts tracks directly after the current one. */
  playNextIn(tracks: Track[]): void {
    if (tracks.length === 0) return
    const queue = [...this.state.queue, ...tracks]
    const order = this.state.order.length > 0 ? [...this.state.order] : queue.map((_, i) => i)
    const newIndexes = tracks.map((t) => queue.findIndex((q) => q.path === t.path)).filter((i) => i >= 0)
    order.splice(this.state.orderPos + 1, 0, ...newIndexes)
    this.patch({ queue, order })
    this.emit()
    this.fire('queuechange')
  }

  /** Removes the queue entry at play-position `position`. */
  removeFromQueue(position: number): void {
    const { order, orderPos, queue } = this.state
    if (position < 0 || position >= order.length) return

    const queueIndex = order[position]
    const remaining = queue.filter((_, i) => i !== queueIndex)
    const newOrder = order.filter((_, i) => i !== position)

    if (position !== orderPos) {
      this.patch({
        queue: remaining,
        order: newOrder,
        orderPos: orderPos > position ? orderPos - 1 : orderPos
      })
      this.emit()
      this.fire('queuechange')
      return
    }

    if (newOrder.length === 0) {
      this.audio.pause()
      this.audio.removeAttribute('src')
      this.patch({
        queue: [],
        order: [],
        orderPos: -1,
        current: null,
        positionMs: 0,
        durationMs: 0,
        isPlaying: false,
        isLoading: false
      })
      this.emit()
      this.fire('queuechange')
      return
    }

    // Removing the playing track: hand off to whatever slides into its place.
    const wasPlaying = this.state.isPlaying
    const newPos = Math.min(position, newOrder.length - 1)
    const nextTrack = remaining[newOrder[newPos]]
    this.patch(
      {
        queue: remaining,
        order: newOrder,
        orderPos: newPos,
        current: nextTrack,
        positionMs: 0,
        durationMs: nextTrack.duration * 1000,
        error: null
      },
      true
    )
    this.emit()
    this.loadCurrent(wasPlaying)
    this.fire('songchange', nextTrack)
    this.fire('queuechange')
  }

  moveInQueue(from: number, to: number): void {
    const { order, orderPos } = this.state
    if (from === to || from < 0 || from >= order.length) return
    const next = [...order]
    const [moved] = next.splice(from, 1)
    next.splice(Math.max(0, Math.min(next.length, to)), 0, moved)
    const newPos = orderPos === from ? to : orderPos > from && to < orderPos ? orderPos - 1 : orderPos < from && to > orderPos ? orderPos + 1 : orderPos
    this.patch({ order: next, orderPos: newPos })
    this.emit()
    this.fire('queuechange')
  }

  clearQueue(keepCurrent = true): void {
    const current = this.state.current
    if (!keepCurrent || !current) {
      this.audio.pause()
      this.audio.removeAttribute('src')
      this.patch({ queue: [], order: [], orderPos: -1, current: null, positionMs: 0, durationMs: 0, isPlaying: false })
      this.emit()
      this.fire('queuechange')
      return
    }
    const index = this.state.queue.findIndex((t) => t.path === current.path)
    this.patch({ queue: [current], order: [index], orderPos: 0 })
    this.emit()
    this.fire('queuechange')
  }

  jumpTo(position: number): void {
    if (position < 0 || position >= this.state.order.length) return
    this.gotoPosition(position)
  }

  // --- failures ----------------------------------------------------------

  private async handleMediaError(): Promise<void> {
    const track = this.state.current
    const code = this.audio.error?.code
    const message = this.audio.error?.message || describeMediaError(code)

    if (!track) {
      this.patch({ isLoading: false, isPlaying: false })
      return
    }

    if (code === MediaError.MEDIA_ERR_DECODE || code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED || code === MediaError.MEDIA_ERR_NETWORK) {
      if (!this.transcodeAttempted.has(track.path)) {
        this.transcodeAttempted.add(track.path)
        const result = await window.tunegram.playback.transcode(track.id)
        if (result.ok) {
          notifyStore.push(`Converting “${track.title}” so it can play…`, 'info')
          this.loadCurrent(true)
          return
        }
        this.fail(track, {
          code: 'unsupported-format',
          message: result.reason,
          tryTranscode: true
        })
        return
      }
    }

    this.fail(track, {
      code: code === MediaError.MEDIA_ERR_NETWORK ? 'media-error' : 'unsupported-format',
      message,
      tryTranscode: true
    })
  }

  private fail(track: Track, failure: PlaybackFailure): void {
    this.patch({ isLoading: false, isPlaying: false, error: failure })
    this.fire('onerror', failure)
    notifyStore.push(
      `Can't play “${track.title}”`,
      'error',
      `${failure.message} The file is still listed in your library.`
    )
  }

  clearError(): void {
    if (this.state.error) this.patch({ error: null })
  }

  /** Retries the current track after a failure (used by the "try again" toast). */
  retry(): void {
    const track = this.state.current
    if (!track) return
    this.transcodeAttempted.delete(track.path)
    this.patch({ error: null })
    this.loadCurrent(true)
  }
}

function describeMediaError(code: number | undefined): string {
  switch (code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'Playback was cancelled.'
    case MediaError.MEDIA_ERR_NETWORK:
      return 'The file could not be read.'
    case MediaError.MEDIA_ERR_DECODE:
      return 'This format could not be decoded.'
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'This format is not supported by the built-in player.'
    default:
      return 'Unknown playback error.'
  }
}

export const player = new PlayerEngine()
