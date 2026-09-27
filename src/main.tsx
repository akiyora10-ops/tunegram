import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { settingsStore } from './state/settingsStore'
import { connectLibraryEvents, libraryStore } from './state/libraryStore'
import { watchAddons } from './spicetify-compat/loader'
import { player } from './player/engine'
import { navStore } from './state/navStore'
import './styles/index.css'

async function bootstrap(): Promise<void> {
  const settings = await settingsStore.load()
  libraryStore.setSort(settings.defaultSort)
  connectLibraryEvents()
  watchAddons()

  // A library scan is expensive, so it only runs when a folder is already set.
  if (settings.lastFolder) {
    void libraryStore.rescan().then((result) => {
      if (result && result.tracks.length === 0) {
        navStore.navigate({ kind: 'home' })
      }
    })
  }

  // Restored player preferences, before the first render.
  player.applySettings(settings)
}

void bootstrap().catch((error) => {
  console.error('[tunegram] startup failed', error)
})

const container = document.getElementById('root')
if (!container) throw new Error('Root container missing')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
