import { useSyncExternalStore } from 'react'

type Listener = () => void

let queueOpen = false
const listeners = new Set<Listener>()

function emit(): void {
  for (const listener of listeners) listener()
}

/** Transient UI panels that sit above the content area. */
export const panelStore = {
  isQueueOpen: (): boolean => queueOpen,
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  setQueueOpen(open: boolean): void {
    if (queueOpen === open) return
    queueOpen = open
    emit()
  },
  toggleQueue(): void {
    queueOpen = !queueOpen
    emit()
  }
}

export function useQueueOpen(): boolean {
  return useSyncExternalStore(
    panelStore.subscribe,
    panelStore.isQueueOpen,
    panelStore.isQueueOpen
  )
}
