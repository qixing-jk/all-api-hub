import { runAbortableTask } from "~/services/apiTransport/abortableTask"
import { fetchWithHeaderOverrides } from "~/services/apiTransport/headerOverrides"

const NOTIFICATION_REQUEST_TIMEOUT_MS = 30_000

/** Bound notification header waits and abort stalled fetches holding a shared lock. */
export function fetchNotification(
  url: string,
  init: RequestInit,
): Promise<Response> {
  return runAbortableTask(
    (signal) => fetchWithHeaderOverrides(url, { ...init, signal }),
    {
      signals: [init.signal ?? undefined],
      timeoutMs: NOTIFICATION_REQUEST_TIMEOUT_MS,
    },
  )
}
