/**
 * Shared storage write lock helper.
 *
 * Why this exists:
 * - Browser extension contexts (popup/options/background) can concurrently perform
 *   read-modify-write cycles against `@plasmohq/storage`.
 * - The Web Locks API (navigator.locks) is the best-effort cross-context mutex,
 *   but is not always available (e.g. some test environments).
 * - When Web Locks are not available we still want deterministic ordering within
 *   a single JS context, so we also maintain an in-memory FIFO queue.
 *
 * IMPORTANT:
 * - The in-memory queue only coordinates within the current JS context.
 * - The Web Locks API coordinates across contexts for the same `lockName`.
 */

const inMemoryQueues = new Map<string, Promise<void>>()

/**
 * Execute a unit of work under an exclusive lock.
 *
 * Use a stable lock name for related storage keys that must be updated together
 * (e.g. accounts + global tags).
 */
export async function withExtensionStorageWriteLock<T>(
  lockName: string,
  work: () => Promise<T>,
): Promise<T> {
  const runWithInMemoryQueue = async (queuedWork: () => Promise<T>) => {
    const previous = inMemoryQueues.get(lockName) ?? Promise.resolve()
    const run = previous.then(() => queuedWork())
    inMemoryQueues.set(
      lockName,
      run.then(
        () => undefined,
        () => undefined,
      ),
    )
    return run
  }

  const maybeLocks = (
    globalThis as unknown as { navigator?: { locks?: unknown } }
  ).navigator?.locks

  if (
    maybeLocks &&
    typeof (maybeLocks as { request?: unknown }).request === "function"
  ) {
    type AsyncLockManager = {
      request<T>(
        name: string,
        options: LockOptions,
        callback: (lock: Lock | null) => Promise<T>,
      ): Promise<T>
    }
    const asyncLocks = maybeLocks as AsyncLockManager
    return runWithInMemoryQueue(() =>
      asyncLocks.request(lockName, { mode: "exclusive" }, () => work()),
    )
  }

  return runWithInMemoryQueue(work)
}
