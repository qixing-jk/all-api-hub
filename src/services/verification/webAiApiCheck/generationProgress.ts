import type { VerificationProgressCallback } from "~/services/verification/aiApiVerification/generationProgress"

import {
  onWebAiApiCheckMessage,
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "./messaging"

const listeners = new Map<string, VerificationProgressCallback>()
let unsubscribe: (() => void) | undefined

/** One transport listener multiplexes simultaneous probe and tool streams. */
export function subscribeGenerationProgress(
  runId: string,
  callback: VerificationProgressCallback,
) {
  if (!unsubscribe) {
    unsubscribe = onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.GenerationProgress,
      ({ data }) => {
        listeners.get(data.runId)?.(data.progress)
      },
    )
  }
  listeners.set(runId, callback)
  return () => {
    if (listeners.get(runId) !== callback) return
    listeners.delete(runId)
    if (!listeners.size) {
      unsubscribe?.()
      unsubscribe = undefined
    }
  }
}

/** Send transient evidence only to the tab that owns this request. */
export function forwardGenerationProgress(
  runId: string | undefined,
  ownerTabId: number | undefined,
  signal?: AbortSignal,
): VerificationProgressCallback {
  return (progress) => {
    if (!runId || ownerTabId === undefined || signal?.aborted) return
    void sendWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.GenerationProgress,
      { runId, progress },
      { tabId: ownerTabId },
    ).catch(() => undefined)
  }
}
