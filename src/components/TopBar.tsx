import { useEffect, useRef } from 'react'
import { Bell, ListPlus, Search, Settings, X } from 'lucide-react'
import { navStore } from '../state/navStore'
import { useRoute, useSearchQuery } from '../hooks'
import { cn } from '../lib/cn'
import { IconButton } from './IconButton'
import { usePluginButtons, type PluginBarTarget } from '../spicetify-compat/pluginButtons'

export function TopBar(): React.JSX.Element {
  const route = useRoute()
  const query = useSearchQuery()
  const inputRef = useRef<HTMLInputElement>(null)

  // Ctrl/Cmd+F jumps to the search field from anywhere in the app.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        navStore.setQuery(navStore.query())
        navStore.navigate({ kind: 'search' })
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const showSearchBox = route.kind !== 'settings'

  return (
    <header className="flex h-[var(--tg-topbar-height)] shrink-0 items-center gap-4 border-b border-divider bg-bar px-4 drag-region">
      <div
        className={cn(
          'no-drag flex h-11 min-w-0 flex-1 items-center gap-3 rounded-full border border-transparent bg-card px-4 transition-colors',
          'hover:border-divider focus-within:border-divider'
        )}
        style={{ maxWidth: 420 }}
      >
        <Search size={20} className="shrink-0 text-muted" />
        <input
          ref={inputRef}
          value={query}
          disabled={!showSearchBox}
          spellCheck={false}
          placeholder="What do you want to play?"
          aria-label="Search your library"
          onChange={(event) => navStore.setQuery(event.target.value)}
          onFocus={() => {
            if (route.kind !== 'search') navStore.navigate({ kind: 'search' })
          }}
          className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-muted disabled:cursor-not-allowed"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              navStore.setQuery('')
              inputRef.current?.focus()
            }}
            className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-muted/20 text-muted transition hover:text-ink"
          >
            <X size={12} />
          </button>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1 no-drag">
        <PluginBar target="topbar" />
        <IconButton title="Notifications" size="lg" onClick={() => navStore.navigate({ kind: 'recent' })}>
          <Bell size={20} />
        </IconButton>
        <IconButton
          title="Add to library"
          size="lg"
          onClick={() => {
            void window.tunegram.library.pickFolder()
          }}
        >
          <ListPlus size={20} />
        </IconButton>
        <IconButton title="Settings" size="lg" onClick={() => navStore.navigate({ kind: 'settings' })}>
          <Settings size={20} />
        </IconButton>
      </div>
    </header>
  )
}

/** Renders icon buttons registered by plugins through `Spicetify.Topbar.Button`. */
function PluginBar({ target }: { target: PluginBarTarget }): React.JSX.Element | null {
  const buttons = usePluginButtons(target)
  if (buttons.length === 0) return null
  return (
    <>
      {buttons.map((button) => (
        <IconButton key={button.id} title={button.label} size="lg" onClick={button.onClick}>
          {button.icon}
        </IconButton>
      ))}
    </>
  )
}
