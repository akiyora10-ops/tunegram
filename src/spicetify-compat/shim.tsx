import type { Track } from '@shared/types'
import { player } from '../player/engine'
import { pluginButtonStore, type PluginBarTarget } from './pluginButtons'
import { notifyStore } from '../state/notifyStore'
import type { SpicetifyApi, SpicetifyPlayerEvent, SpicetifyTrack } from './types'

const NOT_IMPLEMENTED = [
  'Spicetify.CosmosAsync / CosmosResolver (there is no streaming backend)',
  'Spicetify.Platform internals (navigation, context menus, entry points)',
  "Spotify's GraphQL/catalog data and any account or token APIs",
  'Spicetify.React / Spicetify.ReactComponent (Spicetify\'s internal React instance)',
  'Spicetify.LibraryAPI catalogue browsing'
]

/** Converts a library track into the shape plugins expect from `Player.data`. */
export function toSpicetifyTrack(track: Track | null): SpicetifyTrack | null {
  if (!track) return null
  return {
    id: track.id,
    name: track.title,
    uri: window.tunegram.playback.mediaUrl(track.id),
    path: track.path,
    artist: { name: track.artist || 'Unknown Artist' },
    album: { name: track.album || '' },
    duration: track.duration,
    isLocal: true,
    ext: track.ext,
    hasArt: track.hasArt,
    raw: track
  }
}

const playerListeners = new Map<SpicetifyPlayerEvent, Set<(payload?: unknown) => void>>()

function dispatch(event: SpicetifyPlayerEvent, payload?: unknown): void {
  const set = playerListeners.get(event)
  if (!set) return
  for (const cb of [...set]) {
    try {
      cb(payload)
    } catch (error) {
      console.error(`[spicetify] a "${event}" listener threw:`, error)
    }
  }
}

/** Bridges engine events into the Spicetify event names plugins listen for. */
export function connectSpicetifyEvents(): void {
  for (const event of ['songchange', 'onplaypause', 'onprogress', 'onerror', 'queuechange'] as SpicetifyPlayerEvent[]) {
    player.on(event, (payload) => dispatch(event, payload))
  }
}

function registerButton(
  target: PluginBarTarget,
  options: { icon?: string; label?: string; onClick: () => void }
): { remove(): void } {
  const label = options.label ?? 'Plugin action'
  const entry = pluginButtonStore.add({
    target,
    label,
    icon: buildIcon(options.icon ?? label, target),
    onClick: () => {
      try {
        options.onClick()
      } catch (error) {
        console.error('[spicetify] button handler threw:', error)
        notifyStore.push(`Plugin error in “${label}”`, 'error', error instanceof Error ? error.message : String(error))
      }
    }
  })
  return {
    remove: () => pluginButtonStore.remove(entry.id)
  }
}

/**
 * Renders a plugin's icon markup. Inline SVG (or any HTML) is inserted as-is,
 * which is what Spicetify extensions assume; anything else becomes a label.
 */
function buildIcon(icon: string, target: PluginBarTarget): React.ReactNode {
  const looksLikeMarkup = /<[a-z][\s\S]*>/i.test(icon)
  if (looksLikeMarkup) {
    return <span className="contents" dangerouslySetInnerHTML={{ __html: icon }} />
  }
  return (
    <span className="text-[13px] font-bold leading-none" title={target === 'playbar' ? 'Plugin' : 'Plugin'}>
      {icon.slice(0, 2) || '•'}
    </span>
  )
}

const storagePrefix = 'tunegram.spicetify.'

function createLocalStorage() {
  return {
    get(key: string): string | null {
      try {
        return window.localStorage.getItem(storagePrefix + key)
      } catch {
        return null
      }
    },
    set(key: string, value: string): void {
      try {
        window.localStorage.setItem(storagePrefix + key, String(value))
      } catch (error) {
        console.warn('[spicetify] LocalStorage.set failed', error)
      }
    },
    remove(key: string): void {
      try {
        window.localStorage.removeItem(storagePrefix + key)
      } catch {
        /* ignore */
      }
    },
    clear(): void {
      try {
        for (const key of Object.keys(window.localStorage)) {
          if (key.startsWith(storagePrefix)) window.localStorage.removeItem(key)
        }
      } catch {
        /* ignore */
      }
    }
  }
}

export function buildSpicetifyApi(): SpicetifyApi {
  return {
    Player: {
      play: () => player.play(),
      pause: () => player.pause(),
      togglePlay: () => player.togglePlay(),
      next: () => player.next(),
      back: () => player.back(),
      seek: (ms: number) => player.seek(ms),
      seekRatio: (ratio: number) => player.seekRatio(ratio),
      getProgress: () => player.getProgress(),
      getDuration: () => player.getDuration(),
      isPlaying: () => player.getSnapshot().isPlaying,
      getVolume: () => player.getSnapshot().volume,
      setVolume: (value: number) => player.setVolume(value),
      getQueue: () => {
        const { queue, order } = player.getSnapshot()
        return order.map((i) => queue[i]).filter((t): t is Track => !!t).map((t) => toSpicetifyTrack(t)!)
      },
      get data(): SpicetifyTrack | null {
        return toSpicetifyTrack(player.getSnapshot().current)
      },
      addEventListener(event: SpicetifyPlayerEvent, cb: (payload?: unknown) => void): () => void {
        const set = playerListeners.get(event) ?? new Set()
        set.add(cb)
        playerListeners.set(event, set)
        return () => set.delete(cb)
      },
      removeEventListener(event: SpicetifyPlayerEvent, cb: (payload?: unknown) => void): void {
        playerListeners.get(event)?.delete(cb)
      }
    },
    Playbar: {
      Button: (options) => registerButton('playbar', options)
    },
    Topbar: {
      Button: (options) => registerButton('topbar', options)
    },
    showNotification: (message: string, durationMs?: number) => {
      notifyStore.push(String(message), 'info', undefined, durationMs)
    },
    LocalStorage: createLocalStorage(),
    Config: {
      version: '1.0.0-shim',
      appName: 'TuneGram',
      platform: 'local',
      apiVersion: '0.1',
      unsupported: NOT_IMPLEMENTED
    },
    Utils: {
      parseHTML: (html: string) => {
        const template = document.createElement('template')
        template.innerHTML = html.trim()
        return template.content
      },
      debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
        let timer: ReturnType<typeof setTimeout> | null = null
        return function debounced(this: unknown, ...args: never[]) {
          if (timer) clearTimeout(timer)
          timer = setTimeout(() => fn.apply(this, args), ms)
        } as T
      }
    }
  }
}
