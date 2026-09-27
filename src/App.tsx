import { useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { DropOverlay, useFileDrop } from './hooks/useFileDrop'
import { TopBar } from './components/TopBar'
import { MiniPlayer } from './components/MiniPlayer'
import { QueuePanel } from './components/QueuePanel'
import { Toaster } from './components/Toaster'
import { Home } from './views/Home'
import { Library } from './views/Library'
import { Search } from './views/Search'
import { Settings } from './views/Settings'
import { useQueueOpen } from './state/panelStore'
import { navStore } from './state/navStore'
import { useRoute, useSearchQuery } from './hooks'
import { player } from './player/engine'

export function App(): React.JSX.Element {
  const route = useRoute()
  const query = useSearchQuery()
  const queueOpen = useQueueOpen()
  const { dragging } = useFileDrop()

  useKeyboardShortcuts()

  // An empty search box on a non-search view means "no filter", so the top bar
  // always keeps a live view of what the user typed.
  useEffect(() => {
    if (query !== '' && route.kind !== 'search' && route.kind !== 'library' && route.kind !== 'settings') {
      navStore.navigate({ kind: 'search' })
    }
  }, [query, route.kind])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-base">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="relative min-h-0 flex-1 overflow-y-auto">
            {route.kind === 'home' ? <Home /> : null}
            {route.kind === 'search' ? <Search /> : null}
            {route.kind === 'settings' ? <Settings /> : null}
            {route.kind === 'library' || route.kind === 'favorites' || route.kind === 'recent' || route.kind === 'folder' || route.kind === 'playlist' ? <Library /> : null}
            {queueOpen ? <QueuePanel /> : null}
          </main>
        </div>
      </div>
      <MiniPlayer />
      <Toaster />
      <DropOverlay visible={dragging} />
    </div>
  )
}

/** Space, arrows, and Escape — the shortcuts a music player is expected to have. */
function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      const typing =
        target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable === true

      if (event.key === 'Escape') {
        if (typing) {
          target?.blur()
          if (target instanceof HTMLInputElement && target.type === 'text') {
            navStore.setQuery('')
          }
          return
        }
        return
      }

      if (typing) return

      switch (event.key) {
        case ' ':
          event.preventDefault()
          player.togglePlay()
          break
        case 'ArrowRight':
          if (event.ctrlKey) {
            event.preventDefault()
            player.next()
          }
          break
        case 'ArrowLeft':
          if (event.ctrlKey) {
            event.preventDefault()
            player.back()
          }
          break
        case 'ArrowUp':
          event.preventDefault()
          player.setVolume(player.getSnapshot().volume + 0.05)
          break
        case 'ArrowDown':
          event.preventDefault()
          player.setVolume(player.getSnapshot().volume - 0.05)
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Media keys and the main-process command channel.
  useEffect(() => {
    return window.tunegram.window.onCommand((command) => {
      switch (command) {
        case 'play':
          player.togglePlay()
          break
        case 'next':
          player.next()
          break
        case 'prev':
          player.back()
          break
        case 'search':
          navStore.navigate({ kind: 'search' })
          break
      }
    })
  }, [])
}
