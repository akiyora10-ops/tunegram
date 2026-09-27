import { useMemo, useState } from 'react'
import {
  Heart,
  ListVideo,
  Maximize2,
  Mic2,
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume,
  Volume1,
  Volume2,
  VolumeX
} from 'lucide-react'
import { player } from '../player/engine'
import { libraryStore } from '../state/libraryStore'
import { navStore } from '../state/navStore'
import { notifyStore } from '../state/notifyStore'
import { panelStore, useQueueOpen } from '../state/panelStore'
import { usePlayer } from '../hooks'
import { clamp, formatDuration } from '../lib/format'
import { Artwork } from './Artwork'
import { IconButton } from './IconButton'
import { Slider } from './Slider'
import { usePluginButtons } from '../spicetify-compat/pluginButtons'

export function MiniPlayer(): React.JSX.Element {
  const state = usePlayer()
  const current = state.current
  const playbarButtons = usePluginButtons('playbar')
  const queueOpen = useQueueOpen()

  // Volume is edited locally while dragging so the engine only persists once.
  // Reset the draft whenever the volume changes from anywhere else (keyboard,
  // mute, a plugin), which is React's "adjust state when a prop changes" rule
  // rather than an effect that would cause a second render pass.
  const [volumeDraft, setVolumeDraft] = useState<number | null>(null)
  const syncKey = `${state.volume}:${state.muted}`
  const [lastSyncKey, setLastSyncKey] = useState(syncKey)
  if (syncKey !== lastSyncKey) {
    setLastSyncKey(syncKey)
    setVolumeDraft(null)
  }

  const progressRatio = useMemo(() => {
    if (!state.durationMs) return 0
    return clamp(state.positionMs / state.durationMs, 0, 1)
  }, [state.positionMs, state.durationMs])

  const volume = volumeDraft ?? (state.muted ? 0 : state.volume)
  const volumeIcon = volume === 0 ? (
    <VolumeX size={18} />
  ) : volume < 0.4 ? (
    <Volume size={18} />
  ) : volume < 0.8 ? (
    <Volume1 size={18} />
  ) : (
    <Volume2 size={18} />
  )

  const repeatLabel = state.repeat === 'one' ? 'Repeat one' : state.repeat === 'all' ? 'Repeat all' : 'Repeat off'

  return (
    <footer className="flex h-[var(--tg-player-height)] shrink-0 items-center gap-2 border-t border-divider bg-bar px-2 sm:px-4">
      {/* Left: artwork + title/artist + favourite */}
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:w-[30%] sm:flex-none">
        <Artwork
          trackId={current?.id}
          hasArt={current?.hasArt}
          alt={current ? `Cover art for ${current.title}` : 'No track loaded'}
          className="h-14 w-14 rounded"
        />
        <div className="min-w-0 flex-1">
          {current ? (
            <>
              <div className="truncate text-[14px] font-semibold text-ink" title={current.title}>
                {current.title}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (current.artist) navStore.navigate({ kind: 'search' })
                }}
                className="block max-w-full truncate text-left text-[12px] text-muted hover:underline"
                title={current.artist}
              >
                {current.artist || 'Unknown Artist'}
              </button>
            </>
          ) : (
            <>
              <div className="truncate text-[14px] font-semibold text-muted/70">Nothing playing</div>
              <div className="truncate text-[12px] text-muted/60">Pick a track from your library</div>
            </>
          )}
        </div>
        {current ? (
          <IconButton
            title={current.favorite ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
            active={current.favorite}
            dim
            onClick={() => {
              void libraryStore.toggleFavorite(current.path)
            }}
          >
            <Heart size={18} fill={current.favorite ? 'currentColor' : 'none'} />
          </IconButton>
        ) : null}
      </div>

      {/* Centre: transport + progress */}
      <div className="flex shrink-0 flex-col items-center justify-center gap-1 px-2 sm:flex-1">
        <div className="flex items-center gap-1 sm:gap-2">
          <IconButton
            title="Shuffle"
            active={state.shuffle}
            dim
            onClick={() => player.toggleShuffle()}
          >
            <Shuffle size={18} />
          </IconButton>
          <IconButton title="Previous" size="lg" disabled={!current} onClick={() => player.back()}>
            <SkipBack size={22} fill="currentColor" />
          </IconButton>
          <button
            type="button"
            title={state.isPlaying ? 'Pause' : 'Play'}
            aria-label={state.isPlaying ? 'Pause' : 'Play'}
            onClick={() => player.togglePlay()}
            className="grid h-9 w-9 place-items-center rounded-full bg-ink text-black transition-transform hover:scale-105 active:scale-95"
          >
            {state.isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
          </button>
          <IconButton title="Next" size="lg" disabled={!current} onClick={() => player.next()}>
            <SkipForward size={22} fill="currentColor" />
          </IconButton>
          <IconButton
            title={repeatLabel}
            active={state.repeat !== 'off'}
            dim
            onClick={() => player.cycleRepeat()}
          >
            <span className="relative inline-flex">
              <Repeat size={18} />
              {state.repeat === 'one' ? (
                <span className="absolute -right-1 -top-1 grid h-3 w-3 place-items-center rounded-full bg-ink text-[9px] font-bold leading-none text-black">
                  1
                </span>
              ) : null}
            </span>
          </IconButton>
        </div>

        <div className="flex w-full items-center gap-2">
          <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted">
            {formatDuration(state.positionMs / 1000)}
          </span>
          <Slider
            ariaLabel="Playback position"
            value={progressRatio}
            disabled={!current}
            onChange={(ratio) => player.seekRatio(ratio)}
            className="flex-1"
          />
          <span className="w-9 shrink-0 text-[11px] tabular-nums text-muted">
            {formatDuration(state.durationMs / 1000)}
          </span>
        </div>
      </div>

      {/* Right: queue, volume, expand */}
      <div className="hidden flex-1 items-center justify-end gap-1 sm:flex sm:w-[30%]">
        <div className="flex items-center gap-0.5">
          {playbarButtons.map((button) => (
            <IconButton key={button.id} title={button.label} dim onClick={button.onClick}>
              {button.icon}
            </IconButton>
          ))}
        </div>
        <IconButton
          title="Lyrics"
          dim
          onClick={() => notifyStore.push('Lyrics are not supported for local files.', 'info')}
        >
          <Mic2 size={18} />
        </IconButton>
        <IconButton
          title="Queue"
          dim
          active={queueOpen}
          onClick={() => panelStore.toggleQueue()}
        >
          <ListVideo size={18} />
        </IconButton>
        <div className="flex items-center gap-1.5 pl-1">
          <IconButton title={state.muted ? 'Unmute' : 'Mute'} dim onClick={() => player.toggleMute()}>
            {volumeIcon}
          </IconButton>
          <Slider
            ariaLabel="Volume"
            title={`Volume: ${Math.round(volume * 100)}%`}
            value={volume}
            onChange={setVolumeDraft}
            onCommit={(value) => {
              setVolumeDraft(null)
              player.setVolume(value)
            }}
            className="w-20"
          />
        </div>
        <IconButton title="Full screen" dim onClick={() => toggleFullScreen()}>
          <Maximize2 size={18} />
        </IconButton>
      </div>

      {/* Compact controls for narrow windows */}
      <div className="flex items-center gap-1 sm:hidden">
        <IconButton title="Queue" dim active={queueOpen} onClick={() => panelStore.toggleQueue()}>
          <ListVideo size={18} />
        </IconButton>
        <IconButton title={state.muted ? 'Unmute' : 'Mute'} dim onClick={() => player.toggleMute()}>
          {volumeIcon}
        </IconButton>
      </div>
    </footer>
  )
}

function toggleFullScreen(): void {
  void window.tunegram.window.isMaximized().then((maximized) => {
    window.tunegram.window.toggleMaximize()
    notifyStore.push(maximized ? 'Restored window' : 'Maximized window', 'info', undefined, 1500)
  })
}
