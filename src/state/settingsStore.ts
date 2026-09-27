import type { AppSettings } from '@shared/types'
import { DEFAULT_SETTINGS_FALLBACK } from '../lib/defaults'

type Listener = () => void

/**
 * Renderer-side mirror of the persisted settings. Kept outside React so the
 * audio engine and the Spicetify shim can read/write it without a component in
 * the loop; components subscribe through `useSettings`.
 */
class SettingsStore {
  private state: AppSettings = DEFAULT_SETTINGS_FALLBACK
  private listeners = new Set<Listener>()
  private loaded = false

  /**
   * Arrow property, not a method: `useSettings` hands this straight to
   * `useSyncExternalStore`, which calls it without a receiver.
   */
  get = (): AppSettings => this.state

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }

  async load(): Promise<AppSettings> {
    try {
      this.state = await window.tunegram.settings.get()
    } catch (error) {
      console.error('[settings] load failed, using defaults', error)
    }
    this.loaded = true
    this.emit()
    return this.state
  }

  isLoaded(): boolean {
    return this.loaded
  }

  /** Optimistic local update, then persisted. Never rejects. */
  update(patch: Partial<AppSettings>): AppSettings {
    this.state = { ...this.state, ...patch }
    this.emit()
    void window.tunegram.settings
      .set(patch)
      .then((saved) => {
        this.state = saved
        this.emit()
      })
      .catch((error) => console.error('[settings] save failed', error))
    return this.state
  }
}

export const settingsStore = new SettingsStore()
