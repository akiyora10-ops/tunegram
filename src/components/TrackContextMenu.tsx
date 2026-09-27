import { useEffect, useRef } from 'react'
import { Clock, FolderOpen, Heart, ListEnd, ListPlus, ListStart, Pencil } from 'lucide-react'
import type { Track } from '@shared/types'
import { player } from '../player/engine'
import { libraryStore } from '../state/libraryStore'
import { notifyStore } from '../state/notifyStore'
import { settingsStore } from '../state/settingsStore'

interface TrackContextMenuProps {
  track: Track
  onClose: () => void
  onRemove?: () => void
}

/** Right-click menu for a track row. */
export function TrackContextMenu({ track, onClose, onRemove }: TrackContextMenuProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    // `capture` so the menu closes before the row's own handlers run.
    window.addEventListener('mousedown', onPointerDown, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('mousedown', onPointerDown, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  async function addToPlaylist(playlistId: string): Promise<void> {
    const playlists = await window.tunegram.playlists.addTracks(playlistId, [track.path])
    settingsStore.update({ playlists })
    const name = playlists.find((p) => p.id === playlistId)?.name ?? 'playlist'
    notifyStore.push(`Added to “${name}”`, 'success')
  }

  return (
    <div
      ref={ref}
      role="menu"
      className="absolute left-4 top-full z-40 mt-1 min-w-[240px] overflow-hidden rounded-md border border-divider bg-card py-1 shadow-[0_16px_40px_rgb(0_0_0/0.6)]"
    >
      <p className="truncate px-3 py-1.5 text-[13px] font-semibold text-ink" title={track.title}>
        {track.title}
      </p>
      <div className="my-1 h-px bg-divider" />

      <MenuItem
        icon={<Heart size={14} fill={track.favorite ? 'currentColor' : 'none'} />}
        label={track.favorite ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
        onClick={() => {
          void libraryStore.toggleFavorite(track.path)
          onClose()
        }}
      />
      <MenuItem
        icon={<ListEnd size={14} />}
        label="Add to queue"
        onClick={() => {
          player.addToQueue([track])
          notifyStore.push('Added to queue', 'success', undefined, 1600)
          onClose()
        }}
      />
      <MenuItem
        icon={<ListStart size={14} />}
        label="Play next"
        onClick={() => {
          player.playNextIn([track])
          onClose()
        }}
      />

      {settingsStore.get().playlists.length > 0 ? (
        <>
          <div className="my-1 h-px bg-divider" />
          <p className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted">Add to playlist</p>
          {settingsStore.get().playlists.map((playlist) => (
            <MenuItem
              key={playlist.id}
              icon={<ListPlus size={14} />}
              label={playlist.name}
              onClick={() => {
                void addToPlaylist(playlist.id)
                onClose()
              }}
            />
          ))}
        </>
      ) : null}

      {onRemove ? (
        <>
          <div className="my-1 h-px bg-divider" />
          <MenuItem
            icon={<Pencil size={14} />}
            label="Remove from this list"
            onClick={() => {
              onRemove()
              onClose()
            }}
          />
        </>
      ) : null}

      <div className="my-1 h-px bg-divider" />
      <MenuItem
        icon={<FolderOpen size={14} />}
        label="Show in folder"
        onClick={() => {
          void window.tunegram.library.revealInFolder(track.path)
          onClose()
        }}
      />
      <MenuItem
        icon={<Clock size={14} />}
        label="Played"
        onClick={() => {
          notifyStore.push(
            `Played ${track.playCount} time${track.playCount === 1 ? '' : 's'}`,
            'info',
            track.lastPlayedAt ? `Last played ${new Date(track.lastPlayedAt).toLocaleString()}` : undefined
          )
          onClose()
        }}
      />
    </div>
  )
}

interface MenuItemProps {
  icon: React.ReactNode
  label: string
  onClick: () => void
}

function MenuItem({ icon, label, onClick }: MenuItemProps): React.JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-row-hover"
    >
      <span className="text-muted">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  )
}
