import { type RuntimeActionIds } from "~/constants/runtimeActions"
import { sendRuntimeMessage } from "~/utils/browser/runtimeMessages"

import {
  CHECK_IN_EVIDENCE_SCAN_ERRORS,
  CHECK_IN_EVIDENCE_SCAN_SESSION_TIMEOUT_MS,
} from "./scanTypes"

/** Owns the bounded remote scan wait; callers retain their result and fallback policy. */
export async function runCheckInBrowserScan<T>(input: {
  requestId: string
  cancelAction:
    | typeof RuntimeActionIds.CancelCheckinFeedbackScan
    | typeof RuntimeActionIds.CancelCheckinPageDiscovery
  signal: AbortSignal
  execute: () => Promise<T>
}): Promise<T> {
  let cancel!: () => void
  const cancelled = new Promise<never>((_resolve, reject) => {
    cancel = () => {
      void sendRuntimeMessage({
        action: input.cancelAction,
        requestId: input.requestId,
      }).catch(() => undefined)
      reject(new Error(CHECK_IN_EVIDENCE_SCAN_ERRORS.Cancelled))
    }
  })
  input.signal.addEventListener("abort", cancel, { once: true })
  const timer = setTimeout(cancel, CHECK_IN_EVIDENCE_SCAN_SESSION_TIMEOUT_MS)
  try {
    return await Promise.race([input.execute(), cancelled])
  } finally {
    clearTimeout(timer)
    input.signal.removeEventListener("abort", cancel)
  }
}
