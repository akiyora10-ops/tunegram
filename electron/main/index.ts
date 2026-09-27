import { app, BrowserWindow, globalShortcut } from 'electron'
import { IPC } from '@shared/ipc'
import { registerMediaProtocol, installMediaProtocol } from './media'
import { createMainWindow, getMainWindow, onMaximizeChanged } from './window'
import { flushSettings, loadSettings } from './settings'
import { bootstrapState, onRendererCommand, registerIpc } from './ipc'
import { loadTrackIndex } from './track-index'
import { ffmpegAvailable } from './transcode'
import { paths } from './paths'
import { scanState } from './drop'
import { seedExampleAddons, watchAddonFolders } from './addons'

// The custom protocol must be declared before the app becomes ready.
registerMediaProtocol()

async function main(): Promise<void> {
  const settings = await loadSettings()
  await loadTrackIndex()

  installMediaProtocol()
  registerIpc()
  await seedExampleAddons()
  await bootstrapState()

  // Seed the scan root so a rescan works before the renderer has scanned once.
  scanState.root = settings.lastFolder

  createMainWindow()

  // The folder changed; the renderer re-lists and re-injects.
  watchAddonFolders(() => {
    getMainWindow()?.webContents.send(IPC.addons.changed)
  })

  onMaximizeChanged((maximized) => {
    getMainWindow()?.webContents.send(IPC.window.maximizeChanged, maximized)
  })
  onRendererCommand((command) => {
    getMainWindow()?.webContents.send(IPC.window.command, command)
  })

  console.log(`[tunegram] ffmpeg transcode fallback: ${ffmpegAvailable() ? 'available' : 'unavailable'}`)
  console.log(`[tunegram] data directory: ${paths().userData}`)
}

app.whenReady().then(main).catch((error) => {
  console.error('[tunegram] failed to start:', error)
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

let quitting = false

app.on('before-quit', (event) => {
  if (quitting) return
  quitting = true
  event.preventDefault()
  globalShortcut.unregisterAll()
  void flushSettings().finally(() => app.exit(0))
})

process.on('uncaughtException', (error) => {
  console.error('[tunegram] uncaught exception:', error)
})
