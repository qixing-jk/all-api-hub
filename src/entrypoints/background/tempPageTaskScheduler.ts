import { createKeyedTaskQueue } from "~/services/core/keyedTaskQueue"

export const TEMP_PAGE_TASK_CONCURRENCY = 3

export interface TempPageTaskScheduler {
  run<T>(originKey: string, task: () => Promise<T>): Promise<T>
}

/**
 * Limits temporary-page work globally while serializing same-origin tasks that
 * share a reusable tab.
 */
export function createTempPageTaskScheduler(
  concurrency = TEMP_PAGE_TASK_CONCURRENCY,
): TempPageTaskScheduler {
  return createKeyedTaskQueue({ concurrency })
}

export const tempPageTaskScheduler = createTempPageTaskScheduler()
