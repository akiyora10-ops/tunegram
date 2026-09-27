/**
 * Placeholder artwork, shared by the main process (which serves it for tracks
 * with no embedded art) and the renderer (which shows it while a real image
 * loads, or when a track genuinely has no cover).
 */
export const MUSIC_NOTE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="#282828"/><path fill="#b3b3b3" d="M196 62v112.6a34 34 0 1 1-16-29.2V96l-64 13.5v82.9a34 34 0 1 1-16-29.2V92z"/></svg>`

let cached: string | null = null

export function musicNoteDataUri(): string {
  if (!cached) {
    const b64 = typeof btoa === 'function' ? btoa(MUSIC_NOTE_SVG) : Buffer.from(MUSIC_NOTE_SVG, 'utf8').toString('base64')
    cached = `data:image/svg+xml;base64,${b64}`
  }
  return cached
}
