import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

let cached: Paths | null = null

export interface Paths {
  userData: string
  settingsFile: string
  libraryCacheFile: string
  pathIndexFile: string
  pluginsDir: string
  themesDir: string
  artworkDir: string
  transcodeDir: string
}

function build(): Paths {
  const userData = app.getPath('userData')
  const paths: Paths = {
    userData,
    settingsFile: join(userData, 'settings.json'),
    libraryCacheFile: join(userData, 'library-cache.json'),
    pathIndexFile: join(userData, 'path-index.json'),
    pluginsDir: join(userData, 'Plugins'),
    themesDir: join(userData, 'Themes'),
    artworkDir: join(userData, 'artwork'),
    transcodeDir: join(userData, 'transcodes')
  }
  for (const dir of [paths.pluginsDir, paths.themesDir, paths.artworkDir, paths.transcodeDir]) {
    mkdirSync(dir, { recursive: true })
  }
  return paths
}

export function paths(): Paths {
  if (!cached) cached = build()
  return cached
}

/** Root folder of the bundled app, used to resolve the preload script. */
export function appRoot(): string {
  return app.getAppPath()
}
