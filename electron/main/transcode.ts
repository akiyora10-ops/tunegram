import { existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { paths } from './paths'

const require_ = createRequire(import.meta.url)

/**
 * Formats Chromium's bundled media stack handles natively. Anything outside this
 * list gets routed through ffmpeg (see `needsTranscode`). The list is
 * deliberately conservative: too many entries here and playback gets flaky.
 */
const NATIVE_EXTENSIONS = new Set([
  '.mp3',
  '.wav',
  '.ogg',
  '.oga',
  '.opus',
  '.flac',
  '.m4a',
  '.m4b',
  '.aac'
])

/** Extension that `music-metadata` can actually read tags from. */
export const TAGGABLE_EXTENSIONS = new Set([
  '.mp3',
  '.wav',
  '.ogg',
  '.oga',
  '.opus',
  '.flac',
  '.m4a',
  '.m4b',
  '.aac',
  '.wma',
  '.aiff',
  '.aif',
  '.ape',
  '.wv',
  '.mpc',
  '.dsf',
  '.dff',
  '.mid',
  '.midi',
  '.alac'
])

/** Files we are confident are audio and will list as first-class tracks. */
export const AUDIO_EXTENSIONS = new Set([
  ...TAGGABLE_EXTENSIONS,
  '.mka',
  '.spx',
  '.tta',
  '.wvp',
  '.ac3',
  '.aifc',
  '.caf',
  '.amr',
  '.awb',
  '.m4r',
  '.mp2',
  '.mpga',
  '.m2a',
  '.dts',
  '.ape'
])

export function isKnownAudio(ext: string): boolean {
  return AUDIO_EXTENSIONS.has(ext.toLowerCase())
}

export function needsTranscode(ext: string): boolean {
  return !NATIVE_EXTENSIONS.has(ext.toLowerCase())
}

export function ffmpegPath(): string | null {
  try {
    const mod = require_('ffmpeg-static')
    const p = typeof mod === 'string' ? mod : (mod as { default?: string })?.default
    if (p && existsSync(p)) return p
  } catch {
    /* optional dependency not installed */
  }
  return null
}

export function ffmpegAvailable(): boolean {
  return ffmpegPath() !== null
}

interface TranscodeJob {
  promise: Promise<string | null>
}

const jobs = new Map<string, TranscodeJob>()

/**
 * Returns a path that is always playable by the `<audio>` element: the original
 * file when the format is native, otherwise a cached mp3 conversion. Results are
 * memoised per (file, mtime, size) so repeat plays of a wma are instant.
 */
export async function transcodeFile(id: string, filePath: string): Promise<string | null> {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  if (!needsTranscode(ext)) return existsSync(filePath) ? filePath : null

  const existing = jobs.get(id)
  if (existing) return existing.promise

  const promise = convert(filePath).finally(() => jobs.delete(id))
  jobs.set(id, { promise })
  return promise
}

async function convert(filePath: string): Promise<string | null> {
  const dir = paths().transcodeDir
  mkdirSync(dir, { recursive: true })

  const stats = statSync(filePath)
  const out = join(dir, `${hashKey(filePath, stats)}.mp3`)
  if (existsSync(out) && statSync(out).size > 0) return out

  const ffmpeg = ffmpegPath()
  if (!ffmpeg) {
    console.warn('[transcode] ffmpeg-static is unavailable; cannot convert', filePath)
    return null
  }

  let fluent: typeof import('fluent-ffmpeg')
  try {
    fluent = require_('fluent-ffmpeg') as typeof import('fluent-ffmpeg')
  } catch {
    return ffmpegCliConvert(ffmpeg, filePath, out)
  }

  fluent.setFfmpegPath(ffmpeg)

  return new Promise<string | null>((resolve) => {
    fluent(ffmpeg)
      .input(filePath)
      .outputOptions(['-vn', '-c:a', 'libmp3lame', '-b:a', '192k', '-map_metadata', '0'])
      .on('end', () => resolve(existsSync(out) ? out : null))
      .on('error', (err: Error) => {
        console.warn(`[transcode] failed for ${filePath}: ${err.message}`)
        cleanup(out)
        resolve(null)
      })
      .save(out)
  })
}

/** Fallback used only when fluent-ffmpeg is missing. */
function ffmpegCliConvert(ffmpeg: string, filePath: string, out: string): Promise<string | null> {
  return new Promise((resolve) => {
    const args = ['-y', '-i', filePath, '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', out]
    const proc = spawn(ffmpeg, args, { stdio: 'ignore' })
    proc.on('close', (code: number | null) => resolve(code === 0 && existsSync(out) ? out : null))
    proc.on('error', () => {
      cleanup(out)
      resolve(null)
    })
  })
}

function cleanup(file: string): void {
  try {
    if (existsSync(file)) unlinkSync(file)
  } catch {
    /* ignore */
  }
}

function hashKey(filePath: string, stats: { size: number; mtimeMs: number }): string {
  const raw = `${filePath}|${stats.size}|${Math.round(stats.mtimeMs)}`
  let h = 0x811c9dc5
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
