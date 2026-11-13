import { PRODUCT_ANALYTICS_ERROR_CATEGORIES } from "~/services/productAnalytics/contracts"
import {
  API_TYPES,
  API_VERIFICATION_MODES,
  API_VERIFICATION_PROBE_IDS,
  API_VERIFICATION_PROBE_STATUSES,
  runApiVerificationProbe,
  type ApiVerificationProbeId,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import {
  getVerificationRequestProfileOptions,
  isVerificationRequestProfile,
} from "~/services/verification/aiApiVerification/requestProfiles"
import {
  buildSafeProbeFailureDiagnostics,
  toSanitizedErrorSummary,
} from "~/services/verification/aiApiVerification/utils"
import { PELICAN_EXECUTION_MODES } from "~/services/verification/modelQuality/constants"
import { runPelicanTest } from "~/services/verification/modelQuality/pelican"
import { runQuestionAnswerTest } from "~/services/verification/modelQuality/questionAnswer"
import { normalizeProbeBaseUrl } from "~/services/verification/webAiApiCheck/credentialExtraction/baseUrlCandidates"

import { probeRuns } from "./backgroundRunState"
import {
  hasValidRequestHeaders,
  logger,
  toGenericFailureResponse,
} from "./backgroundUtils"
import { forwardGenerationProgress } from "./generationProgress"
import type {
  ApiCheckCancelRunProbeRequest,
  ApiCheckCancelRunProbeResponse,
  ApiCheckQuestionAnswerRequest,
  ApiCheckQuestionAnswerResponse,
  ApiCheckRunPelicanRequest,
  ApiCheckRunPelicanResponse,
  ApiCheckRunProbeRequest,
  ApiCheckRunProbeResponse,
} from "./types"

/** Run on-demand questions for webpage callers using the existing cancellation registry. */
export async function resolveWebAiApiCheckQuestionAnswerMessage(
  request: ApiCheckQuestionAnswerRequest,
  ownerTabId?: number,
): Promise<ApiCheckQuestionAnswerResponse> {
  if (
    !Object.values(API_TYPES).includes(request.apiType) ||
    typeof request.runId !== "string" ||
    !request.runId.trim() ||
    typeof request.apiKey !== "string" ||
    !request.apiKey.trim() ||
    typeof request.modelId !== "string" ||
    !request.modelId.trim() ||
    typeof request.baseUrl !== "string" ||
    typeof request.question !== "string" ||
    !request.question.trim() ||
    typeof request.referenceAnswer !== "string" ||
    (request.mode !== undefined &&
      !Object.values(API_VERIFICATION_MODES).includes(request.mode)) ||
    (request.requestProfile !== undefined &&
      !isVerificationRequestProfile(request.requestProfile))
  ) {
    return { success: false, error: "Invalid question test request" }
  }
  const baseUrl = normalizeProbeBaseUrl(request)
  if (!baseUrl) return { success: false, error: "Invalid baseUrl" }
  if (!hasValidRequestHeaders(request.requestHeaders))
    return { success: false, error: "Invalid request headers" }
  try {
    const result = await probeRuns.run(
      request.runId,
      (abortSignal) =>
        runQuestionAnswerTest({
          ...request,
          baseUrl,
          abortSignal,
          onProgress: forwardGenerationProgress(
            request.runId,
            ownerTabId,
            abortSignal,
          ),
        }),
      ownerTabId,
    )
    return { success: true, result }
  } catch (error) {
    return {
      success: false,
      error: toSanitizedErrorSummary(error, [
        request.apiKey,
        ...Object.values(request.requestHeaders ?? {}),
      ]),
    }
  }
}

/**
 * Run a single API verification probe for API-check credentials.
 */
export async function resolveWebAiApiCheckRunProbeMessage(
  request: ApiCheckRunProbeRequest,
  ownerTabId?: number,
): Promise<ApiCheckRunProbeResponse> {
  try {
    const {
      runId,
      apiType,
      baseUrl,
      apiKey,
      modelId,
      probeId,
      mode = API_VERIFICATION_MODES.Streaming,
      requestProfile,
      requestProfileEnhanced,
    } = request

    if (!apiType || !baseUrl?.trim() || !apiKey?.trim() || !probeId) {
      return {
        success: false,
        error: "Missing apiType, baseUrl, apiKey, or probeId",
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      }
    }

    if (
      mode !== API_VERIFICATION_MODES.Streaming &&
      mode !== API_VERIFICATION_MODES.NonStreaming
    ) {
      return {
        success: false,
        error: "Invalid verification mode",
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      }
    }

    if (
      requestProfile !== undefined &&
      !isVerificationRequestProfile(requestProfile)
    ) {
      return {
        success: false,
        error: "Invalid request profile",
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      }
    }

    const normalizedBaseUrl = normalizeProbeBaseUrl({ apiType, baseUrl })
    if (!normalizedBaseUrl) {
      return {
        success: false,
        error: "Invalid baseUrl",
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      }
    }

    try {
      const result = await probeRuns.run(
        runId,
        (signal) =>
          runApiVerificationProbe({
            ...(requestProfile ? { requestProfile } : {}),
            ...(requestProfileEnhanced === true
              ? { requestProfileEnhanced: true }
              : {}),
            baseUrl: normalizedBaseUrl,
            apiKey,
            apiType,
            modelId: modelId?.trim() || undefined,
            probeId: probeId as ApiVerificationProbeId,
            probePromptOverrides: request.probePromptOverrides,
            onProgress: forwardGenerationProgress(runId, ownerTabId, signal),
            mode,
            abortSignal: signal,
          }),
        ownerTabId,
      )

      return { success: true, result }
    } catch (error) {
      const message = toSanitizedErrorSummary(error, [apiKey])
      const diagnostics = buildSafeProbeFailureDiagnostics(error, message)

      logger.error("Probe execution failed", {
        apiType,
        probeId,
        baseUrl: normalizedBaseUrl,
        message,
        status: diagnostics.summaryParams?.status,
      })

      const result: ApiVerificationProbeResult = {
        id: probeId as ApiVerificationProbeId,
        ...(isVerificationRequestProfile(requestProfile)
          ? getVerificationRequestProfileOptions(
              requestProfile,
              requestProfileEnhanced === true,
            )
          : {}),
        mode: probeId === API_VERIFICATION_PROBE_IDS.Models ? undefined : mode,
        status: API_VERIFICATION_PROBE_STATUSES.Fail,
        latencyMs: 0,
        summary: message,
        ...diagnostics,
        input: {
          apiType,
          baseUrl: normalizedBaseUrl,
        },
      }

      return { success: true, result }
    }
  } catch (error) {
    logger.error("ApiCheck message handling failed", {
      message: toSanitizedErrorSummary(error, []),
    })
    return toGenericFailureResponse()
  }
}

/**
 * Run the pelican drawing test for the content-script dialog.
 *
 * The content script cannot reach the provider directly, so the request runs in
 * the background and only the SVG analysis crosses the message boundary.
 */
export async function resolveWebAiApiCheckRunPelicanMessage(
  request: ApiCheckRunPelicanRequest,
  ownerTabId?: number,
): Promise<ApiCheckRunPelicanResponse> {
  const {
    apiType,
    baseUrl,
    apiKey,
    modelId,
    mode,
    prompt,
    runId,
    executionMode,
    requestProfile,
    requestProfileEnhanced,
  } = request

  if (!apiType || !baseUrl?.trim() || !apiKey?.trim() || !modelId?.trim()) {
    return {
      success: false,
      error: "Missing apiType, baseUrl, apiKey, or modelId",
    }
  }

  if (
    mode !== undefined &&
    mode !== API_VERIFICATION_MODES.Streaming &&
    mode !== API_VERIFICATION_MODES.NonStreaming
  ) {
    return { success: false, error: "Invalid verification mode" }
  }
  if (
    executionMode !== undefined &&
    executionMode !== PELICAN_EXECUTION_MODES.Reply &&
    executionMode !== PELICAN_EXECUTION_MODES.Agent
  ) {
    return { success: false, error: "Invalid drawing execution mode" }
  }
  if (
    requestProfile !== undefined &&
    !isVerificationRequestProfile(requestProfile)
  ) {
    return { success: false, error: "Invalid request profile" }
  }
  const normalizedBaseUrl = normalizeProbeBaseUrl({ apiType, baseUrl })
  if (!normalizedBaseUrl) {
    return { success: false, error: "Invalid baseUrl" }
  }

  try {
    const result = await probeRuns.run(
      runId,
      (signal) =>
        runPelicanTest({
          baseUrl: normalizedBaseUrl,
          apiKey,
          apiType,
          modelId: modelId.trim(),
          ...(mode ? { mode } : {}),
          ...(prompt?.trim() ? { prompt: prompt.trim() } : {}),
          executionMode,
          onProgress: forwardGenerationProgress(runId, ownerTabId, signal),
          requestProfile,
          requestProfileEnhanced,
          abortSignal: signal,
        }),
      ownerTabId,
    )
    return { success: true, result }
  } catch (error) {
    const message = toSanitizedErrorSummary(error, [apiKey])
    logger.error("Pelican test failed", {
      apiType,
      baseUrl: normalizedBaseUrl,
      message,
    })
    return { success: false, error: message }
  }
}

/**
 * Abort a single in-flight API verification probe.
 */
export async function resolveWebAiApiCheckCancelRunProbeMessage(
  request: ApiCheckCancelRunProbeRequest,
): Promise<ApiCheckCancelRunProbeResponse> {
  try {
    const runId = typeof request.runId === "string" ? request.runId.trim() : ""
    if (!runId) {
      return { success: true, cancelled: false }
    }

    return { success: true, cancelled: probeRuns.cancel(runId) }
  } catch (error) {
    logger.error("ApiCheck cancel message handling failed", {
      message: toSanitizedErrorSummary(error, []),
    })
    return { success: true, cancelled: false }
  }
}
