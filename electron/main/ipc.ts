import { app, dialog, ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isAbsolute, resolve as resolvePath } from 'node:path'
import { IPC, mediaUrl } from '@shared/ipc'
import type { AppSettings, AddonKind, Playlist, ScanResult, TranscodeResult } from '@shared/types'
import { defaultSettings, getSettings, telegramFolderCandidates, updateSettings } from './settings'
import { loadMetaCache, loadTrackStateFile, scanLibrary, setTrackState } from './library'
import { ffmpegAvailable, ffmpegPath, transcodeFile } from './transcode'
import { pathForTrackId } from './track-index'
import { addDroppedFolders, scanState } from './drop'
import { addonFolder, addonSource, listAddons, setAddonEnabled, watchAddonFolders } from './addons'
import { getMainWindow } from './window'
import { paths } from './paths'

let commandHandler: ((command: 'play' | 'next' | 'prev' | 'search') => void) | null = null

export function onRendererCommand(cb: (command: 'play' | 'next' | 'prev' | 'search') => void): void {
  commandHandler = cb
}

function send(channel: string, payload: unknown): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

export function registerIpc(): void {
  // --- platform ---------------------------------------------------------
  ipcMain.handle(IPC.platform.get, () => ({
    os: process.platform,
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    userDataPath: paths().userData,
    pluginsPath: paths().pluginsDir,
    themesPath: paths().themesDir,
    ffmpegAvailable: ffmpegAvailable(),
    ffmpegPath: ffmpegPath()
  }))

  // --- settings ---------------------------------------------------------
  ipcMain.handle(IPC.settings.get, () => getSettings())

  ipcMain.handle(IPC.settings.set, (_e, patch: Partial<AppSettings>) => {
    const next = updateSettings(patch)
    return next
  })

  ipcMain.handle(IPC.settings.reset, () => {
    const fresh = defaultSettings()
    return updateSettings(fresh)
  })

  // --- library ----------------------------------------------------------
  ipcMain.handle(IPC.library.pickFolder, async () => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose your music folder',
      defaultPath: getSettings().lastFolder ?? app.getPath('music'),
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const folder = result.filePaths[0]
    setLibraryFolder(folder)
    return folder
  })

  ipcMain.handle(IPC.library.useTelegramFolder, async () => {
    const existing = telegramFolderCandidates().find((p) => existsSync(p))
    if (!existing) return null
    setLibraryFolder(existing)
    return existing
  })

  ipcMain.handle(IPC.library.defaultFolderCandidates, () => telegramFolderCandidates())

  ipcMain.handle(IPC.library.scan, async (_e, root?: string) => {
    const target = root ?? scanState.root ?? getSettings().lastFolder
    if (!target) return null
    return runScan(target)
  })

  ipcMain.handle(IPC.library.rescan, () => (scanState.root ? runScan(scanState.root) : null))

  ipcMain.handle(IPC.library.setFavorite, (_e, patch: { path: string; favorite: boolean }) => {
    setTrackState(patch)
  })

  ipcMain.handle(IPC.library.markPlayed, (_e, patch: { path: string; increment?: boolean }) => {
    setTrackState({
      path: patch.path,
      playedAt: Date.now(),
      playCountDelta: patch.increment === false ? 0 : 1
    })
  })

  ipcMain.handle(IPC.library.revealInFolder, (_e, filePath: string) => {
    if (typeof filePath !== 'string' || !isAbsolute(filePath)) return
    if (!existsSync(filePath)) return
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle(IPC.library.addDroppedPaths, async (_e, dropped: string[]) => {
    const folders = await addDroppedFolders(Array.isArray(dropped) ? dropped : [])
    if (folders.length === 0) return null
    const root = scanState.root ?? folders[0]
    return runScan(root)
  })

  // --- playback ---------------------------------------------------------
  ipcMain.handle(IPC.playback.transcode, async (_e, trackId: string): Promise<TranscodeResult> => {
    const filePath = pathForTrackId(trackId)
    if (!filePath) return { ok: false, reason: 'Unknown track' }
    if (!ffmpegAvailable()) {
      return { ok: false, reason: 'ffmpeg is not available, so this file cannot be converted.' }
    }
    try {
      const out = await transcodeFile(trackId, filePath)
      if (!out) return { ok: false, reason: 'This file could not be converted to a playable format.' }
      return { ok: true, url: mediaUrl(trackId), cachedFile: out, via: out === filePath ? 'cache' : 'ffmpeg' }
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) }
    }
  })

  // --- playlists --------------------------------------------------------
  ipcMain.handle(IPC.playlists.create, (_e, name: string) => {
    const now = Date.now()
    const playlist: Playlist = {
      id: `pl_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      name: String(name || 'New Playlist').slice(0, 80),
      trackPaths: [],
      createdAt: now,
      updatedAt: now
    }
    return updateSettings({ playlists: [...getSettings().playlists, playlist] }).playlists.at(-1)!
  })

  ipcMain.handle(IPC.playlists.rename, (_e, id: string, name: string) => {
    return mapPlaylists((p) => (p.id === id ? { ...p, name: String(name).slice(0, 80), updatedAt: Date.now() } : p))
  })

  ipcMain.handle(IPC.playlists.remove, (_e, id: string) => {
    return mapPlaylists((p) => (p.id === id ? null : p))
  })

  ipcMain.handle(IPC.playlists.addTracks, (_e, id: string, trackPaths: string[]) => {
    return mapPlaylists((p) => {
      if (p.id !== id) return p
      const seen = new Set(p.trackPaths)
      const added = (Array.isArray(trackPaths) ? trackPaths : []).filter((t) => typeof t === 'string' && !seen.has(t))
      if (added.length === 0) return p
      return { ...p, trackPaths: [...p.trackPaths, ...added], updatedAt: Date.now() }
    })
  })

  ipcMain.handle(IPC.playlists.removeTrack, (_e, id: string, index: number) => {
    return mapPlaylists((p) => {
      if (p.id !== id) return p
      if (index < 0 || index >= p.trackPaths.length) return p
      const next = [...p.trackPaths]
      next.splice(index, 1)
      return { ...p, trackPaths: next, updatedAt: Date.now() }
    })
  })

  ipcMain.handle(IPC.playlists.reorder, (_e, id: string, from: number, to: number) => {
    return mapPlaylists((p) => {
      if (p.id !== id) return p
      if (from < 0 || from >= p.trackPaths.length) return p
      const toClamped = Math.max(0, Math.min(p.trackPaths.length - 1, to))
      const next = [...p.trackPaths]
      const [moved] = next.splice(from, 1)
      next.splice(toClamped, 0, moved)
      return { ...p, trackPaths: next, updatedAt: Date.now() }
    })
  })

  // --- addons -----------------------------------------------------------
  ipcMain.handle(IPC.addons.list, () => listAddons())

  ipcMain.handle(IPC.addons.setEnabled, async (_e, kind: AddonKind, fileName: string, enabled: boolean) => {
    await setAddonEnabled(kind, fileName, enabled)
    return listAddons()
  })

  ipcMain.handle(IPC.addons.openFolder, (_e, kind: AddonKind) => {
    const dir = addonFolder(kind)
    if (!existsSync(dir)) return
    void shell.openPath(dir)
  })

  ipcMain.handle(IPC.addons.reload, () => listAddons())

  // Plugin/theme source is handed to the renderer as text so it can be injected
  // as a blob: URL. That keeps it working identically in dev (http origin) and
  // in a packaged build (file origin) under a strict CSP.
  ipcMain.handle(IPC.addons.readSource, async (_e, kind: AddonKind, fileName: string) => {
    if (kind !== 'plugin' && kind !== 'theme') return { ok: false as const, reason: 'Unknown addon kind' }
    if (typeof fileName !== 'string' || fileName.includes('/') || fileName.includes('\\')) {
      return { ok: false as const, reason: 'Invalid file name' }
    }
    const source = addonSource(kind, fileName)
    if (!source) return { ok: false as const, reason: 'File not found' }
    try {
      return { ok: true as const, content: await readFile(source, 'utf8') }
    } catch (error) {
      return { ok: false as const, reason: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.on(IPC.addons.error, (_e, payload: { scope: string; fileName: string; message: string }) => {
    console.error(`[addons] ${payload.scope} ${payload.fileName}: ${payload.message}`)
  })

  // --- window -----------------------------------------------------------
  ipcMain.on(IPC.window.minimize, () => getMainWindow()?.minimize())
  ipcMain.on(IPC.window.toggleMaximize, () => toggleMaximize())
  ipcMain.on(IPC.window.close, () => getMainWindow()?.close())
  ipcMain.handle(IPC.window.isMaximized, () => getMainWindow()?.isMaximized() ?? false)

  // Global media keys routed to the renderer.
  ipcMain.on(IPC.window.command, (_e, command: 'play' | 'next' | 'prev' | 'search') => {
    commandHandler?.(command)
  })
}

export function setLibraryFolder(folder: string): void {
  const settings = getSettings()
  const folders = new Set(settings.libraryFolders)
  folders.add(folder)
  updateSettings({ libraryFolders: [...folders], lastFolder: folder })
  send(IPC.library.libraryChanged, [...folders])
}

async function runScan(root: string): Promise<ScanResult> {
  const resolved = resolvePath(root)
  scanState.root = resolved
  scanState.busy = true
  send(IPC.library.scanProgress, { scanned: 0, total: 0, current: '' })
  try {
    const result = await scanLibrary(resolved, {
      onProgress: (scanned, total, current) => send(IPC.library.scanProgress, { scanned, total, current })
    })
    setLibraryFolder(resolved)
    return result
  } finally {
    scanState.busy = false
    send(IPC.library.scanProgress, { scanned: 0, total: 0, current: '' })
  }
}

function mapPlaylists(fn: (p: Playlist) => Playlist | null): Playlist[] {
  const current = getSettings().playlists
  const next: Playlist[] = []
  for (const p of current) {
    const mapped = fn(p)
    if (mapped) next.push(mapped)
  }
  return updateSettings({ playlists: next }).playlists
}

function toggleMaximize(): void {
  const win = getMainWindow()
  if (!win) return
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
}

export async function bootstrapState(): Promise<void> {
  await loadTrackStateFile()
  await loadMetaCache()
  // Editors write via rename-then-replace, so the renderer debounces before it
  // re-reads the folders and re-injects whatever is enabled.
  watchAddonFolders(() => {
    void listAddons().then((addons) => send(IPC.addons.changed, addons))
  })
}
