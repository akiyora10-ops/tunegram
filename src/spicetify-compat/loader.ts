import type { AddonInfo, AddonKind } from '@shared/types'
import { pluginButtonStore } from './pluginButtons'
import { buildSpicetifyApi, connectSpicetifyEvents } from './shim'
import { notifyStore } from '../state/notifyStore'
import type { SpicetifyApi } from './types'

const injected = new Map<string, { element: HTMLScriptElement; objectUrl: string }>()
const styleElements = new Map<string, HTMLStyleElement>()

/**
 * Spicetify-compatible loader.
 *
 * Themes are plain CSS injected into `<head>`; plugins are evaluated as scripts
 * with a `window.Spicetify` global in place. Both come from folders inside the
 * app's userData directory, so users can drop files in and press reload.
 *
 * Anything built on Spicetify's streaming APIs will fail here by design — see
 * Settings → Plugins for the documented list.
 */
class SpicetifyCompat {
  private api: SpicetifyApi | null = null

  /** Installs `window.Spicetify`. Safe to call more than once. */
  install(): SpicetifyApi {
    if (!this.api) {
      this.api = buildSpicetifyApi()
      connectSpicetifyEvents()
      ;(window as unknown as { Spicetify: SpicetifyApi }).Spicetify = this.api
    }
    return this.api
  }

  get(): SpicetifyApi | null {
    return this.api
  }

  /** Applies the enabled themes and plugins from a freshly listed addon set. */
  async apply(addons: AddonInfo[]): Promise<void> {
    this.install()
    await this.applyThemes(addons.filter((a) => a.kind === 'theme' && a.enabled))
    await this.applyPlugins(addons.filter((a) => a.kind === 'plugin' && a.enabled))
  }

  /** Removes everything previously injected, so a reload starts from scratch. */
  reset(): void {
    for (const [key, entry] of injected) {
      entry.element.remove()
      URL.revokeObjectURL(entry.objectUrl)
      injected.delete(key)
    }
    for (const [key, element] of styleElements) {
      element.remove()
      styleElements.delete(key)
    }
    pluginButtonStore.clear()
  }

  private async applyThemes(themes: AddonInfo[]): Promise<void> {
    const wanted = new Set(themes.map((t) => t.fileName))
    for (const [fileName, element] of styleElements) {
      if (!wanted.has(fileName)) {
        element.remove()
        styleElements.delete(fileName)
      }
    }

    for (const theme of themes) {
      if (styleElements.has(theme.fileName)) continue
      const result = await window.tunegram.addons.readSource('theme', theme.fileName)
      if (!result.ok) {
        this.report('theme', theme.fileName, result.reason)
        continue
      }
      const element = document.createElement('style')
      element.dataset.tunegramTheme = theme.fileName
      element.textContent = result.content
      document.head.appendChild(element)
      styleElements.set(theme.fileName, element)
    }
  }

  private async applyPlugins(plugins: AddonInfo[]): Promise<void> {
    const wanted = new Set(plugins.map((p) => p.fileName))
    for (const [fileName, entry] of injected) {
      if (!wanted.has(fileName)) {
        entry.element.remove()
        URL.revokeObjectURL(entry.objectUrl)
        injected.delete(fileName)
      }
    }

    for (const plugin of plugins) {
      if (injected.has(plugin.fileName)) continue
      const result = await window.tunegram.addons.readSource('plugin', plugin.fileName)
      if (!result.ok) {
        this.report('plugin', plugin.fileName, result.reason)
        continue
      }

      // Blob URLs let plugin code run under a strict CSP and work identically in
      // dev (http origin) and in a packaged build (file origin).
      const blob = new Blob([result.content], { type: 'text/javascript' })
      const objectUrl = URL.createObjectURL(blob)
      const element = document.createElement('script')
      element.src = objectUrl
      element.dataset.tunegramPlugin = plugin.fileName
      element.addEventListener('error', () => {
        this.report('plugin', plugin.fileName, 'Failed to evaluate. Check the file for syntax errors.')
      })
      document.head.appendChild(element)
      injected.set(plugin.fileName, { element, objectUrl })
    }
  }

  private report(scope: AddonKind, fileName: string, message: string): void {
    window.tunegram.addons.reportError(scope, fileName, message)
    notifyStore.push(`${scope === 'plugin' ? 'Plugin' : 'Theme'} “${fileName}” was skipped`, 'error', message)
  }
}

export const spicetify = new SpicetifyCompat()

/** Watches for edits in the Plugins/ and Themes/ folders. */
export function watchAddons(): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const reload = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void reloadAddons(), 300)
  }

  window.tunegram.addons.onAddonsChanged(() => reload())
  window.tunegram.addons.onError(({ scope, fileName, message }) => {
    notifyStore.push(`${scope === 'plugin' ? 'Plugin' : 'Theme'} “${fileName}”`, 'error', message)
  })
  void reloadAddons()
}

export async function reloadAddons(): Promise<AddonInfo[]> {
  const addons = await window.tunegram.addons.reload()
  spicetify.reset()
  await spicetify.apply(addons)
  return addons
}
