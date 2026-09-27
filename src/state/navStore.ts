type Listener = () => void

export type ViewKind = 'home' | 'search' | 'library' | 'settings' | 'favorites' | 'recent' | 'playlist' | 'folder'

export interface Route {
  kind: ViewKind
  id?: string
}

let current: Route = { kind: 'home' }
let query = ''
const listeners = new Set<Listener>()

/**
 * Tiny hash-free router. Only the renderer cares about navigation, so a plain
 * store is cheaper than a routing library and keeps back/forward out of scope.
 */
export const navStore = {
  get: (): Route => current,
  query: (): string => query,
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  navigate(route: Route): void {
    if (route.kind === current.kind && route.id === current.id) return
    current = route
    for (const listener of listeners) listener()
  },
  setQuery(value: string): void {
    if (value === query) return
    query = value
    for (const listener of listeners) listener()
  }
}
