/// <reference types="vite/client" />

import type { TuneGramApi } from '@shared/types'

declare global {
  interface Window {
    tunegram: TuneGramApi
    Spicetify?: unknown
  }
}

export {}
