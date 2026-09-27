import { type ClassValue } from './clsx'

/**
 * Minimal classname joiner. Deliberately not `clsx`/`tailwind-merge`: the app
 * has a fixed, known set of utilities, and ordering conflicts do not come up.
 */
export function cn(...values: ClassValue[]): string {
  const out: string[] = []
  for (const value of values) {
    if (!value) continue
    if (typeof value === 'string') out.push(value)
    else if (Array.isArray(value)) {
      const nested = cn(...(value as ClassValue[]))
      if (nested) out.push(nested)
    } else if (typeof value === 'object') {
      for (const [key, enabled] of Object.entries(value)) {
        if (enabled) out.push(key)
      }
    }
  }
  return out.join(' ')
}
