import type { getModelContextInfo } from "~/services/verification/modelQuality/contextTokens"
import { NEEDLE_RUN_REASONS } from "~/services/verification/modelQuality/needleConstants"
import type { runNeedleTest } from "~/services/verification/modelQuality/needleRun"
import type { NeedleHistoryAccess } from "~/services/verification/verificationResultHistory/needleHistory"
import type { ApiVerificationHistoryTarget } from "~/services/verification/verificationResultHistory/types"
import { runLongContextInBackground } from "~/services/verification/webAiApiCheck/longContextClient"
import {
  onWebAiApiCheckMessage,
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"

export const loadNeedleCounterInBackground: typeof getModelContextInfo = async (
  modelId,
) => {
  const response = await sendWebAiApiCheckMessage(
    WebAiApiCheckMessageTypes.ContextCounter,
    { modelId },
  )
  if (!response.success) throw new Error("Unable to load context information")
  return response.counter
}
export const needleHistoryInBackground: NeedleHistoryAccess = {
  async get(request, historyTarget) {
    const {
      baseUrl,
      apiKey,
      apiType,
      modelId,
      mode,
      requestProfile,
      requestProfileEnhanced,
      requestHeaders,
    } = request
    const response = await sendWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.NeedleHistory,
      {
        baseUrl,
        apiKey,
        apiType,
        modelId,
        mode,
        requestProfile,
        requestProfileEnhanced,
        requestHeaders,
        historyTarget,
      },
    )
    if (!response.success) throw new Error("Needle history unavailable")
    return response.summary
  },
  async save() {
    throw new Error("Needle results are saved by the background runner")
  },
}
/** Discard only records not owned by a currently running background test. */
export async function discardNeedleCheckpointsInBackground() {
  const response = await sendWebAiApiCheckMessage(
    WebAiApiCheckMessageTypes.DiscardNeedleCheckpoints,
    {},
  )
  if (!response.success)
    throw new Error("Could not discard interrupted test records")
}
export const runNeedleInBackground = (
  params: Parameters<typeof runNeedleTest>[0],
  historyTarget?: ApiVerificationHistoryTarget,
) =>
  runLongContextInBackground<Awaited<ReturnType<typeof runNeedleTest>>>({
    signal: params.abortSignal,
    acceptStoppedResult: (result) =>
      result.reason === NEEDLE_RUN_REASONS.Stopped,
    subscribe: (runId) => {
      let active = true
      let ready = false
      const remove = onWebAiApiCheckMessage(
        WebAiApiCheckMessageTypes.NeedleProgress,
        ({ data }) => {
          if (active && data.runId === runId && !params.abortSignal.aborted) {
            if (!ready && data.result.reason === NEEDLE_RUN_REASONS.Running) {
              ready = true
              params.onControls?.({
                stopSelection: async (selection) => {
                  if (!active || params.abortSignal.aborted) return false
                  const response = await sendWebAiApiCheckMessage(
                    WebAiApiCheckMessageTypes.StopNeedleSelection,
                    { runId, selection },
                  )
                  return response.cancelled
                },
              })
            }
            params.onProgress?.(data.result)
          }
        },
      )
      return () => {
        active = false
        remove()
      }
    },
    dispatch: (runId, recoverOnly) =>
      sendWebAiApiCheckMessage(WebAiApiCheckMessageTypes.RunNeedle, {
        runId,
        recoverOnly,
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        apiType: params.apiType,
        modelId: params.modelId,
        mode: params.mode,
        requestProfile: params.requestProfile,
        requestProfileEnhanced: params.requestProfileEnhanced,
        requestHeaders: params.requestHeaders,
        historyTarget,
        seed: params.seed,
        maxInputTokens: params.maxInputTokens,
        quick: params.quick,
        concurrency: params.concurrency,
        selection: params.selection,
        cancelledCells: params.cancelledCells,
        resumeFrom: params.resumeFrom,
        approvedPlan: params.approvedPlan,
        approvedCounter: params.approvedCounter,
      }),
  })
