import { protocol } from 'electron'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import { extname } from 'node:path'
import { MEDIA_SCHEME } from '@shared/ipc'
import { MUSIC_NOTE_SVG } from '@shared/placeholders'
import { artworkFileFor, ensureArtwork } from './library'
import { transcodeFile } from './transcode'
import { pathForTrackId } from './track-index'

const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.m4b': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.flac': 'audio/flac',
  '.wma': 'audio/x-ms-wma',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.ape': 'audio/x-ape',
  '.wv': 'audio/x-wavpack',
  '.mpc': 'audio/x-musepack',
  '.alac': 'audio/mp4',
  '.dsf': 'audio/dsd',
  '.dff': 'audio/dsd',
  '.mid': 'audio/midi',
  '.midi': 'audio/midi',
  '.m3u': 'audio/x-mpegurl',
  '.m3u8': 'application/vnd.apple.mpegurl'
}

/**
 * The renderer loads from a `file://` (or dev http) origin, which makes every
 * `tunegram://` request cross-origin. Media elements do not need this, but
 * `fetch` and cached artwork do.
 */
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges'
}

export function mimeForPath(filePath: string): string {
  return MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

export function registerMediaProtocol(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: false,
        corsEnabled: true
      }
    }
  ])
}

/**
 * Installed after `app.whenReady()`. Serves two things:
 *   tunegram://track/<id>  the audio file (or its ffmpeg-transcoded copy)
 *   tunegram://art/<id>    the embedded cover art, or a generated placeholder
 *
 * Range requests are handled by hand: Chromium's media stack relies on them
 * for seeking, and a plain file response makes the progress bar jumpy.
 */
export function installMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    let url: URL
    try {
      url = new URL(request.url)
    } catch {
      return new Response('Bad request', { status: 400 })
    }
    // tunegram://track/<id>  ->  hostname 'track', pathname '/<id>'
    const id = decodeURIComponent(url.pathname.replace(/^\/+/, '').split('/')[0] ?? '')
    if (!id) return new Response('Missing id', { status: 400 })

    try {
      if (url.hostname === 'art') {
        return await serveArtwork(id)
      }
      if (url.hostname === 'track') {
        return await serveAudio(request, id)
      }
      return new Response('Not found', { status: 404 })
    } catch (error) {
      console.error('[media] request failed:', error)
      return new Response('Internal error', { status: 500 })
    }
  })
}

async function serveArtwork(id: string): Promise<Response> {
  const existing = artworkFileFor(id)
  if (existing) return fileResponse(existing, 'full')

  const path = pathForTrackId(id)
  const file = path ? await ensureArtwork(id, path) : null
  if (file) return fileResponse(file, 'full')

  return new Response(MUSIC_NOTE_SVG, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'max-age=86400',
      ...CORS
    }
  })
}

async function serveAudio(request: Request, id: string): Promise<Response> {
  const path = pathForTrackId(id)
  if (!path) return new Response('Track not found', { status: 404 })
  if (!existsSync(path)) return new Response('File missing', { status: 410 })

  // Formats Chromium cannot decode natively get converted once and cached.
  const transcoded = await transcodeFile(id, path)
  if (!transcoded) return new Response('Unplayable', { status: 415 })

  return fileResponse(transcoded, request.headers.get('range'), mimeForPath(transcoded))
}

function fileResponse(
  filePath: string,
  range: string | null | 'full',
  contentType = mimeForPath(filePath)
): Response {
  const stats = statSync(filePath)
  const total = stats.size
  const type = contentType.startsWith('audio/') || contentType.startsWith('image/') ? contentType : 'application/octet-stream'

  if (range && range !== 'full') {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    if (match) {
      const startRaw = match[1]
      const endRaw = match[2]
      let start: number
      let end: number
      if (startRaw === '') {
        // suffix range: last N bytes
        const suffix = Number(endRaw ?? 0)
        start = Math.max(0, total - suffix)
        end = total - 1
      } else {
        start = Number(startRaw)
        end = endRaw === '' ? total - 1 : Number(endRaw)
      }
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${total}`, ...CORS }
        })
      }
      end = Math.min(end, total - 1)
      const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream
      return new Response(stream, {
        status: 206,
        headers: {
          'Content-Type': type,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store',
          ...CORS
        }
      })
    }
  }

  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream
  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Content-Length': String(total),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      ...CORS
    }
  })
}
