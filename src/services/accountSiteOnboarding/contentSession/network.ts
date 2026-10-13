import { runAbortableTask } from "~/services/apiTransport/abortableTask"

export const CONTENT_SESSION_REQUEST_TIMEOUT_MS = 15_000

/** Bounds request and body consumption together; session mutations are never retried here. */
export function runContentSessionRequest<T>(
  task: (signal?: AbortSignal) => Promise<T>,
): Promise<T> {
  return runAbortableTask(task, {
    timeoutMs: CONTENT_SESSION_REQUEST_TIMEOUT_MS,
  })
}
