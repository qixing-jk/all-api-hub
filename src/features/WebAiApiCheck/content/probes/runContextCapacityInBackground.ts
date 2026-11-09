import type { runContextCapacity } from "~/services/verification/modelQuality/contextCapacityRun"
import { runLongContextInBackground } from "~/services/verification/webAiApiCheck/longContextClient"
import {
  onWebAiApiCheckMessage,
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"

/** Send only configuration and compact progress across extension contexts. */
export const runContextCapacityInBackground: typeof runContextCapacity = (
  params,
) =>
  runLongContextInBackground({
    signal: params.abortSignal,
    subscribe: (runId) =>
      onWebAiApiCheckMessage(
        WebAiApiCheckMessageTypes.ContextCapacityProgress,
        ({ data }) => {
          if (data.runId === runId && !params.abortSignal.aborted)
            params.onProgress?.(data.result)
        },
      ),
    dispatch: (runId, recoverOnly) =>
      sendWebAiApiCheckMessage(WebAiApiCheckMessageTypes.RunContextCapacity, {
        runId,
        recoverOnly,
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        apiType: params.apiType,
        modelId: params.modelId,
        mode: params.mode,
        requestProfile: params.requestProfile,
        requestProfileEnhanced: params.requestProfileEnhanced,
        maxInputTokens: params.maxInputTokens,
        resumeFrom: params.resumeFrom,
      }),
  })
