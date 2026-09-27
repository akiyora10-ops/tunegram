import { useState } from 'react'
import { musicNoteDataUri } from '@shared/placeholders'
import { cn } from '../lib/cn'

interface ArtworkProps {
  /** Omitted for placeholders (mock data, empty library). */
  trackId?: string
  hasArt?: boolean
  /** Overrides the protocol URL, used for local/mock sources. */
  src?: string
  alt: string
  className?: string
}

/**
 * Album art served over the custom protocol. Falls back to a generated
 * music-note placeholder so a missing cover never leaves a broken image.
 */
export function Artwork({ trackId, hasArt, src, alt, className }: ArtworkProps): React.JSX.Element {
  const [failed, setFailed] = useState(false)

  let resolved = musicNoteDataUri()
  if (src) resolved = src
  else if (trackId && hasArt !== false && !failed) resolved = window.tunegram.playback.artworkUrl(trackId)

  return (
    <div className={cn('relative shrink-0 overflow-hidden bg-card', className)}>
      <img
        src={resolved}
        alt={alt}
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
    </div>
  )
}
