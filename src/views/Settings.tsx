import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  FolderPlus,
  Info,
  Palette,
  Puzzle,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2
} from 'lucide-react'
import type { AddonInfo, PlatformInfo } from '@shared/types'
import { useLibrary, usePlayer, useSettings } from '../hooks'
import { libraryStore } from '../state/libraryStore'
import { notifyStore } from '../state/notifyStore'
import { player } from '../player/engine'
import { settingsStore } from '../state/settingsStore'
import { reloadAddons, spicetify } from '../spicetify-compat/loader'
import { cn } from '../lib/cn'
import { formatBytes, formatCount } from '../lib/format'

type Tab = 'library' | 'audio' | 'plugins'

const TABS: { id: Tab; label: string; icon: typeof FolderOpen }[] = [
  { id: 'library', label: 'Music folder', icon: FolderOpen },
  { id: 'audio', label: 'Playback', icon: CheckCircle2 },
  { id: 'plugins', label: 'Plugins & themes', icon: Puzzle }
]

export function Settings(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('library')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-6 pt-5">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Settings</h1>
        <nav className="mt-4 flex gap-1 border-b border-divider">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'flex items-center gap-2 border-b-2 px-4 py-2.5 text-[13px] font-semibold transition-colors',
                tab === id ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
              )}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {tab === 'library' ? <LibraryTab /> : null}
        {tab === 'audio' ? <AudioTab /> : null}
        {tab === 'plugins' ? <PluginsTab /> : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function LibraryTab(): React.JSX.Element {
  const settings = useSettings()
  const library = useLibrary()
  const [candidates, setCandidates] = useState<string[]>([])

  useEffect(() => {
    void window.tunegram.library.defaultFolderCandidates().then(setCandidates)
  }, [])

  async function choose(): Promise<void> {
    const folder = await window.tunegram.library.pickFolder()
    if (!folder) return
    const result = await libraryStore.scan(folder)
    if (result) {
      notifyStore.push(`Found ${formatCount(result.stats.audioFiles, 'audio file')}`, 'success')
    }
  }

  async function addTelegramFolder(): Promise<void> {
    const folder = await window.tunegram.library.useTelegramFolder()
    if (!folder) {
      notifyStore.push('No Telegram downloads folder found', 'warning')
      return
    }
    await libraryStore.scan(folder)
  }

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <section>
        <h2 className="text-[15px] font-bold text-ink">Music folder</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          TuneGram scans this folder (and every sub-folder) for audio files. Any format is accepted — files with an
          unrecognised extension are still listed, marked as unverified, and converted automatically if the built-in
          player cannot decode them.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void choose()}
            className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-[13px] font-bold text-black transition-colors hover:bg-accent-hover"
          >
            <FolderPlus size={15} />
            Choose folder…
          </button>
          <button
            type="button"
            onClick={() => void addTelegramFolder()}
            className="flex items-center gap-2 rounded-full border border-divider px-4 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-card-hover"
          >
            <Send size={15} />
            Use Telegram Downloads
          </button>
          <button
            type="button"
            disabled={!library.root || library.scanning}
            onClick={() => void libraryStore.rescan()}
            className="flex items-center gap-2 rounded-full border border-divider px-4 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-card-hover disabled:opacity-40"
          >
            <RefreshCw size={15} className={library.scanning ? 'animate-spin' : ''} />
            Rescan
          </button>
        </div>
      </section>

      <section>
        <h3 className="text-[13px] font-bold text-ink">Current folder</h3>
        <p className="mt-1 break-all text-[13px] text-muted">{library.root ?? 'None selected'}</p>
        {library.stats ? (
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] sm:grid-cols-3">
            <Stat label="Audio files" value={library.stats.audioFiles.toLocaleString()} />
            <Stat label="Unverified" value={library.stats.unverifiedFiles.toLocaleString()} />
            <Stat label="Folders" value={library.folders.length.toLocaleString()} />
            <Stat label="Unreadable" value={library.stats.unreadableFiles.toLocaleString()} />
            <Stat label="Scan time" value={`${(library.stats.durationMs / 1000).toFixed(1)}s`} />
            <Stat label="Cached tags" value={library.stats.usedCache.toLocaleString()} />
          </dl>
        ) : null}
      </section>

      <section>
        <h3 className="text-[13px] font-bold text-ink">Folders in this library</h3>
        {settings.libraryFolders.length <= 1 ? (
          <p className="mt-1 text-[13px] text-muted">Only one folder is in use. Drop files onto the window to add more.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {settings.libraryFolders.map((folder) => (
              <li key={folder} className="flex items-center justify-between gap-3 rounded bg-card px-3 py-2 text-[12px]">
                <span className="truncate text-ink">{folder}</span>
                <button
                  type="button"
                  title="Remove folder"
                  onClick={() =>
                    settingsStore.update({ libraryFolders: settings.libraryFolders.filter((f) => f !== folder) })
                  }
                  className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted transition-colors hover:text-red-400"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {candidates.length > 0 ? (
          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            Looked for Telegram downloads in: {candidates.slice(0, 3).join(', ')}…
          </p>
        ) : null}
      </section>

      <section className="rounded border border-divider bg-card p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={settings.showUnverified}
            onChange={(event) => settingsStore.update({ showUnverified: event.target.checked })}
            className="mt-0.5 h-4 w-4 accent-[var(--spice-button)]"
          />
          <span>
            <span className="block text-[13px] font-semibold text-ink">Show unrecognised files</span>
            <span className="block text-[12px] leading-relaxed text-muted">
              Keep listing files whose extension is not a known audio format. They are marked “unverified” in lists and
              converted with ffmpeg when played. Turning this off hides them.
            </span>
          </span>
        </label>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------

function AudioTab(): React.JSX.Element {
  const settings = useSettings()
  const playerState = usePlayer()
  const [platform, setPlatform] = useState<PlatformInfo | null>(null)

  useEffect(() => {
    void window.tunegram.getPlatform().then(setPlatform)
  }, [])

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <section>
        <h2 className="text-[15px] font-bold text-ink">Default volume</h2>
        <p className="mt-1 text-[13px] text-muted">Remembered across launches.</p>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round((playerState.muted ? 0 : playerState.volume) * 100)}
            onChange={(event) => player.setVolume(Number(event.target.value) / 100)}
            className="w-56 accent-[var(--spice-button)]"
          />
          <span className="w-12 text-[13px] tabular-nums text-muted">
            {Math.round((playerState.muted ? 0 : playerState.volume) * 100)}%
          </span>
        </div>
        <p className="mt-2 text-[12px] text-muted">Saved: {Math.round(settings.volume * 100)}%</p>
      </section>

      <section>
        <h2 className="text-[15px] font-bold text-ink">Format support</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          mp3, m4a, aac, wav, ogg, oga, opus and flac play directly through Chromium's media stack. Everything else —
          wma, aiff, ape, wv, mpc, alac, dsf, midi and friends — is converted to mp3 on first play with a bundled
          ffmpeg and cached afterwards.
        </p>
        <div className="mt-3 flex items-center gap-2 rounded border border-divider bg-card px-3 py-2 text-[12px]">
          {platform?.ffmpegAvailable ? (
            <CheckCircle2 size={14} className="text-accent" />
          ) : (
            <AlertTriangle size={14} className="text-warning" />
          )}
          <span className="text-muted">
            {platform?.ffmpegAvailable
              ? 'ffmpeg is available — unplayable formats will be converted automatically.'
              : 'ffmpeg was not found. Only natively supported formats will play.'}
          </span>
        </div>
        {platform?.ffmpegPath ? (
          <p className="mt-1 break-all text-[11px] text-muted/70">{platform.ffmpegPath}</p>
        ) : null}
      </section>

      <section>
        <h2 className="text-[15px] font-bold text-ink">Reset</h2>
        <button
          type="button"
          onClick={() => {
            void window.tunegram.settings.reset().then((fresh) => {
              settingsStore.update(fresh)
              notifyStore.push('Settings reset to defaults', 'success')
            })
          }}
          className="mt-3 flex items-center gap-2 rounded-full border border-divider px-4 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-card-hover"
        >
          <RotateCcw size={15} />
          Reset all settings
        </button>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------

function PluginsTab(): React.JSX.Element {
  const [addons, setAddons] = useState<AddonInfo[]>([])
  const [platform, setPlatform] = useState<PlatformInfo | null>(null)
  const unsupported = spicetify.get()?.Config.unsupported ?? []

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [list, info] = await Promise.all([window.tunegram.addons.list(), window.tunegram.getPlatform()])
      if (cancelled) return
      setAddons(list)
      setPlatform(info)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const themes = addons.filter((a) => a.kind === 'theme')
  const plugins = addons.filter((a) => a.kind === 'plugin')

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold text-ink">Themes</h2>
            <p className="mt-1 text-[13px] text-muted">
              A <code className="text-ink">.css</code> file that only overrides the{' '}
              <code className="text-ink">--spice-*</code> variables reskins the whole app.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void window.tunegram.addons.openFolder('theme')}
            className="flex items-center gap-2 rounded-full border border-divider px-3 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:bg-card-hover"
          >
            <FolderOpen size={14} />
            Open Themes folder
          </button>
        </div>
        <AddonList
          addons={themes}
          empty="No theme files yet. Drop a .css file in the Themes folder and press Rescan."
          onToggle={(addon, enabled) => void toggle(addon, enabled, setAddons)}
        />
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold text-ink">Plugins</h2>
            <p className="mt-1 text-[13px] text-muted">
              A <code className="text-ink">.js</code> file with a <code className="text-ink">window.Spicetify</code>{' '}
              global for UI injection and local playback control.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void window.tunegram.addons.openFolder('plugin')}
            className="flex items-center gap-2 rounded-full border border-divider px-3 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:bg-card-hover"
          >
            <FolderOpen size={14} />
            Open Plugins folder
          </button>
        </div>
        <AddonList
          addons={plugins}
          empty="No plugins yet. Try the bundled “Copy track info” example."
          onToggle={(addon, enabled) => void toggle(addon, enabled, setAddons)}
        />
      </section>

      <section className="rounded border border-warning/40 bg-warning/5 p-4">
        <h3 className="flex items-center gap-2 text-[13px] font-bold text-ink">
          <Info size={15} className="text-warning" />
          What this Spicetify shim does not support
        </h3>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          TuneGram plays local files only — there is no Spotify backend, no account and no streaming. Extensions that
          depend on these APIs will not work here:
        </p>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[12px] text-muted">
          {unsupported.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <button
          type="button"
          onClick={() => void reloadAddons().then(() => notifyStore.push('Reloaded plugins and themes', 'success'))}
          className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-[13px] font-bold text-black transition-colors hover:bg-accent-hover"
        >
          <RefreshCw size={15} />
          Rescan &amp; reload
        </button>
      </section>

      {platform ? (
        <section className="text-[11px] leading-relaxed text-muted/70">
          <p>
            Plugins: <span className="break-all text-muted">{platform.pluginsPath}</span>
          </p>
          <p>
            Themes: <span className="break-all text-muted">{platform.themesPath}</span>
          </p>
          <p className="mt-2">
            Changes are picked up automatically — no restart needed.{' '}
            <ExternalLink size={10} className="inline" /> app version {platform.appVersion}
          </p>
        </section>
      ) : null}
    </div>
  )
}

interface AddonListProps {
  addons: AddonInfo[]
  empty: string
  onToggle: (addon: AddonInfo, enabled: boolean) => void
}

function AddonList({ addons, empty, onToggle }: AddonListProps): React.JSX.Element {
  if (addons.length === 0) {
    return <p className="mt-3 rounded border border-dashed border-divider px-4 py-6 text-center text-[12px] text-muted">{empty}</p>
  }
  return (
    <ul className="mt-3 flex flex-col gap-2">
      {addons.map((addon) => (
        <li key={addon.id} className="flex items-center gap-3 rounded bg-card px-3 py-2.5">
          {addon.kind === 'theme' ? (
            <Palette size={15} className="shrink-0 text-muted" />
          ) : (
            <Puzzle size={15} className="shrink-0 text-muted" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-ink">{addon.fileName}</p>
            <p className="truncate text-[11px] text-muted">
              {addon.description ?? formatBytes(addon.sizeBytes)}
              {addon.description ? ` · ${formatBytes(addon.sizeBytes)}` : ''}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={addon.enabled}
            aria-label={`${addon.enabled ? 'Disable' : 'Enable'} ${addon.fileName}`}
            onClick={() => onToggle(addon, !addon.enabled)}
            className={cn(
              'relative h-6 w-11 shrink-0 rounded-full transition-colors',
              addon.enabled ? 'bg-accent' : 'bg-divider'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-[left] duration-150',
                addon.enabled ? 'left-[22px]' : 'left-0.5'
              )}
            />
          </button>
        </li>
      ))}
    </ul>
  )
}

async function toggle(
  addon: AddonInfo,
  enabled: boolean,
  setAddons: (addons: AddonInfo[]) => void
): Promise<void> {
  const updated = await window.tunegram.addons.setEnabled(addon.kind, addon.fileName, enabled)
  setAddons(updated)
  // Enabling or disabling both need a re-injection: the loader diffs the enabled
  // set and adds or removes the matching <style>/<script> elements.
  await reloadAddons()
  notifyStore.push(`${enabled ? 'Enabled' : 'Disabled'} ${addon.fileName}`, 'info', undefined, 2000)
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  )
}
