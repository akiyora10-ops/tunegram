export type TrackSortKey =
  | 'title'
  | 'artist'
  | 'album'
  | 'duration'
  | 'addedAt'
  | 'playCount'
  | 'lastPlayedAt'
  | 'fileName'

export type SortDirection = 'asc' | 'desc'

export interface TrackSort {
  key: TrackSortKey
  dir: SortDirection
}

/**
 * A single audio file discovered in the library. Every field the UI needs is
 * resolved in the main process so the renderer never touches the filesystem.
 */
export interface Track {
  /** Stable id derived from the absolute path. */
  id: string
  path: string
  fileName: string
  /** Lower-case extension including the leading dot, e.g. `.mp3`. */
  ext: string
  sizeBytes: number
  modifiedMs: number
  /** Top-level folder name relative to the library root ("" for loose files). */
  folder: string
  /** Absolute path of the containing directory. */
  folderPath: string
  title: string
  artist: string
  album: string
  year: number | null
  genre: string | null
  trackNo: number | null
  discNo: number | null
  /** Seconds. 0 when unknown. */
  duration: number
  hasArt: boolean
  codec: string | null
  bitrate: number | null
  sampleRate: number | null
  channels: number | null
  /**
   * True when the extension is on the known-audio list. Unverified files are
   * still listed (nothing silently disappears) but are badged in the UI and
   * may need the ffmpeg transcode fallback to play.
   */
  verified: boolean
  addedAt: number
  playCount: number
  lastPlayedAt: number | null
  favorite: boolean
}

export interface LibraryFolder {
  name: string
  path: string
  trackCount: number
}

export interface ScanError {
  path: string
  message: string
}

export interface ScanStats {
  filesFound: number
  audioFiles: number
  unverifiedFiles: number
  unreadableFiles: number
  durationMs: number
  usedCache: number
}

export interface ScanResult {
  root: string
  tracks: Track[]
  folders: LibraryFolder[]
  errors: ScanError[]
  stats: ScanStats
}

export type RepeatMode = 'off' | 'all' | 'one'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface AppSettings {
  libraryFolders: string[]
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
  windowBounds: WindowBounds | null
  maximized: boolean
  showUnverified: boolean
  theme: string
  enabledThemes: string[]
  disabledPlugins: string[]
  defaultSort: TrackSort
  playlists: Playlist[]
  lastFolder: string | null
}

export interface Playlist {
  id: string
  name: string
  /** Absolute track paths, in play order. */
  trackPaths: string[]
  createdAt: number
  updatedAt: number
}

export interface TrackStatePatch {
  path: string
  favorite?: boolean
  /** Total play count; merged with any existing value. */
  playCount?: number
  playCountDelta?: number
  playedAt?: number | null
}

export type AddonKind = 'plugin' | 'theme'

export interface AddonInfo {
  kind: AddonKind
  id: string
  fileName: string
  path: string
  enabled: boolean
  sizeBytes: number
  modifiedMs: number
  /** Populated for plugins: the first doc comment or `name` field found. */
  description: string | null
  error: string | null
}

export type TranscodeResult =
  | { ok: true; url: string; cachedFile: string; via: 'ffmpeg' | 'cache' }
  | { ok: false; reason: string }

export type PlaybackFailure =
  | { code: 'unsupported-format'; message: string; tryTranscode: boolean }
  | { code: 'missing-file'; message: string; tryTranscode: boolean }
  | { code: 'media-error'; message: string; tryTranscode: boolean }

export interface PlatformInfo {
  os: string
  appVersion: string
  electronVersion: string
  chromeVersion: string
  userDataPath: string
  pluginsPath: string
  themesPath: string
  ffmpegAvailable: boolean
  ffmpegPath: string | null
}

export interface TuneGramApi {
  getPlatform(): Promise<PlatformInfo>
  /**
   * Resolves the real filesystem path behind a dropped `File`. `File.path` was
   * removed from Electron, so this wraps `webUtils.getPathForFile`.
   */
  getPathForFile(file: File): string
  settings: {
    get(): Promise<AppSettings>
    set(patch: Partial<AppSettings>): Promise<AppSettings>
    reset(): Promise<AppSettings>
  }
  library: {
    pickFolder(): Promise<string | null>
    useTelegramFolder(): Promise<string | null>
    defaultFolderCandidates(): Promise<string[]>
    scan(root?: string): Promise<ScanResult>
    rescan(): Promise<ScanResult | null>
    setFavorite(patch: { path: string; favorite: boolean }): Promise<void>
    markPlayed(patch: { path: string; increment?: boolean }): Promise<void>
    revealInFolder(path: string): Promise<void>
    onScanProgress(cb: (p: { scanned: number; total: number; current: string }) => void): () => void
    onLibraryChanged(cb: (folders: string[]) => void): () => void
    addDroppedPaths(paths: string[]): Promise<ScanResult | null>
  }
  playback: {
    mediaUrl(trackId: string): string
    artworkUrl(trackId: string): string
    transcode(trackId: string): Promise<TranscodeResult>
  }
  playlists: {
    create(name: string): Promise<Playlist>
    rename(id: string, name: string): Promise<Playlist[]>
    remove(id: string): Promise<Playlist[]>
    addTracks(id: string, paths: string[]): Promise<Playlist[]>
    removeTrack(id: string, index: number): Promise<Playlist[]>
    reorder(id: string, from: number, to: number): Promise<Playlist[]>
  }
  addons: {
    list(): Promise<AddonInfo[]>
    setEnabled(kind: AddonKind, fileName: string, enabled: boolean): Promise<AddonInfo[]>
    openFolder(kind: AddonKind): Promise<void>
    reload(): Promise<AddonInfo[]>
    readSource(kind: AddonKind, fileName: string): Promise<{ ok: true; content: string } | { ok: false; reason: string }>
    reportError(scope: 'plugin' | 'theme', fileName: string, message: string): void
    /** Fires when the Plugins/ or Themes/ folder changes on disk. */
    onAddonsChanged(cb: () => void): () => void
    onError(cb: (e: { scope: 'plugin' | 'theme'; fileName: string; message: string }) => void): () => void
  }
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
    isMaximized(): Promise<boolean>
    onMaximizeChanged(cb: (maximized: boolean) => void): () => void
    onCommand(cb: (command: 'play' | 'next' | 'prev' | 'search') => void): () => void
  }
}
