import { RuntimeActionIds } from "~/constants/runtimeActions"
import type {
  ApiVerificationApiType,
  ApiVerificationProbeId,
  ApiVerificationProbeResult,
} from "~/services/aiApiVerification"

/**
 * Runtime message sent from background → content to open the in-page AI API Check modal.
 */
export type ApiCheckContextMenuTriggerRequest = {
  action: typeof RuntimeActionIds.ApiCheckContextMenuTrigger
  selectionText: string
  pageUrl: string
}

/**
 * Runtime request from content → background to decide whether auto-detect can prompt.
 */
export type ApiCheckShouldPromptRequest = {
  action: typeof RuntimeActionIds.ApiCheckShouldPrompt
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
    }
  | {
      success: false
      error?: string
    }

/**
 * Runtime request from content → background to fetch upstream model ids.
 *
 * NOTE: apiKey is transient and must never be persisted or returned in any response payload.
 */
export type ApiCheckFetchModelsRequest = {
  action: typeof RuntimeActionIds.ApiCheckFetchModels
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
    }

/**
 * Runtime request from content → background to run one API verification probe.
 *
 * The returned result must never include secrets (apiKey), and error summaries must be sanitized.
 */
export type ApiCheckRunProbeRequest = {
  action: typeof RuntimeActionIds.ApiCheckRunProbe
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
    }

/**
 * Runtime request from content → background to persist the current credentials
 * as an API credential profile.
 *
 * NOTE: apiKey is sensitive and must never be echoed back in any response payload.
 */
export type ApiCheckSaveProfileRequest = {
  action: typeof RuntimeActionIds.ApiCheckSaveProfile
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
    }

/**
 * Union of ApiCheck runtime requests handled by the background router.
 */
export type ApiCheckRuntimeRequest =
  | ApiCheckShouldPromptRequest
  | ApiCheckFetchModelsRequest
  | ApiCheckRunProbeRequest
  | ApiCheckSaveProfileRequest
