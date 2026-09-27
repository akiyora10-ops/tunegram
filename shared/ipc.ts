export const IPC = {
  platform: {
    get: 'platform:get'
  },
  settings: {
    get: 'settings:get',
    set: 'settings:set',
    reset: 'settings:reset'
  },
  library: {
    pickFolder: 'library:pick-folder',
    useTelegramFolder: 'library:use-telegram-folder',
    defaultFolderCandidates: 'library:default-folder-candidates',
    scan: 'library:scan',
    rescan: 'library:rescan',
    setFavorite: 'library:set-favorite',
    markPlayed: 'library:mark-played',
    revealInFolder: 'library:reveal-in-folder',
    addDroppedPaths: 'library:add-dropped-paths',
    scanProgress: 'library:scan-progress',
    libraryChanged: 'library:changed'
  },
  playback: {
    transcode: 'playback:transcode'
  },
  playlists: {
    create: 'playlists:create',
    rename: 'playlists:rename',
    remove: 'playlists:remove',
    addTracks: 'playlists:add-tracks',
    removeTrack: 'playlists:remove-track',
    reorder: 'playlists:reorder'
  },
  addons: {
    list: 'addons:list',
    setEnabled: 'addons:set-enabled',
    openFolder: 'addons:open-folder',
    reload: 'addons:reload',
    readSource: 'addons:read-source',
    changed: 'addons:changed',
    error: 'addons:error'
  },
  window: {
    minimize: 'window:minimize',
    toggleMaximize: 'window:toggle-maximize',
    close: 'window:close',
    isMaximized: 'window:is-maximized',
    maximizeChanged: 'window:maximize-changed',
    command: 'window:command'
  }
} as const

/** Custom protocol used to stream audio and artwork out of the main process. */
export const MEDIA_SCHEME = 'tunegram'

export function mediaUrl(trackId: string): string {
  return `${MEDIA_SCHEME}://track/${encodeURIComponent(trackId)}`
}

export function artworkUrl(trackId: string): string {
  return `${MEDIA_SCHEME}://art/${encodeURIComponent(trackId)}`
}
