import { generateImage } from "ai"

import { extractCoreModelIdentity } from "~/services/models/modelMetadata/modelIdentityIndex"

import { getOpenAiProtocolUnsupportedResult } from "../probeProtocol"
import { nowMs, okLatency } from "../probeTiming"
import { COMPATIBLE_PROVIDER_OPTIONS_KEY, createImageModel } from "../providers"
import {
  API_VERIFICATION_MEDIA_TYPES,
  API_VERIFICATION_PROBE_IDS,
  API_VERIFICATION_PROBE_STATUSES,
  type ApiVerificationProbeResult,
} from "../types"
import {
  buildSafeProbeFailureDiagnostics,
  isAbortError,
  toSanitizedErrorSummary,
} from "../utils"
import { resolveProbePrompt } from "./probePrompts"
import type { ModelProbeParams } from "./probeTransport"

/**
 * Image generation probe designed to minimize quota/token consumption:
 * uses one image and a minimal prompt, with model-specific size/quality when known.
 */
export async function runImageGenerationProbe(
  params: ModelProbeParams,
): Promise<ApiVerificationProbeResult> {
  const startedAt = nowMs()
  const unsupported = getOpenAiProtocolUnsupportedResult(
    params,
    API_VERIFICATION_PROBE_IDS.ImageGeneration,
    startedAt,
  )
  if (unsupported) return unsupported
  const secretsToRedact = [
    params.apiKey,
    ...Object.values(params.requestHeaders ?? {}),
  ]

  try {
    const coreModelId = extractCoreModelIdentity(params.modelId.trim())
    const isDalle3 = /^dall[-_.]e[-_.]3(?:[-_.]|$)/i.test(coreModelId)
    const isDalle2 = /^dall[-_.]e[-_.]2(?:[-_.]|$)/i.test(coreModelId)
    const isGptImage = /^gpt[-_.]image(?:[-_.]|$)/i.test(coreModelId)

    // Unknown model families retain their provider's sizing defaults.
    const size =
      isDalle3 || isGptImage ? "1024x1024" : isDalle2 ? "256x256" : undefined
    const quality = isGptImage ? "low" : isDalle3 ? "standard" : undefined
    const options = quality ? { quality } : {}
    const { image } = await generateImage({
      model: createImageModel(params),
      prompt: resolveProbePrompt(
        API_VERIFICATION_PROBE_IDS.ImageGeneration,
        params.probePromptOverrides,
      )!,
      n: 1,
      size,
      providerOptions: {
        [COMPATIBLE_PROVIDER_OPTIONS_KEY]: options,
      },
      maxRetries: 0,
      abortSignal: params.abortSignal,
    })
    const hasImage = image.uint8Array.length > 0

    return {
      id: API_VERIFICATION_PROBE_IDS.ImageGeneration,
      status: hasImage
        ? API_VERIFICATION_PROBE_STATUSES.Pass
        : API_VERIFICATION_PROBE_STATUSES.Fail,
      latencyMs: okLatency(startedAt),
      summary: hasImage
        ? "Image generation succeeded"
        : "No image data returned",
      summaryKey: hasImage
        ? "verifyDialog.summaries.imageGenerationSucceeded"
        : "verifyDialog.summaries.imageGenerationNoData",
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
        modelId: params.modelId,
        size,
      },
      output: {
        url: null,
        hasB64: hasImage,
      },
      media: hasImage
        ? {
            type: API_VERIFICATION_MEDIA_TYPES.Image,
            url: `data:${image.mediaType};base64,${image.base64}`,
          }
        : undefined,
      details: hasImage
        ? { b64Sample: `${image.base64.slice(0, 40)}...` }
        : undefined,
    }
  } catch (error) {
    if (isAbortError(error, params.abortSignal)) {
      throw error
    }

    const summary = toSanitizedErrorSummary(error, secretsToRedact)
    const diagnostics = buildSafeProbeFailureDiagnostics(error, summary)

    return {
      id: API_VERIFICATION_PROBE_IDS.ImageGeneration,
      status: API_VERIFICATION_PROBE_STATUSES.Fail,
      latencyMs: okLatency(startedAt),
      summary,
      summaryKey: diagnostics.summaryKey,
      summaryParams: diagnostics.summaryParams,
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
        modelId: params.modelId,
      },
      output: diagnostics.output,
    }
  }
}
