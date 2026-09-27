import { stat } from 'node:fs/promises'
import { basename, dirname, resolve as resolvePath } from 'node:path'
import { getSettings, updateSettings } from './settings'

export const scanState: { root: string | null; busy: boolean } = { root: null, busy: false }

/**
 * Chromium hands us a flat list of dropped paths, so dropped files are grouped
 * under their parent folder. Those folders are merged into the library instead
 * of replacing it, which is what people expect when they drag a few songs in.
 */
export async function addDroppedFolders(dropped: string[]): Promise<string[]> {
  const candidates = new Set<string>()

  for (const entry of dropped) {
    if (typeof entry !== 'string' || entry.length === 0) continue
    const full = resolvePath(entry)
    try {
      const info = await stat(full)
      candidates.add(info.isDirectory() ? full : dirname(full))
    } catch {
      continue
    }
  }

  if (candidates.size === 0) return []

  const settings = getSettings()
  const folders = new Set(settings.libraryFolders)
  for (const folder of candidates) folders.add(folder)
  updateSettings({ libraryFolders: [...folders] })
  return [...candidates]
}

/** Human-readable label for a library root, used in the settings view. */
export function folderLabel(folder: string): string {
  return basename(folder) || folder
}
