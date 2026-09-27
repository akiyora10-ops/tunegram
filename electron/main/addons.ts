import { readdir, readFile, stat, copyFile } from 'node:fs/promises'
import { existsSync, readdirSync, watch } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { app } from 'electron'
import type { AddonInfo, AddonKind } from '@shared/types'
import { paths } from './paths'
import { getSettings, updateSettings } from './settings'

const EXT: Record<AddonKind, string> = { plugin: '.js', theme: '.css' }
const FOLDER: Record<AddonKind, 'pluginsDir' | 'themesDir'> = {
  plugin: 'pluginsDir',
  theme: 'themesDir'
}

/** Example addons shipped with the app, copied out on first launch. */
const SEEDS: { kind: AddonKind; fileName: string; enabled: boolean }[] = [
  { kind: 'plugin', fileName: 'example-plugin.js', enabled: false },
  { kind: 'theme', fileName: 'example-theme.css', enabled: false }
]

/**
 * Copies the bundled example plugin/theme into the user folders so the
 * Spicetify integration is discoverable instead of undocumented. Existing files
 * are never overwritten, and both examples start disabled.
 *
 * In a packaged build the examples are loose files under `resources/` (see the
 * `extraResources` entry in package.json) rather than inside the asar, so they
 * can be read and edited like any other addon.
 */
export async function seedExampleAddons(): Promise<void> {
  const base = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  for (const seed of SEEDS) {
    const target = join(paths()[FOLDER[seed.kind]], seed.fileName)
    if (existsSync(target)) continue
    const source = join(base, seed.kind === 'plugin' ? 'plugins' : 'themes', seed.fileName)
    try {
      await copyFile(source, target)
      if (seed.kind === 'theme' && seed.enabled && !getSettings().enabledThemes.includes(seed.fileName)) {
        updateSettings({ enabledThemes: [...getSettings().enabledThemes, seed.fileName] })
      }
    } catch (error) {
      // A dev checkout without `resources/` should not break startup.
      console.warn(`[addons] could not seed ${seed.fileName}:`, (error as Error).message)
    }
  }
}

let watchers: FSWatcher[] = []
let onChange: (() => void) | null = null

interface FSWatcher {
  close(): void
}

/** Reads the leading block comment of a plugin so the settings list can show it. */
async function describePlugin(filePath: string): Promise<string | null> {
  let head: string
  try {
    const buf = await readFile(filePath)
    head = buf.subarray(0, 2048).toString('utf8')
  } catch {
    return null
  }
  // Accept both `/** ... *\/` (the Spicetify convention) and a plain leading
  // `/* ... *\/` block, then take the first non-empty prose lines as a summary.
  const block = /\/\*\*?([\s\S]*?)\*\//.exec(head)
  if (block) {
    const text = block[1]
      .split('\n')
      .map((l) => l.replace(/^\s*\*\s?/, '').trim())
      .filter(Boolean)
      .filter((l) => !/^@/.test(l))
      .join(' ')
      .trim()
    if (text) return text.slice(0, 200)
  }
  const name = /@name\s+([^\n*]+)/.exec(head)
  if (name) return name[1].trim().slice(0, 200)
  return null
}

export async function listAddons(): Promise<AddonInfo[]> {
  const settings = getSettings()
  const out: AddonInfo[] = []

  for (const kind of ['theme', 'plugin'] as AddonKind[]) {
    const dir = paths()[FOLDER[kind]]
    let entries: string[] = []
    try {
      entries = await readdir(dir)
    } catch {
      // A missing or unreadable folder simply means no addons of that kind.
    }

    for (const fileName of entries) {
      if (extname(fileName).toLowerCase() !== EXT[kind]) continue
      const full = join(dir, fileName)
      let info
      try {
        info = await stat(full)
        if (!info.isFile()) continue
      } catch {
        continue
      }
      const enabled =
        kind === 'theme'
          ? settings.enabledThemes.includes(fileName)
          : !settings.disabledPlugins.includes(fileName)

      out.push({
        kind,
        id: `${kind}:${fileName}`,
        fileName,
        path: full,
        enabled,
        sizeBytes: info.size,
        modifiedMs: info.mtimeMs,
        description: kind === 'plugin' ? await describePlugin(full) : null,
        error: null
      })
    }
  }

  return out.sort((a, b) => a.kind.localeCompare(b.kind) || a.fileName.localeCompare(b.fileName))
}

export async function setAddonEnabled(kind: AddonKind, fileName: string, enabled: boolean): Promise<void> {
  const settings = getSettings()
  if (kind === 'theme') {
    const set = new Set(settings.enabledThemes)
    if (enabled) set.add(fileName)
    else set.delete(fileName)
    updateSettings({ enabledThemes: [...set] })
    return
  }
  const set = new Set(settings.disabledPlugins)
  if (enabled) set.delete(fileName)
  else set.add(fileName)
  updateSettings({ disabledPlugins: [...set] })
}

export function addonFolder(kind: AddonKind): string {
  return paths()[FOLDER[kind]]
}

export function addonSource(kind: AddonKind, fileName: string): string | null {
  const full = join(addonFolder(kind), fileName)
  if (!existsSync(full)) return null
  return full
}

export function enabledPluginNames(): string[] {
  const disabled = new Set(getSettings().disabledPlugins)
  return listDirSync(addonFolder('plugin'))
    .filter((f) => f.endsWith('.js') && !disabled.has(f))
    .sort()
}

export function enabledThemeNames(): string[] {
  const enabled = new Set(getSettings().enabledThemes)
  return listDirSync(addonFolder('theme')).filter((f) => f.endsWith('.css') && enabled.has(f)).sort()
}

function listDirSync(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

/** Watches the Plugins/ and Themes/ folders so edits apply without a restart. */
export function watchAddonFolders(callback: () => void): void {
  onChange = callback
  void restartWatchers()
}

async function restartWatchers(): Promise<void> {
  for (const w of watchers) w.close()
  watchers = []
  for (const kind of ['theme', 'plugin'] as AddonKind[]) {
    const dir = addonFolder(kind)
    try {
      const watcher = watch(dir, { persistent: false }, () => {
        // Editors write via rename, so debounce before reacting.
        setTimeout(() => onChange?.(), 250)
      })
      watchers.push({ close: () => watcher.close() })
    } catch (error) {
      console.warn(`[addons] cannot watch ${basename(dir)}:`, error)
    }
  }
}
