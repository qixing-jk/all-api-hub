/** Process-local scheduling intent, read again when a queued request dispatches. */
export interface RequestScheduling {
  readonly priority: "foreground" | "background"
}

export interface ScheduledReadOptions {
  signal?: AbortSignal
  requestScheduling?: RequestScheduling
}

/**
 * Shares only pending reads for identical serializable connection configs. Each wrapper
 * owns its request identity; credentials and URL paths must not be collapsed.
 * Nested values retain their serialized identity. Completed or orphaned reads
 * never prevent a later read from seeing edits.
 */
export function sharePendingConfigRead<TConfig extends object, TResult>(
  execute: (
    config: TConfig,
    options: Required<ScheduledReadOptions>,
  ) => Promise<TResult>,
) {
  const pending = new Map<string, SharedRead<TResult>>()
  return (
    config: TConfig,
    options: ScheduledReadOptions = {},
  ): Promise<TResult> => {
    if (options.signal?.aborted) return Promise.reject(options.signal.reason)
    const key = JSON.stringify(
      Object.entries(config).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    )
    let read = pending.get(key)
    if (!read || read.signal.aborted) {
      const created = new SharedRead<TResult>(async (sharedOptions) => {
        try {
          return await execute(config, sharedOptions)
        } finally {
          if (pending.get(key) === created) pending.delete(key)
        }
      })
      pending.set(key, created)
      read = created
    }
    return read.read(options)
  }
}

/** A shared read retains work while any consumer still needs it. */
export class SharedRead<T> {
  private readonly controller = new AbortController()
  private readonly consumers = new Map<symbol, RequestScheduling | undefined>()
  private result?: Promise<T>

  constructor(
    private readonly execute: (
      options: Required<ScheduledReadOptions>,
    ) => Promise<T>,
  ) {}

  /** Exposes cancellation of the underlying read for cache eviction. */
  get signal() {
    return this.controller.signal
  }

  /** Joins once, promotes queued work for active consumers, and detaches on cancellation. */
  read(options: ScheduledReadOptions = {}): Promise<T> {
    if (options.signal?.aborted) return Promise.reject(options.signal.reason)
    if (this.signal.aborted) return Promise.reject(this.signal.reason)
    const id = Symbol()
    this.consumers.set(id, options.requestScheduling)
    const consumers = this.consumers
    const requestScheduling: RequestScheduling = {
      get priority() {
        return [...consumers.values()].some(
          (intent) => intent?.priority !== "background",
        )
          ? "foreground"
          : "background"
      },
    }
    return new Promise<T>((resolve, reject) => {
      const cleanup = () => {
        options.signal?.removeEventListener("abort", cancel)
        this.consumers.delete(id)
      }
      const cancel = () => {
        cleanup()
        if (!this.consumers.size) this.controller.abort()
        reject(
          options.signal?.reason ?? new DOMException("Aborted", "AbortError"),
        )
      }
      options.signal?.addEventListener("abort", cancel, { once: true })
      if (!this.result) {
        try {
          this.result = this.execute({ signal: this.signal, requestScheduling })
        } catch (error) {
          this.result = Promise.reject(error)
        }
      }
      void this.result.then(
        (value) => {
          cleanup()
          resolve(value)
        },
        (error) => {
          cleanup()
          reject(error)
        },
      )
    })
  }
}
