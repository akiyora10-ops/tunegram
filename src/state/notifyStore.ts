export type NoticeKind = 'info' | 'success' | 'warning' | 'error'

export interface Notice {
  id: number
  message: string
  kind: NoticeKind
  detail?: string
  createdAt: number
}

type Listener = () => void

const DEFAULT_TTL = 4200
const ERROR_TTL = 9000

/** Toast queue rendered by `<Toaster />`. */
class NotifyStore {
  private notices: Notice[] = []
  private listeners = new Set<Listener>()
  private nextId = 1
  private timers = new Map<number, ReturnType<typeof setTimeout>>()

  get = (): Notice[] => this.notices

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }

  push(message: string, kind: NoticeKind = 'info', detail?: string, ttl?: number): number {
    const id = this.nextId++
    const notice: Notice = { id, message, kind, detail, createdAt: Date.now() }
    this.notices = [...this.notices, notice].slice(-5)
    this.emit()
    const timeout = ttl ?? (kind === 'error' ? ERROR_TTL : DEFAULT_TTL)
    this.timers.set(
      id,
      setTimeout(() => this.dismiss(id), timeout)
    )
    return id
  }

  dismiss(id: number): void {
    const timer = this.timers.get(id)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(id)
    }
    if (!this.notices.some((n) => n.id === id)) return
    this.notices = this.notices.filter((n) => n.id !== id)
    this.emit()
  }

  clear(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
    this.notices = []
    this.emit()
  }
}

export const notifyStore = new NotifyStore()
