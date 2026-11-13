import { toVersionedProtocolMount } from "~/services/aiApi/protocolAddress"
import {
  API_TYPES,
  API_VERIFICATION_MODES,
} from "~/services/verification/aiApiVerification"
import { isVerificationRequestProfile } from "~/services/verification/aiApiVerification/requestProfiles"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import { CONTEXT_CHECKPOINT_LIMIT_ERROR_NAME } from "~/services/verification/modelQuality/contextCapacityConstants"
import { CONTEXT_CAPACITY_DEFAULTS } from "~/services/verification/modelQuality/contextCapacityDefaults"
import type { NeedleRunControls } from "~/services/verification/modelQuality/needleRun"
import { contextCapacityHistory } from "~/services/verification/verificationResultHistory/contextCapacityHistory"
import { CONTEXT_HISTORY_ACTIONS } from "~/services/verification/webAiApiCheck/constants"
import { runDurableContextCapacity } from "~/services/verification/webAiApiCheck/contextCapacityCheckpoint"
import { normalizeProbeBaseUrl } from "~/services/verification/webAiApiCheck/credentialExtraction/baseUrlCandidates"

import { needleRunControls, probeRuns } from "./backgroundRunState"
import { hasValidRequestHeaders } from "./backgroundUtils"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "./messaging"
import { runDurableNeedleTest } from "./needleCheckpoint"
import type {
  ApiCheckContextHistoryRequest,
  ApiCheckContextHistoryResponse,
  ApiCheckRunContextCapacityRequest,
  ApiCheckRunContextCapacityResponse,
  ApiCheckRunNeedleRequest,
  ApiCheckRunNeedleResponse,
} from "./types"

/** Keep request fingerprinting and persistence in the secure extension context. */
export async function resolveContextHistory({
  request,
  action,
  result,
}: ApiCheckContextHistoryRequest): Promise<ApiCheckContextHistoryResponse> {
  if (
    !request ||
    !Object.values(API_TYPES).includes(request.apiType) ||
    typeof request.apiKey !== "string" ||
    !request.apiKey.trim() ||
    typeof request.baseUrl !== "string" ||
    typeof request.modelId !== "string" ||
    !request.modelId.trim() ||
    !normalizeProbeBaseUrl(request) ||
    !Object.values(CONTEXT_HISTORY_ACTIONS).includes(action)
  )
    return { success: false }
  if (
    request.mode !== undefined &&
    !Object.values(API_VERIFICATION_MODES).includes(request.mode)
  )
    return { success: false }
  if (
    request.requestProfile !== undefined &&
    !isVerificationRequestProfile(request.requestProfile)
  )
    return { success: false }
  try {
    const summary =
      action === CONTEXT_HISTORY_ACTIONS.Get
        ? await contextCapacityHistory.get(request)
        : await contextCapacityHistory.save(request, result ?? null)
    return { success: true, summary }
  } catch {
    return { success: false }
  }
}

/** Run a validated retrieval plan in the background, sharing the existing run registry. */
export async function resolveNeedleRun(
  request: ApiCheckRunNeedleRequest,
  sender?: browser.runtime.MessageSender,
): Promise<ApiCheckRunNeedleResponse> {
  const { runId, apiKey, modelId, apiType, mode, requestProfile } = request
  if (
    typeof runId !== "string" ||
    !runId.trim() ||
    typeof apiKey !== "string" ||
    !apiKey.trim() ||
    typeof modelId !== "string" ||
    !modelId.trim() ||
    !Object.values(API_TYPES).includes(apiType)
  )
    return { success: false, error: "Missing or invalid needle configuration" }
  if (
    mode !== undefined &&
    !Object.values(API_VERIFICATION_MODES).includes(mode)
  )
    return { success: false, error: "Invalid verification mode" }
  if (
    requestProfile !== undefined &&
    !isVerificationRequestProfile(requestProfile)
  )
    return { success: false, error: "Invalid request profile" }
  const baseUrl = toVersionedProtocolMount(apiType, request.baseUrl)
  if (!baseUrl) return { success: false, error: "Invalid base URL" }
  if (!hasValidRequestHeaders(request.requestHeaders))
    return { success: false, error: "Invalid request headers" }
  let controls: NeedleRunControls | undefined
  try {
    const result = await probeRuns.run(
      runId,
      async (signal) => {
        return runDurableNeedleTest(
          {
            ...request,
            baseUrl,
            modelId: modelId.trim(),
            abortSignal: signal!,
            onControls: (value) => {
              controls = value
              needleRunControls.set(runId, value)
            },
            onProgress: (result) => {
              if (signal?.aborted) return
              void sendWebAiApiCheckMessage(
                WebAiApiCheckMessageTypes.NeedleProgress,
                { runId, result },
                sender?.tab?.id === undefined
                  ? undefined
                  : { tabId: sender.tab.id, frameId: sender.frameId },
              ).catch(() => undefined)
            },
          },
          request.recoverOnly === true,
          request.historyTarget,
        )
      },
      sender?.tab?.id,
    )
    return { success: true, result }
  } catch (error) {
    return {
      success: false,
      error: toSanitizedErrorSummary(error, [
        apiKey,
        ...Object.values(request.requestHeaders ?? {}),
      ]),
      errorName: error instanceof Error ? error.name : undefined,
      checkpointLimitReached:
        error instanceof Error &&
        error.name === CONTEXT_CHECKPOINT_LIMIT_ERROR_NAME,
    }
  } finally {
    if (controls && needleRunControls.get(runId) === controls)
      needleRunControls.delete(runId)
  }
}

/** Keep generated long prompts in background; return only compact measurements. */
export async function resolveWebAiApiCheckRunContextCapacityMessage(
  request: ApiCheckRunContextCapacityRequest,
  sender?: browser.runtime.MessageSender,
): Promise<ApiCheckRunContextCapacityResponse> {
  const {
    runId,
    apiType,
    baseUrl,
    apiKey,
    modelId,
    mode,
    requestProfile,
    requestProfileEnhanced,
    maxInputTokens,
    resumeFrom,
  } = request
  if (
    !runId?.trim() ||
    !Object.values(API_TYPES).includes(apiType) ||
    !baseUrl?.trim() ||
    !apiKey?.trim() ||
    !modelId?.trim()
  )
    return {
      success: false,
      error: "Missing or invalid context probe configuration",
    }
  if (
    maxInputTokens !== undefined &&
    (!Number.isSafeInteger(maxInputTokens) ||
      maxInputTokens < CONTEXT_CAPACITY_DEFAULTS.minimumInputTokens ||
      maxInputTokens > CONTEXT_CAPACITY_DEFAULTS.maxTotalInputTokens)
  )
    return {
      success: false,
      error: "Invalid input limit",
    }
  if (
    mode !== undefined &&
    mode !== API_VERIFICATION_MODES.Streaming &&
    mode !== API_VERIFICATION_MODES.NonStreaming
  )
    return { success: false, error: "Invalid verification mode" }
  if (
    requestProfile !== undefined &&
    !isVerificationRequestProfile(requestProfile)
  )
    return { success: false, error: "Invalid request profile" }
  const normalizedBaseUrl = normalizeProbeBaseUrl({ apiType, baseUrl })
  if (!normalizedBaseUrl) return { success: false, error: "Invalid baseUrl" }
  try {
    const result = await probeRuns.run(
      runId,
      async (signal) => {
        const result = await runDurableContextCapacity(
          {
            baseUrl: normalizedBaseUrl,
            apiKey,
            apiType,
            modelId: modelId.trim(),
            mode,
            requestProfile,
            requestProfileEnhanced,
            maxInputTokens,
            resumeFrom,
            abortSignal: signal!,
            onProgress: (result) => {
              if (signal?.aborted || sender?.tab?.id === undefined) return
              void sendWebAiApiCheckMessage(
                WebAiApiCheckMessageTypes.ContextCapacityProgress,
                { runId, result },
                { tabId: sender.tab.id, frameId: sender.frameId },
              ).catch(() => undefined)
            },
          },
          request.recoverOnly === true,
        )
        signal?.throwIfAborted()
        return result
      },
      sender?.tab?.id,
    )
    return { success: true, result }
  } catch (error) {
    return {
      success: false,
      error: toSanitizedErrorSummary(error, [apiKey]),
      ...(error instanceof Error &&
      error.name === CONTEXT_CHECKPOINT_LIMIT_ERROR_NAME
        ? { checkpointLimitReached: true }
        : {}),
    }
  }
}
