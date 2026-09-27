import { FolderOpen, Loader2, RefreshCw, Send } from 'lucide-react'
import { useLibrary } from '../hooks'
import { libraryStore } from '../state/libraryStore'
import { notifyStore } from '../state/notifyStore'
import { formatCount } from '../lib/format'

/** First-run screen: pick a folder, or try the Telegram downloads location. */
export function EmptyState(): React.JSX.Element {
  const library = useLibrary()

  if (library.scanning) {
    const { scanned, total, current } = library.progress
    const percent = total > 0 ? Math.round((scanned / total) * 100) : 0
    return (
      <div className="grid h-full place-items-center px-6">
        <div className="w-full max-w-sm text-center">
          <Loader2 size={28} className="mx-auto mb-4 animate-spin text-accent" />
          <h2 className="text-lg font-bold text-ink">Reading your library</h2>
          <p className="mt-1 text-[13px] text-muted">
            {total > 0 ? `${scanned.toLocaleString()} of ${total.toLocaleString()} files` : 'Looking for audio files…'}
          </p>
          <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-card">
            <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${percent}%` }} />
          </div>
          {current ? <p className="mt-2 truncate text-[12px] text-muted/70">{current}</p> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="grid h-full place-items-center px-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-card">
          <FolderOpen size={28} className="text-muted" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Point TuneGram at your music</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          Choose the folder you saved your Telegram downloads to. Every audio file inside is listed, whatever its
          format — unrecognised ones are marked so you always know what was found.
        </p>

        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => void pickFolder()}
            className="w-full rounded-full bg-accent px-6 py-3 text-[14px] font-bold text-black transition-colors hover:bg-accent-hover"
          >
            Choose music folder
          </button>
          <button
            type="button"
            onClick={() => void addTelegramFolder()}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-divider bg-card px-6 py-3 text-[14px] font-semibold text-ink transition-colors hover:bg-card-hover"
          >
            <Send size={16} />
            Use Telegram Downloads folder
          </button>
          {library.hasScanned && library.tracks.length === 0 ? (
            <button
              type="button"
              onClick={() => void libraryStore.rescan()}
              className="mt-1 flex items-center gap-2 text-[13px] text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              <RefreshCw size={14} />
              Scan again
            </button>
          ) : null}
        </div>

        {library.root ? (
          <p className="mt-6 text-[12px] text-muted">
            Last folder: <span className="text-ink">{library.root}</span>
          </p>
        ) : (
          <p className="mt-6 text-[12px] text-muted">Nothing scanned yet.</p>
        )}
      </div>
    </div>
  )
}

async function pickFolder(): Promise<void> {
  const folder = await window.tunegram.library.pickFolder()
  if (!folder) return
  const result = await libraryStore.scan(folder)
  if (result) report(result.stats.audioFiles, result.stats.unverifiedFiles)
}

async function addTelegramFolder(): Promise<void> {
  const folder = await window.tunegram.library.useTelegramFolder()
  if (!folder) {
    notifyStore.push(
      'No Telegram downloads folder found',
      'warning',
      'Expected “Downloads\\Telegram Desktop”. Pick the folder manually instead.'
    )
    return
  }
  notifyStore.push(`Scanning ${folder}`, 'info')
  const result = await libraryStore.scan(folder)
  if (result) report(result.stats.audioFiles, result.stats.unverifiedFiles)
}

function report(tracks: number, unverified: number): void {
  if (tracks === 0) {
    notifyStore.push('No audio files found in that folder', 'warning')
    return
  }
  notifyStore.push(
    `Found ${formatCount(tracks, 'audio file')}`,
    'success',
    unverified > 0 ? `${unverified} with an unrecognised extension are listed as unverified.` : undefined
  )
}
