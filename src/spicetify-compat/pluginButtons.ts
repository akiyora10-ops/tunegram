import { useMemo, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

export type PluginBarTarget = 'playbar' | 'topbar'

export interface PluginBarButton {
  id: string
  target: PluginBarTarget
  label: string
  icon: ReactNode
  onClick: () => void
  /** Set by the owner on unmount so the plugin can clean up. */
  dispose?: () => void
}

let buttons: PluginBarButton[] = []
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

/**
 * Backing store for `Spicetify.Playbar.Button` / `Spicetify.Topbar.Button`.
 * The mini-player and top bar render whatever plugins have registered.
 */
export const pluginButtonStore = {
  add(button: Omit<PluginBarButton, 'id'> & { id?: string }): PluginBarButton {
    const entry: PluginBarButton = {
      ...button,
      id: button.id ?? `btn_${Math.random().toString(36).slice(2, 9)}`
    }
    buttons = [...buttons, entry]
    emit()
    return entry
  },
  remove(id: string): void {
    const target = buttons.find((b) => b.id === id)
    target?.dispose?.()
    buttons = buttons.filter((b) => b.id !== id)
    emit()
  },
  clear(): void {
    for (const button of buttons) button.dispose?.()
    buttons = []
    emit()
  },
  list(target?: PluginBarTarget): PluginBarButton[] {
    return target ? buttons.filter((b) => b.target === target) : buttons
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  snapshot(): PluginBarButton[] {
    return buttons
  }
}

export function usePluginButtons(target: PluginBarTarget): PluginBarButton[] {
  const snapshot = useSyncExternalStore(
    pluginButtonStore.subscribe,
    pluginButtonStore.snapshot,
    pluginButtonStore.snapshot
  )
  return useMemo(() => snapshot.filter((button) => button.target === target), [snapshot, target])
}
