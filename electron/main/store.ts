import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * Small atomic JSON file helper. Writes to a `.tmp` sibling then renames, so a
 * crash mid-write can never leave a truncated settings file behind.
 */
export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(file, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
  await rename(tmp, file)
}

/** Debounced writer, so bursts of writes hit the disk once. */
export function createJsonWriter<T>(target: string | (() => string), delay = 400) {
  const resolveFile = (): string => (typeof target === 'function' ? target() : target)
  let timer: NodeJS.Timeout | null = null
  let pending: T | null = null
  let inflight: Promise<void> = Promise.resolve()

  const flush = async (): Promise<void> => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (pending === null) return
    const value = pending
    pending = null
    const file = resolveFile()
    inflight = inflight.then(() => writeJson(file, value)).catch((e) => {
      console.error(`[store] failed to write ${file}:`, e)
    })
    return inflight
  }

  const schedule = (value: T): void => {
    pending = value
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void flush(), delay)
  }

  return { schedule, flush }
}
