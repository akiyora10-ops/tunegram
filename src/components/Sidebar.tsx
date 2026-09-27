import { useMemo, useState } from 'react'
import { Disc3, FolderPlus, Heart, Home, ListMusic, Plus, Search, Sparkles } from 'lucide-react'
import { navStore, type ViewKind } from '../state/navStore'
import { useLibrary, useRoute, useSettings } from '../hooks'
import { cn } from '../lib/cn'
import { formatCount } from '../lib/format'
import { libraryStore } from '../state/libraryStore'
import { notifyStore } from '../state/notifyStore'
import { settingsStore } from '../state/settingsStore'
import { AppMark } from './AppMark'

const NAV_ITEMS: { kind: ViewKind; label: string; icon: typeof Home }[] = [
  { kind: 'home', label: 'Home', icon: Home },
  { kind: 'search', label: 'Search', icon: Search },
  { kind: 'library', label: 'Your Library', icon: ListMusic }
]

export function Sidebar(): React.JSX.Element {
  const route = useRoute()
  const settings = useSettings()
  const library = useLibrary()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  // The store hands out a new state object on every mutation, so `library`
  // identity is a sufficient dependency.
  const favoritesCount = useMemo(() => library.tracks.reduce((n, t) => n + (t.favorite ? 1 : 0), 0), [library])

  async function createPlaylist(): Promise<void> {
    const trimmed = name.trim()
    setCreating(false)
    setName('')
    try {
      const created = await window.tunegram.playlists.create(trimmed)
      const current = settingsStore.get().playlists
      settingsStore.update({ playlists: [...current, created] })
      navStore.navigate({ kind: 'playlist', id: created.id })
      notifyStore.push(`Created “${created.name}”`, 'success')
    } catch (error) {
      notifyStore.push(`Could not create playlist: ${describe(error)}`, 'error')
    }
  }

  return (
    <nav className="flex h-full w-[var(--tg-sidebar-width)] shrink-0 flex-col border-r border-divider bg-sidebar">
      <div className="flex h-[var(--tg-topbar-height)] items-center gap-2.5 px-4 drag-region">
        <AppMark className="h-7 w-7" />
        <span className="text-[17px] font-bold tracking-tight text-ink">TuneGram</span>
      </div>

      <div className="flex flex-col gap-1 px-2 pb-2">
        {NAV_ITEMS.map(({ kind, label, icon: Icon }) => (
          <NavItem
            key={kind}
            label={label}
            icon={<Icon size={20} strokeWidth={2} />}
            active={route.kind === kind}
            onClick={() => navStore.navigate({ kind })}
          />
        ))}
        <NavItem
          label="Liked Songs"
          icon={<Heart size={20} strokeWidth={2} />}
          active={route.kind === 'favorites'}
          badge={favoritesCount}
          onClick={() => navStore.navigate({ kind: 'favorites' })}
        />
        <NavItem
          label="Recently Played"
          icon={<Sparkles size={20} strokeWidth={2} />}
          active={route.kind === 'recent'}
          onClick={() => navStore.navigate({ kind: 'recent' })}
        />
      </div>

      <div className="mx-4 my-1 h-px bg-divider" />

      <div className="flex items-center justify-between px-4 pb-1 pt-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Playlists</span>
        <button
          type="button"
          title="Create playlist"
          aria-label="Create playlist"
          onClick={() => setCreating(true)}
          className="no-drag grid h-6 w-6 place-items-center rounded-full text-muted transition hover:text-ink"
        >
          <Plus size={16} />
        </button>
      </div>

      {creating ? (
        <div className="px-3 pb-2">
          <input
            autoFocus
            value={name}
            placeholder="Playlist name"
            onChange={(event) => setName(event.target.value)}
            onBlur={() => void createPlaylist()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void createPlaylist()
              if (event.key === 'Escape') {
                setCreating(false)
                setName('')
              }
            }}
            className="w-full rounded border border-divider bg-card px-2 py-1 text-sm text-ink outline-none focus:border-accent"
          />
        </div>
      ) : null}

      <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {settings.playlists.length === 0 ? (
          <p className="px-2 py-1 text-[12px] leading-relaxed text-muted">No playlists yet. Create one to group your downloads.</p>
        ) : (
          <ul className="flex flex-col">
            {settings.playlists.map((playlist) => (
              <li key={playlist.id}>
                <button
                  type="button"
                  onClick={() => navStore.navigate({ kind: 'playlist', id: playlist.id })}
                  className={cn(
                    'group flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-[13px] transition-colors',
                    route.kind === 'playlist' && route.id === playlist.id
                      ? 'bg-highlight text-ink'
                      : 'text-muted hover:bg-row-hover hover:text-ink'
                  )}
                >
                  <Disc3 size={16} className="shrink-0 opacity-70" />
                  <span className="min-w-0 flex-1 truncate">{playlist.name}</span>
                  <span className="shrink-0 text-[11px] text-muted/70">{playlist.trackPaths.length}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 px-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Folders</span>
            {library.folders.length > 0 ? (
              <span className="text-[11px] text-muted/70">{library.folders.length}</span>
            ) : null}
          </div>
          {library.folders.length === 0 ? (
            <p className="text-[12px] leading-relaxed text-muted">
              {library.hasScanned ? 'No sub-folders found in your library.' : 'Choose a music folder to get started.'}
            </p>
          ) : (
            <ul className="flex flex-col">
              {library.folders.slice(0, 60).map((folder) => (
                <li key={folder.path}>
                  <button
                    type="button"
                    onClick={() => navStore.navigate({ kind: 'folder', id: folder.name })}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-[13px] transition-colors',
                      route.kind === 'folder' && route.id === folder.name
                        ? 'bg-highlight text-ink'
                        : 'text-muted hover:bg-row-hover hover:text-ink'
                    )}
                  >
                    <span className="grid h-4 w-4 shrink-0 place-items-center text-[10px] text-accent">▸</span>
                    <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                    <span className="shrink-0 text-[11px] text-muted/70">{folder.trackCount}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="border-t border-divider p-3">
        <button
          type="button"
          onClick={() => void addFolderFlow()}
          className="flex w-full items-center gap-2 rounded bg-card px-3 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-card-hover"
        >
          <FolderPlus size={16} />
          Add music folder
        </button>
        {library.root ? (
          <p className="mt-2 truncate text-[11px] text-muted" title={library.root}>
            {library.root}
          </p>
        ) : null}
      </div>
    </nav>
  )
}

async function addFolderFlow(): Promise<void> {
  const folder = await window.tunegram.library.pickFolder()
  if (!folder) return
  notifyStore.push('Scanning folder…', 'info')
  const result = await libraryStore.scan(folder)
  if (result) {
    notifyStore.push(
      `Added ${formatCount(result.stats.audioFiles, 'track')}`,
      'success',
      result.stats.unverifiedFiles > 0 ? `${result.stats.unverifiedFiles} file(s) with an unusual extension were listed as unverified.` : undefined
    )
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface NavItemProps {
  label: string
  icon: React.ReactNode
  active: boolean
  onClick: () => void
  badge?: number
}

function NavItem({ label, icon, active, onClick, badge }: NavItemProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded px-3 py-2 text-[14px] font-semibold transition-colors',
        active ? 'bg-highlight text-ink' : 'text-muted hover:text-ink'
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {badge !== undefined && badge > 0 ? <span className="text-[11px] font-normal text-muted">{badge}</span> : null}
    </button>
  )
}
