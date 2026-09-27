import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { appRoot, paths } from './paths'
import { getSettings, updateSettings } from './settings'
import type { WindowBounds } from '@shared/types'

const MIN_WIDTH = 880
const MIN_HEIGHT = 560
const DEFAULT_WIDTH = 1280
const DEFAULT_HEIGHT = 820

let mainWindow: BrowserWindow | null = null
let maximizeHandler: ((maximized: boolean) => void) | null = null

export function createMainWindow(): BrowserWindow {
  const settings = getSettings()
  const bounds = resolveBounds(settings.windowBounds)

  const win = new BrowserWindow({
    ...bounds,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    backgroundColor: '#121212',
    // A slim native-caption-free title bar lets the app own the top strip while
    // keeping real, always-working window buttons.
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#b3b3b3',
      height: 40
    },
    trafficLightPosition: undefined,
    webPreferences: {
      preload: join(appRoot(), 'out/preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      webSecurity: true
    }
  })

  mainWindow = win

  win.once('ready-to-show', () => {
    if (settings.maximized) win.maximize()
    win.show()
  })

  const persistBounds = debounce(() => {
    if (!win || win.isDestroyed()) return
    const maximized = win.isMaximized()
    updateSettings({ maximized })
    if (!maximized && !win.isMinimized() && !win.isFullScreen()) {
      updateSettings({ windowBounds: win.getNormalBounds() as WindowBounds })
    }
  }, 300)

  win.on('resize', persistBounds)
  win.on('move', persistBounds)
  win.on('maximize', () => {
    updateSettings({ maximized: true })
    maximizeHandler?.(true)
  })
  win.on('unmaximize', () => {
    updateSettings({ maximized: false })
    maximizeHandler?.(false)
  })

  win.on('close', () => {
    updateSettings({ maximized: win.isMaximized() })
  })

  win.on('closed', () => {
    mainWindow = null
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Block in-page navigation away from the app; open real links externally.
  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl && url.startsWith(devUrl)) return
    event.preventDefault()
    void shell.openExternal(url)
  })

  win.webContents.on('will-attach-webview', (event) => event.preventDefault())

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(appRoot(), 'out/renderer/index.html'))
  }

  return win
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function onMaximizeChanged(cb: (maximized: boolean) => void): void {
  maximizeHandler = cb
}

function resolveBounds(saved: WindowBounds | null): { x?: number; y?: number; width: number; height: number } {
  if (saved) {
    // Only reuse a saved position if it still lands on a connected display.
    const area = screen.getDisplayMatching(saved).workArea
    const visible =
      saved.x + saved.width > area.x + 40 &&
      saved.x < area.x + area.width - 40 &&
      saved.y + saved.height > area.y &&
      saved.y < area.y + area.height - 40
    if (visible) return { x: saved.x, y: saved.y, width: saved.width, height: saved.height }
  }
  return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }
}

function debounce(fn: () => void, ms: number): () => void {
  let t: NodeJS.Timeout | null = null
  return () => {
    if (t) clearTimeout(t)
    t = setTimeout(fn, ms)
  }
}

/** Path of the bundled preload, exported for diagnostics. */
export function preloadPath(): string {
  return fileURLToPath(new URL('../preload/index.cjs', import.meta.url))
}

/** userData dir, exported so the settings view can show it. */
export function userDataPath(): string {
  return paths().userData
}
