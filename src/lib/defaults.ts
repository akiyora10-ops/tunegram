import type { AppSettings, TrackSort } from '@shared/types'

/**
 * Fallback used before the real settings arrive from the main process (and if
 * the bridge is unavailable). Mirrors `DEFAULT_SETTINGS` in the main process.
 */
export const DEFAULT_SETTINGS_FALLBACK: AppSettings = {
  libraryFolders: [],
  volume: 0.8,
  muted: false,
  shuffle: false,
  repeat: 'off',
  windowBounds: null,
  maximized: false,
  showUnverified: true,
  theme: 'default',
  enabledThemes: [],
  disabledPlugins: [],
  defaultSort: { key: 'title', dir: 'asc' } satisfies TrackSort,
  playlists: [],
  lastFolder: null
}
