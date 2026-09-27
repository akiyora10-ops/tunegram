import type { Track } from '@shared/types'

/** Events a plugin can subscribe to via `Spicetify.Player.addEventListener`. */
export type SpicetifyPlayerEvent = 'songchange' | 'onplaypause' | 'onprogress' | 'onerror' | 'queuechange'

export interface SpicetifyTrack {
  id: string
  name: string
  uri: string
  path: string
  artist: { name: string }
  album: { name: string }
  duration: number
  isLocal: true
  ext: string
  hasArt: boolean
  raw: Track
}

export interface SpicetifyPlayerApi {
  play(): void
  pause(): void
  togglePlay(): void
  next(): void
  back(): void
  seek(ms: number): void
  seekRatio(ratio: number): void
  getProgress(): number
  getDuration(): number
  isPlaying(): boolean
  getVolume(): number
  setVolume(value: number): void
  getQueue(): SpicetifyTrack[]
  /** Snapshot of the currently loaded track, or null. */
  data: SpicetifyTrack | null
  addEventListener(event: SpicetifyPlayerEvent, cb: (payload?: unknown) => void): () => void
  removeEventListener(event: SpicetifyPlayerEvent, cb: (payload?: unknown) => void): void
}

export interface SpicetifyButtonApi {
  /** Show the button in the mini-player instead of the top bar. */
  playbar: boolean
}

export interface SpicetifyLocalStorageApi {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
  clear(): void
}

export interface SpicetifyConfig {
  version: string
  appName: string
  platform: string
  apiVersion: string
  /** Documents what this shim does not implement. */
  unsupported: string[]
}

export interface SpicetifyApi {
  Player: SpicetifyPlayerApi
  Playbar: {
    Button(options: {
      icon?: string
      label?: string
      onClick: () => void
      playbar?: boolean
    }): { remove(): void }
  }
  Topbar: {
    Button(options: {
      icon?: string
      label?: string
      onClick: () => void
    }): { remove(): void }
  }
  showNotification(message: string, durationMs?: number): void
  LocalStorage: SpicetifyLocalStorageApi
  Config: SpicetifyConfig
  /** TuneGram additions, namespaced so they cannot collide with Spicetify's. */
  Utils: {
    parseHTML(html: string): DocumentFragment
    debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T
  }
}
