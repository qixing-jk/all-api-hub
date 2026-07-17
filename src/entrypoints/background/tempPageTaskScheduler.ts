import PQueue from "p-queue"

export const TEMP_PAGE_TASK_CONCURRENCY = 3

export interface TempPageTaskScheduler {
  run<T>(originKey: string, task: () => Promise<T>): Promise<T>
}

/** Adds a task to a queue while preserving task rejection semantics. */
function enqueue<T>(queue: PQueue, task: () => Promise<T>): Promise<T> {
  return queue.add(task)
}

/**
 * Limits temporary-page work globally while serializing same-origin tasks that
 * share a reusable tab.
 */
export function createTempPageTaskScheduler(
  concurrency = TEMP_PAGE_TASK_CONCURRENCY,
): TempPageTaskScheduler {
  const globalQueue = new PQueue({ concurrency })
  const originQueues = new Map<string, PQueue>()

  return {
    async run<T>(originKey: string, task: () => Promise<T>): Promise<T> {
      let originQueue = originQueues.get(originKey)
      if (!originQueue) {
        originQueue = new PQueue({ concurrency: 1 })
        originQueues.set(originKey, originQueue)
      }

      try {
        return await enqueue(originQueue, () => enqueue(globalQueue, task))
      } finally {
        if (
          originQueue.pending === 0 &&
          originQueue.size === 0 &&
          originQueues.get(originKey) === originQueue
        ) {
          originQueues.delete(originKey)
        }
      }
    },
  }
}

export const tempPageTaskScheduler = createTempPageTaskScheduler()
