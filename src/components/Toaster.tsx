import { useEffect, useState } from 'react'
import { AlertTriangle, Check, Info, X } from 'lucide-react'
import type { PlatformInfo } from '@shared/types'
import { useNotices } from '../hooks'
import { notifyStore } from '../state/notifyStore'
import { cn } from '../lib/cn'

/** Bottom-right toast stack. */
export function Toaster(): React.JSX.Element {
  const notices = useNotices()

  return (
    <div className="pointer-events-none fixed right-4 bottom-[calc(var(--tg-player-height)+16px)] z-50 flex w-[360px] flex-col gap-2">
      {notices.map((notice) => (
        <div
          key={notice.id}
          role="status"
          className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-md border px-4 py-3 shadow-[0_16px_40px_rgb(0_0_0/0.6)] backdrop-blur-md',
            notice.kind === 'error'
              ? 'border-red-500/40 bg-[#2a1414]/95'
              : notice.kind === 'warning'
                ? 'border-warning/40 bg-[#2a2214]/95'
                : notice.kind === 'success'
                  ? 'border-accent/40 bg-[#122a1c]/95'
                  : 'border-divider bg-card/95'
          )}
        >
          <span className="mt-0.5 shrink-0">
            {notice.kind === 'error' ? (
              <AlertTriangle size={16} className="text-red-400" />
            ) : notice.kind === 'warning' ? (
              <AlertTriangle size={16} className="text-warning" />
            ) : notice.kind === 'success' ? (
              <Check size={16} className="text-accent" />
            ) : (
              <Info size={16} className="text-muted" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-ink">{notice.message}</p>
            {notice.detail ? <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{notice.detail}</p> : null}
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => notifyStore.dismiss(notice.id)}
            className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-muted transition-colors hover:text-ink"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}

export function usePlatform(): PlatformInfo | null {
  const [platform, setPlatform] = useState<PlatformInfo | null>(null)
  useEffect(() => {
    void window.tunegram.getPlatform().then(setPlatform)
  }, [])
  return platform
}
