import type {
  PelicanTestResult,
  RunPelicanTestParams,
} from "~/services/verification/modelQuality/pelican"
import { safeRandomUUID } from "~/utils/core/identifier"

import { subscribeGenerationProgress } from "./generationProgress"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "./messaging"

/**
 * The content script delegates provider access and cancellation to background.
 */
export const runPelicanInBackground: (
  params: RunPelicanTestParams & { abortSignal: AbortSignal },
) => Promise<PelicanTestResult> = async ({
  baseUrl: pelicanBaseUrl,
  apiKey: pelicanApiKey,
  apiType: pelicanApiType,
  modelId: pelicanModelId,
  mode: pelicanMode,
  prompt: pelicanPromptText,
  executionMode,
  requestProfile: pelicanRequestProfile,
  requestProfileEnhanced: pelicanRequestProfileEnhanced,
  onProgress,
  abortSignal: pelicanSignal,
}) => {
  pelicanSignal.throwIfAborted()
  const runId = safeRandomUUID()
  const cancel = () => {
    void sendWebAiApiCheckMessage(WebAiApiCheckMessageTypes.CancelRunProbe, {
      runId,
    }).catch(() => undefined)
  }
  const unsubscribe = subscribeGenerationProgress(runId, (progress) => {
    if (!pelicanSignal.aborted) onProgress?.(progress)
  })
  pelicanSignal.addEventListener("abort", cancel, { once: true })
  try {
    const response = await sendWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.RunPelican,
      {
        runId,
        executionMode,
        requestProfile: pelicanRequestProfile,
        requestProfileEnhanced: pelicanRequestProfileEnhanced,
        apiType: pelicanApiType,
        mode: pelicanMode,
        baseUrl: pelicanBaseUrl,
        apiKey: pelicanApiKey,
        modelId: pelicanModelId,
        ...(pelicanPromptText ? { prompt: pelicanPromptText } : {}),
      },
    )
    pelicanSignal.throwIfAborted()
    if (!response.success) {
      throw new Error(response.error ?? "Pelican test failed")
    }
    return response.result
  } finally {
    unsubscribe()
    pelicanSignal.removeEventListener("abort", cancel)
  }
}
