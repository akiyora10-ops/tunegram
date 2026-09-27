import { app } from 'electron'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { AppSettings } from '@shared/types'
import { createJsonWriter, readJson } from './store'
import { paths } from './paths'

export const DEFAULT_SETTINGS: AppSettings = {
  libraryFolders: [],
  volume: 0.8,
  muted: false,
  shuffle: false,
  repeat: 'off',
  windowBounds: null,
  maximized: false,
  showUnverified: true,
  theme: 'default',
  // The app's own palette lives in the renderer's stylesheet, so no theme file
  // is enabled out of the box. Seeded examples are added on first run.
  enabledThemes: [],
  disabledPlugins: [],
  defaultSort: { key: 'title', dir: 'asc' },
  playlists: [],
  lastFolder: null
}

let settings: AppSettings = { ...DEFAULT_SETTINGS }
let loaded = false

const writer = createJsonWriter<AppSettings>(() => paths().settingsFile)

export function defaultSettings(): AppSettings {
  return structuredClone(DEFAULT_SETTINGS)
}

export async function loadSettings(): Promise<AppSettings> {
  if (loaded) return settings
  const stored = await readJson<Partial<AppSettings>>(paths().settingsFile, {})
  settings = normalize({ ...structuredClone(DEFAULT_SETTINGS), ...stored })
  loaded = true
  return settings
}

export function getSettings(): AppSettings {
  return settings
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  settings = normalize({ ...settings, ...patch })
  writer.schedule(settings)
  return settings
}

export async function flushSettings(): Promise<void> {
  await writer.flush()
}

function normalize(input: AppSettings): AppSettings {
  const clamp01 = (n: unknown, fallback: number): number => {
    const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback
    return Math.min(1, Math.max(0, v))
  }
  return {
    ...input,
    libraryFolders: Array.isArray(input.libraryFolders) ? input.libraryFolders.filter((f) => typeof f === 'string') : [],
    volume: clamp01(input.volume, DEFAULT_SETTINGS.volume),
    muted: !!input.muted,
    shuffle: !!input.shuffle,
    repeat: input.repeat === 'all' || input.repeat === 'one' ? input.repeat : 'off',
    showUnverified: input.showUnverified !== false,
    enabledThemes: Array.isArray(input.enabledThemes) ? input.enabledThemes : [],
    disabledPlugins: Array.isArray(input.disabledPlugins) ? input.disabledPlugins : [],
    playlists: Array.isArray(input.playlists) ? input.playlists : [],
    windowBounds: isBounds(input.windowBounds) ? input.windowBounds : null
  }
}

function isBounds(value: unknown): value is NonNullable<AppSettings['windowBounds']> {
  if (!value || typeof value !== 'object') return false
  const b = value as Record<string, unknown>
  return (
    typeof b.x === 'number' &&
    typeof b.y === 'number' &&
    typeof b.width === 'number' &&
    typeof b.height === 'number' &&
    b.width >= 400 &&
    b.height >= 300
  )
}

/**
 * Telegram's desktop client has moved its download folder around over the
 * years, so several locations are probed in order of likelihood.
 */
export function telegramFolderCandidates(): string[] {
  const home = homedir()
  const downloads = join(home, 'Downloads')
  return [
    join(downloads, 'Telegram Desktop'),
    join(downloads, 'Telegram Downloads'),
    downloads,
    join(home, 'Documents', 'Telegram Desktop'),
    join(app.getPath('appData') || home, 'Telegram Desktop')
  ].filter((p, i, all) => all.indexOf(p) === i)
}
