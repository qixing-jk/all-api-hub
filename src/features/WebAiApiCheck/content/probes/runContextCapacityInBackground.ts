import type { runContextCapacity } from "~/services/verification/modelQuality/contextCapacityRun"
import {
  onWebAiApiCheckMessage,
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"
import { safeRandomUUID } from "~/utils/core/identifier"

/** Send only configuration and compact progress across extension contexts. */
export const runContextCapacityInBackground: typeof runContextCapacity = async (
  params,
) => {
  params.abortSignal.throwIfAborted()
  const runId = safeRandomUUID()
  const remove = onWebAiApiCheckMessage(
    WebAiApiCheckMessageTypes.ContextCapacityProgress,
    ({ data }) => {
      if (data.runId === runId && !params.abortSignal.aborted)
        params.onProgress?.(data.result)
    },
  )
  let listening = true
  const dispose = () => {
    if (!listening) return
    listening = false
    remove()
  }
  const cancel = () => {
    dispose()
    void sendWebAiApiCheckMessage(WebAiApiCheckMessageTypes.CancelRunProbe, {
      runId,
    }).catch(() => undefined)
  }
  params.abortSignal.addEventListener("abort", cancel, { once: true })
  try {
    const response = await sendWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.RunContextCapacity,
      {
        runId,
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        apiType: params.apiType,
        modelId: params.modelId,
        mode: params.mode,
        requestProfile: params.requestProfile,
        requestProfileEnhanced: params.requestProfileEnhanced,
        maxInputTokens: params.maxInputTokens,
        resumeFrom: params.resumeFrom,
      },
    )
    params.abortSignal.throwIfAborted()
    if (!response.success)
      throw new Error(response.error ?? "Context capacity test failed")
    return response.result
  } finally {
    params.abortSignal.removeEventListener("abort", cancel)
    dispose()
  }
}
