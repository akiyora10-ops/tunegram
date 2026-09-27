import { opendir, writeFile, mkdir, rm } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, relative, sep } from 'node:path'
import { parseFile } from 'music-metadata'
import type { IAudioMetadata, IPicture } from 'music-metadata'
import type { LibraryFolder, ScanError, ScanResult, Track, TrackStatePatch } from '@shared/types'
import { paths } from './paths'
import { createJsonWriter, readJson } from './store'
import { AUDIO_EXTENSIONS, isKnownAudio } from './transcode'
import { setTrackCache, trackIdForPath } from './track-index'

const SKIP_DIRS = new Set([
  '$RECYCLE.BIN',
  'System Volume Information',
  'node_modules',
  '.git',
  '.svn',
  '.thumbnails',
  'AppData',
  'Cache',
  'cache'
])

const MAX_ART_BYTES = 4 * 1024 * 1024
const METADATA_CONCURRENCY = 8

interface CachedMeta {
  sizeBytes: number
  modifiedMs: number
  title: string
  artist: string
  album: string
  year: number | null
  genre: string | null
  trackNo: number | null
  discNo: number | null
  duration: number
  hasArt: boolean
  codec: string | null
  bitrate: number | null
  sampleRate: number | null
  channels: number | null
}

let cache = new Map<string, CachedMeta>()
const cacheWriter = createJsonWriter<Record<string, CachedMeta>>(() => paths().libraryCacheFile)

export async function loadMetaCache(): Promise<void> {
  const stored = await readJson<Record<string, CachedMeta>>(paths().libraryCacheFile, {})
  cache = new Map(Object.entries(stored))
}

export interface ScanHooks {
  onProgress?: (scanned: number, total: number, current: string) => void
}

export async function scanLibrary(root: string, hooks: ScanHooks = {}): Promise<ScanResult> {
  const started = Date.now()
  const errors: ScanError[] = []
  const files: string[] = []

  await walk(root, files, errors)

  const { onProgress } = hooks
  onProgress?.(0, files.length, '')

  const tracks: Track[] = []
  const folderCounts = new Map<string, number>()
  let unverified = 0
  let usedCache = 0

  const state = trackState

  let cursor = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = cursor++
      if (i >= files.length) return
      const filePath = files[i]
      const built = await buildTrack(root, filePath, state, errors)
      if (built) {
        if (built.cached) usedCache++
        tracks.push(built.track)
        if (!built.track.verified) unverified++
        folderCounts.set(built.track.folder, (folderCounts.get(built.track.folder) ?? 0) + 1)
      }
      if (i % 10 === 0 || i === files.length - 1) onProgress?.(i + 1, files.length, basename(filePath))
    }
  }

  await Promise.all(Array.from({ length: METADATA_CONCURRENCY }, worker))

  tracks.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }))

  const keptPaths = new Set(tracks.map((t) => t.path))
  pruneCache(keptPaths)
  setTrackCache(tracks)
  saveTrackState(state)

  const folders: LibraryFolder[] = [...folderCounts.entries()]
    .filter(([name]) => name !== '')
    .map(([name, trackCount]) => ({ name, path: join(root, name), trackCount }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))

  return {
    root,
    tracks,
    folders,
    errors: errors.slice(0, 200),
    stats: {
      filesFound: files.length,
      audioFiles: tracks.length,
      unverifiedFiles: unverified,
      unreadableFiles: errors.length,
      durationMs: Date.now() - started,
      usedCache
    }
  }
}

async function walk(dir: string, out: string[], errors: ScanError[]): Promise<void> {
  let dirents
  try {
    dirents = await opendir(dir)
  } catch (error) {
    errors.push({ path: dir, message: describe(error) })
    return
  }

  const subDirs: string[] = []
  try {
    for await (const entry of dirents) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name.startsWith('$') || SKIP_DIRS.has(entry.name)) continue
        subDirs.push(full)
        continue
      }
      if (!entry.isFile()) continue
      const ext = extname(entry.name).toLowerCase()
      if (AUDIO_EXTENSIONS.has(ext)) {
        out.push(full)
      } else if (looksLikeAudio(ext)) {
        // Unknown extension: still listed so nothing silently disappears, but
        // marked unverified so the UI can badge it.
        out.push(full)
      }
    }
  } catch (error) {
    errors.push({ path: dir, message: describe(error) })
  }

  for (const sub of subDirs) await walk(sub, out, errors)
}

const UNKNOWN_AUDIO_HINTS = ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.opus', '.aac', '.wma', '.aiff', '.ape', '.wv', '.mpc', '.dsf', '.mid', '.midi', '.alac', '.m4b', '.oga', '.aif']

/**
 * Heuristic for files with an unrecognised extension. Deliberately generous:
 * Telegram download folders are full of renamed and extension-less media.
 */
function looksLikeAudio(ext: string): boolean {
  if (ext === '') return false
  if (UNKNOWN_AUDIO_HINTS.some((hint) => ext.endsWith(hint) || hint.endsWith(ext))) return true
  return false
}

async function buildTrack(
  root: string,
  filePath: string,
  state: Map<string, TrackStatePatch>,
  errors: ScanError[]
): Promise<{ track: Track; cached: boolean } | null> {
  let stats
  try {
    stats = statSync(filePath)
  } catch (error) {
    errors.push({ path: filePath, message: describe(error) })
    return null
  }

  const ext = extname(filePath).toLowerCase()
  const id = trackIdForPath(filePath)
  const rel = relative(root, dirname(filePath))
  const folder = rel === '' ? '' : rel.split(sep).join('/')
  const s = state.get(filePath)

  const { meta, cached } = await readMeta(filePath, stats.size, stats.mtimeMs, ext, errors)

  return {
    cached,
    track: {
      id,
      path: filePath,
      fileName: basename(filePath),
      ext,
      sizeBytes: stats.size,
      modifiedMs: stats.mtimeMs,
      folder,
      folderPath: dirname(filePath),
      title: meta.title || stripExtension(basename(filePath)),
      artist: meta.artist,
      album: meta.album,
      year: meta.year,
      genre: meta.genre,
      trackNo: meta.trackNo,
      discNo: meta.discNo,
      duration: meta.duration,
      hasArt: meta.hasArt,
      codec: meta.codec,
      bitrate: meta.bitrate,
      sampleRate: meta.sampleRate,
      channels: meta.channels,
      verified: isKnownAudio(ext),
      addedAt: stats.mtimeMs,
      playCount: s?.playCount ?? 0,
      lastPlayedAt: s?.playedAt ?? null,
      favorite: s?.favorite ?? false
    }
  }
}

interface ReadMetaResult {
  meta: CachedMeta
  cached: boolean
}

async function readMeta(
  filePath: string,
  size: number,
  mtimeMs: number,
  ext: string,
  errors: ScanError[]
): Promise<ReadMetaResult> {
  const hit = cache.get(filePath)
  if (hit && hit.sizeBytes === size && hit.modifiedMs === mtimeMs) {
    return { meta: hit, cached: true }
  }

  const fallback: CachedMeta = {
    sizeBytes: size,
    modifiedMs: mtimeMs,
    title: '',
    artist: '',
    album: '',
    year: null,
    genre: null,
    trackNo: null,
    discNo: null,
    duration: 0,
    hasArt: false,
    codec: null,
    bitrate: null,
    sampleRate: null,
    channels: null
  }

  if (!AUDIO_EXTENSIONS.has(ext)) return { meta: fallback, cached: false }

  let parsed: IAudioMetadata
  try {
    parsed = await parseFile(filePath, { duration: true, skipCovers: false })
  } catch (error) {
    errors.push({ path: filePath, message: describe(error) })
    return { meta: fallback, cached: false }
  }

  const common = parsed.common
  const fmt = parsed.format
  const picture = common.picture?.[0]

  const result: CachedMeta = {
    ...fallback,
    title: clean(common.title),
    artist: clean(common.artist) || clean(common.albumartist) || 'Unknown Artist',
    album: clean(common.album),
    year: common.year ?? null,
    genre: clean(common.genre) || null,
    trackNo: common.track?.no ?? null,
    discNo: common.disk?.no ?? null,
    duration: fmt?.duration && Number.isFinite(fmt.duration) ? fmt.duration : 0,
    hasArt: !!picture && picture.data.length <= MAX_ART_BYTES,
    codec: fmt?.codec ? clean(fmt.codec) : null,
    bitrate: fmt?.bitrate ?? null,
    sampleRate: fmt?.sampleRate ?? null,
    channels: fmt?.numberOfChannels ?? null
  }

  if (result.hasArt && picture) {
    const ok = await writeArtwork(trackIdForPath(filePath), picture)
    if (!ok) result.hasArt = false
  }

  cache.set(filePath, result)
  cacheWriter.schedule(Object.fromEntries(cache))
  return { meta: result, cached: false }
}

// ---------------------------------------------------------------------------
// Cover art cache
// ---------------------------------------------------------------------------

const ART_MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'image/x-ms-bmp': '.bmp'
}

export function artworkFileFor(id: string): string | null {
  const dir = paths().artworkDir
  for (const ext of Object.values(ART_MIME_EXT)) {
    const candidate = join(dir, `${id}${ext}`)
    if (existsSync(candidate)) return candidate
  }
  const jpg = join(dir, `${id}.jpg`)
  return existsSync(jpg) ? jpg : null
}

async function writeArtwork(id: string, picture: IPicture): Promise<boolean> {
  const dir = paths().artworkDir
  try {
    await mkdir(dir, { recursive: true })
    const ext = ART_MIME_EXT[picture.format] ?? '.jpg'
    const target = join(dir, `${id}${ext}`)
    await writeFile(target, picture.data)
    if (ext !== '.jpg') {
      const stale = join(dir, `${id}.jpg`)
      if (existsSync(stale)) await rm(stale, { force: true })
    }
    return true
  } catch (error) {
    console.warn('[library] could not cache artwork:', describe(error))
    return false
  }
}

/** Lazily extracts cover art for a file that was not (or no longer is) cached. */
export async function ensureArtwork(id: string, filePath: string): Promise<string | null> {
  const existing = artworkFileFor(id)
  if (existing) return existing
  try {
    const parsed = await parseFile(filePath, { duration: false, skipCovers: false })
    const picture = parsed.common.picture?.[0]
    if (picture) {
      await writeArtwork(id, picture)
      return artworkFileFor(id)
    }
  } catch {
    /* no embedded art */
  }
  return null
}

// ---------------------------------------------------------------------------
// Per-track state (favourites, play counts)
// ---------------------------------------------------------------------------

interface TrackStateFile {
  [path: string]: TrackStatePatch
}

let trackState = new Map<string, TrackStatePatch>()
const stateWriter = createJsonWriter<TrackStateFile>(() => trackStateFilePath())

function trackStateFilePath(): string {
  return join(paths().userData, 'track-state.json')
}

function saveTrackState(state: Map<string, TrackStatePatch>): void {
  trackState = state
  stateWriter.schedule(Object.fromEntries(state) as TrackStateFile)
}

export async function loadTrackStateFile(): Promise<void> {
  const stored = await readJson<TrackStateFile>(trackStateFilePath(), {})
  trackState = new Map(Object.entries(stored))
}

export function setTrackState(patch: TrackStatePatch): void {
  const next = new Map(trackState)
  const prev = next.get(patch.path)
  const prevPlayCount = prev?.playCount ?? 0
  next.set(patch.path, {
    path: patch.path,
    favorite: patch.favorite ?? prev?.favorite ?? false,
    playCount: (patch.playCountDelta ?? 0) + (patch.playCount ?? prevPlayCount),
    playedAt: patch.playedAt === undefined ? (prev?.playedAt ?? null) : patch.playedAt
  })
  saveTrackState(next)
}

function pruneCache(keep: Set<string>): void {
  for (const key of [...cache.keys()]) {
    if (!keep.has(key)) cache.delete(key)
  }
  cacheWriter.schedule(Object.fromEntries(cache))
}

// ---------------------------------------------------------------------------

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

function clean(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.replace(/\0/g, '').trim()
  return trimmed === '[Unknown]' ? '' : trimmed
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
