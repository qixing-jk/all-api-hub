import type { RequestScheduling } from "~/services/apiTransport/requestScheduling"
import { createSiteRequestLeaseLimiter } from "~/services/apiTransport/siteRequestLimiter"

type SiteRequestDispatch<T> = Promise<T> | { result: Promise<T> }

/** Runs the task shape accepted by mocked plain and lease site limiters. */
export async function runMockSiteRequestTask<T>(
  task: () => SiteRequestDispatch<T>,
): Promise<T> {
  const dispatched = task()
  return await ("result" in dispatched ? dispatched.result : dispatched)
}

/** Makes a lease whose transport completes when the fixture task settles. */
export function createTaskLease<T>(task: () => Promise<T>) {
  let result: Promise<T>
  try {
    result = Promise.resolve(task())
  } catch (error) {
    result = Promise.reject(error)
  }
  return {
    result,
    completion: result.then(
      () => undefined,
      () => undefined,
    ),
  }
}

/** Runs task fixtures through the same lease limiter used by production. */
export function createTaskLimiter(
  config: Parameters<typeof createSiteRequestLeaseLimiter>[0],
) {
  const limit = createSiteRequestLeaseLimiter(config)
  return async <T>(
    key: string,
    task: () => Promise<T>,
    signal?: AbortSignal,
    scheduling?: RequestScheduling,
  ) => await limit(key, () => createTaskLease(task), signal, scheduling)
}
