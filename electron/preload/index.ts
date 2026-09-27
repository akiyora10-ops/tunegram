import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC, artworkUrl, mediaUrl } from '@shared/ipc'
import type {
  AddonInfo,
  AddonKind,
  AppSettings,
  PlatformInfo,
  Playlist,
  TranscodeResult,
  TuneGramApi
} from '@shared/types'

type Listener<T> = (payload: T) => void

function subscribe<T>(channel: string, cb: Listener<T>): () => void {
  const handler = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const api: TuneGramApi = {
  getPlatform: (): Promise<PlatformInfo> => ipcRenderer.invoke(IPC.platform.get),
  getPathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settings.get),
    set: (patch: Partial<AppSettings>) => ipcRenderer.invoke(IPC.settings.set, patch),
    reset: () => ipcRenderer.invoke(IPC.settings.reset)
  },
  library: {
    pickFolder: () => ipcRenderer.invoke(IPC.library.pickFolder),
    useTelegramFolder: () => ipcRenderer.invoke(IPC.library.useTelegramFolder),
    defaultFolderCandidates: () => ipcRenderer.invoke(IPC.library.defaultFolderCandidates),
    scan: (root?: string) => ipcRenderer.invoke(IPC.library.scan, root),
    rescan: () => ipcRenderer.invoke(IPC.library.rescan),
    setFavorite: (patch) => ipcRenderer.invoke(IPC.library.setFavorite, patch),
    markPlayed: (patch) => ipcRenderer.invoke(IPC.library.markPlayed, patch),
    revealInFolder: (path) => ipcRenderer.invoke(IPC.library.revealInFolder, path),
    onScanProgress: (cb) =>
      subscribe<{ scanned: number; total: number; current: string }>(IPC.library.scanProgress, cb),
    onLibraryChanged: (cb) => subscribe<string[]>(IPC.library.libraryChanged, cb),
    addDroppedPaths: (paths) => ipcRenderer.invoke(IPC.library.addDroppedPaths, paths)
  },
  playback: {
    mediaUrl: (trackId) => mediaUrl(trackId),
    artworkUrl: (trackId) => artworkUrl(trackId),
    transcode: (trackId): Promise<TranscodeResult> => ipcRenderer.invoke(IPC.playback.transcode, trackId)
  },
  playlists: {
    create: (name): Promise<Playlist> => ipcRenderer.invoke(IPC.playlists.create, name),
    rename: (id, name): Promise<Playlist[]> => ipcRenderer.invoke(IPC.playlists.rename, id, name),
    remove: (id): Promise<Playlist[]> => ipcRenderer.invoke(IPC.playlists.remove, id),
    addTracks: (id, paths): Promise<Playlist[]> => ipcRenderer.invoke(IPC.playlists.addTracks, id, paths),
    removeTrack: (id, index): Promise<Playlist[]> => ipcRenderer.invoke(IPC.playlists.removeTrack, id, index),
    reorder: (id, from, to): Promise<Playlist[]> => ipcRenderer.invoke(IPC.playlists.reorder, id, from, to)
  },
  addons: {
    list: (): Promise<AddonInfo[]> => ipcRenderer.invoke(IPC.addons.list),
    setEnabled: (kind: AddonKind, fileName, enabled): Promise<AddonInfo[]> =>
      ipcRenderer.invoke(IPC.addons.setEnabled, kind, fileName, enabled),
    openFolder: (kind: AddonKind) => ipcRenderer.invoke(IPC.addons.openFolder, kind),
    reload: (): Promise<AddonInfo[]> => ipcRenderer.invoke(IPC.addons.reload),
    readSource: (kind: AddonKind, fileName) => ipcRenderer.invoke(IPC.addons.readSource, kind, fileName),
    reportError: (scope, fileName, message) => ipcRenderer.send(IPC.addons.error, { scope, fileName, message }),
    onAddonsChanged: (cb) => subscribe<void>(IPC.addons.changed, () => cb()),
    onError: (cb) => subscribe<{ scope: 'plugin' | 'theme'; fileName: string; message: string }>(IPC.addons.error, cb)
  },
  window: {
    minimize: () => ipcRenderer.send(IPC.window.minimize),
    toggleMaximize: () => ipcRenderer.send(IPC.window.toggleMaximize),
    close: () => ipcRenderer.send(IPC.window.close),
    isMaximized: () => ipcRenderer.invoke(IPC.window.isMaximized),
    onMaximizeChanged: (cb) => subscribe<boolean>(IPC.window.maximizeChanged, cb),
    onCommand: (cb) => subscribe<'play' | 'next' | 'prev' | 'search'>(IPC.window.command, cb)
  }
}

contextBridge.exposeInMainWorld('tunegram', api)
