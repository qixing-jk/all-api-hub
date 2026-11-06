import { CONTEXT_CHECKPOINT_LIMIT_ERROR_NAME } from "~/services/verification/modelQuality/contextCapacityConstants"
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
    const request = {
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
    }
    const response = await sendWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.RunContextCapacity,
      request,
    ).catch(async (error) => {
      params.abortSignal.throwIfAborted()
      // This message can only read a checkpoint, never dispatch provider input.
      const recovered = await sendWebAiApiCheckMessage(
        WebAiApiCheckMessageTypes.RunContextCapacity,
        { ...request, recoverOnly: true },
      ).catch(() => null)
      if (!recovered?.success) throw error
      return recovered
    })
    params.abortSignal.throwIfAborted()
    if (!response.success)
      throw Object.assign(
        new Error(response.error ?? "Context capacity test failed"),
        {
          name: response.checkpointLimitReached
            ? CONTEXT_CHECKPOINT_LIMIT_ERROR_NAME
            : "Error",
        },
      )
    return response.result
  } finally {
    params.abortSignal.removeEventListener("abort", cancel)
    dispose()
  }
}
