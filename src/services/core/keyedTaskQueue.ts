import PQueue from "p-queue"

/**
 * Runs tasks under a two-level concurrency policy:
 *
 * - Tasks that share a key never overlap: one key represents one shared
 *   resource (a temporary page, a browser session).
 * - Tasks with different keys run concurrently, bounded by an optional global
 *   cap so a batch does not exhaust browser resources.
 *
 * Why this exists: both temporary-page work and browser OAuth reuse a physical
 * browser resource per key. Reporting the second same-key request as a failure
 * makes batch work fail with misleading errors ("login required"), so callers
 * queue behind the current holder instead.
 */
export interface KeyedTaskQueue {
  /** Runs `task` once the key and a global slot are both free. */
  run<T>(key: string, task: () => Promise<T>): Promise<T>
  /** Number of keys with running or waiting work; used to check for leaks. */
  readonly activeKeyCount: number
}

export interface KeyedTaskQueueOptions {
  /** Maximum tasks running at the same time across all keys. */
  concurrency?: number
}

/** Creates one queue pair: a per-key FIFO and an optional global cap. */
export function createKeyedTaskQueue(
  options: KeyedTaskQueueOptions = {},
): KeyedTaskQueue {
  const globalQueue = new PQueue({
    concurrency: options.concurrency ?? Number.POSITIVE_INFINITY,
  })
  const keyQueues = new Map<string, PQueue>()

  return {
    get activeKeyCount() {
      return keyQueues.size
    },
    async run<T>(key: string, task: () => Promise<T>): Promise<T> {
      let keyQueue = keyQueues.get(key)
      if (!keyQueue) {
        keyQueue = new PQueue({ concurrency: 1 })
        keyQueues.set(key, keyQueue)
      }

      try {
        // The key queue keeps its single slot while waiting for a global slot,
        // so later same-key tasks stay behind this one.
        return await keyQueue.add(() => globalQueue.add(task))
      } finally {
        if (
          keyQueue.pending === 0 &&
          keyQueue.size === 0 &&
          keyQueues.get(key) === keyQueue
        ) {
          keyQueues.delete(key)
        }
      }
    },
  }
}
