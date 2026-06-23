import type { ProductAnalyticsErrorCategory } from "~/services/productAnalytics/events"
import type {
  ApiVerificationApiType,
  ApiVerificationProbeId,
  ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"

/**
 * Runtime data from content → background to decide whether auto-detect can prompt.
 */
export type ApiCheckShouldPromptRequest = {
  pageUrl: string
}

/**
 * Runtime response for {@link ApiCheckShouldPromptRequest}.
 *
 * NOTE: Errors must be sanitized by the background handler (no raw apiKey echoes).
 */
export type ApiCheckShouldPromptResponse =
  | {
      success: true
      shouldPrompt: boolean
      enhancedShouldPrompt?: boolean
    }
  | {
      success: false
      error?: string
    }

/**
 * Runtime data from content → background to fetch upstream model ids.
 *
 * NOTE: apiKey is transient and must never be persisted or returned in any response payload.
 */
export type ApiCheckFetchModelsRequest = {
  apiType: ApiVerificationApiType
  baseUrl: string
  apiKey: string
}

/**
 * Runtime response for {@link ApiCheckFetchModelsRequest}.
 *
 * Errors should be human-readable and secret-sanitized.
 */
export type ApiCheckFetchModelsResponse =
  | {
      success: true
      modelIds: string[]
    }
  | {
      success: false
      error?: string
      errorCategory?: ProductAnalyticsErrorCategory
      errorStatusCode?: number
    }

/**
 * Runtime data from content → background to run one API verification probe.
 *
 * The returned result must never include secrets (apiKey), and error summaries must be sanitized.
 */
export type ApiCheckRunProbeRequest = {
  runId?: string
  apiType: ApiVerificationApiType
  baseUrl: string
  apiKey: string
  modelId?: string
  probeId: ApiVerificationProbeId
}

/**
 * Runtime response for {@link ApiCheckRunProbeRequest}.
 */
export type ApiCheckRunProbeResponse =
  | {
      success: true
      result: ApiVerificationProbeResult
    }
  | {
      success: false
      error?: string
      errorCategory?: ProductAnalyticsErrorCategory
    }

/**
 * Runtime data from content -> background to abort one in-flight probe.
 */
export type ApiCheckCancelRunProbeRequest = {
  runId: string
}

/**
 * Runtime response for {@link ApiCheckCancelRunProbeRequest}.
 */
export type ApiCheckCancelRunProbeResponse = {
  success: true
  cancelled: boolean
}

/**
 * Runtime data from content → background to persist the current credentials
 * as an API credential profile.
 *
 * NOTE: apiKey is sensitive and must never be echoed back in any response payload.
 */
export type ApiCheckSaveProfileRequest = {
  apiType: ApiVerificationApiType
  baseUrl: string
  apiKey: string
  pageUrl?: string
  name?: string
}

/**
 * Runtime response for {@link ApiCheckSaveProfileRequest}.
 *
 * The returned payload MUST NOT include secrets (apiKey).
 */
export type ApiCheckSaveProfileResponse =
  | {
      success: true
      profileId: string
      name: string
      apiType: ApiVerificationApiType
      baseUrl: string
    }
  | {
      success: false
      error?: string
      errorCategory?: ProductAnalyticsErrorCategory
    }
