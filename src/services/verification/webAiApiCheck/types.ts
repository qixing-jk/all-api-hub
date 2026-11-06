import type { ProductAnalyticsErrorCategory } from "~/services/productAnalytics/contracts"
import type {
  ApiVerificationApiType,
  ApiVerificationMode,
  ApiVerificationProbeId,
  ApiVerificationProbeResult,
  ApiVerificationRequestProfile,
} from "~/services/verification/aiApiVerification"
import type { ContextCapacityResult } from "~/services/verification/modelQuality/contextCapacity"
import type {
  ContextCapacityRunResult,
  RunContextCapacityParams,
} from "~/services/verification/modelQuality/contextCapacityRun"
import type {
  PelicanExecutionMode,
  PelicanTestResult,
} from "~/services/verification/modelQuality/pelican"
import type { ContextHistoryRequest } from "~/services/verification/verificationResultHistory/contextCapacityHistory"
import type { ContextCapacitySummary } from "~/services/verification/verificationResultHistory/types"
import type { WebAiApiCheckBaseUrlSuggestion } from "~/services/verification/webAiApiCheck/baseUrlHistory"
import { type CONTEXT_HISTORY_ACTIONS } from "~/services/verification/webAiApiCheck/constants"
import type { Tag } from "~/types"

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
      siteAllowed?: boolean
      autoDetectEnabled?: boolean
      apiKeyCleanupPatterns?: string[]
    }
  | {
      success: false
      error?: string
    }

export type ApiCheckGetBaseUrlHistorySuggestionsRequest = {
  pageUrl?: string
  limit?: number
}

export type ApiCheckGetBaseUrlHistorySuggestionsResponse =
  | {
      success: true
      suggestions: WebAiApiCheckBaseUrlSuggestion[]
    }
  | {
      success: false
      error?: string
    }

export type ApiCheckRecordBaseUrlHistoryRequest = {
  baseUrl: string
  pageUrl?: string
}

export type ApiCheckRecordBaseUrlHistoryResponse = {
  success: true
  suggestions?: WebAiApiCheckBaseUrlSuggestion[]
}

export type ApiCheckRemoveBaseUrlHistoryRequest = {
  baseUrl: string
  pageUrl?: string
}

export type ApiCheckRemoveBaseUrlHistoryResponse = {
  success: true
  suggestions?: WebAiApiCheckBaseUrlSuggestion[]
}

export type ApiCheckListTagsRequest = Record<string, never>

export type ApiCheckListTagsResponse =
  | {
      success: true
      tags: Tag[]
    }
  | {
      success: false
      error?: string
    }

export type ApiCheckCreateTagRequest = {
  name: string
}

export type ApiCheckCreateTagResponse =
  | {
      success: true
      tag: Tag
    }
  | {
      success: false
      error?: string
    }

export type ApiCheckRenameTagRequest = {
  tagId: string
  name: string
}

export type ApiCheckRenameTagResponse =
  | {
      success: true
      tag: Tag
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
  requestProfileEnhanced?: boolean
  requestProfile?: ApiVerificationRequestProfile
  runId?: string
  apiType: ApiVerificationApiType
  mode?: ApiVerificationMode
  baseUrl: string
  apiKey: string
  modelId?: string
  probeId: ApiVerificationProbeId
}

/**
 * Runtime data from content -> background to run the pelican drawing test.
 *
 * Kept as its own message because the drawing test returns SVG markup rather
 * than a probe result, and the content script cannot call the provider directly.
 */
export type ApiCheckRunPelicanRequest = {
  runId?: string
  apiType: ApiVerificationApiType
  mode?: ApiVerificationMode
  baseUrl: string
  apiKey: string
  modelId?: string
  prompt?: string
  executionMode?: PelicanExecutionMode
  requestProfile?: ApiVerificationRequestProfile
  requestProfileEnhanced?: boolean
}

/**
 * Runtime response for {@link ApiCheckRunPelicanRequest}.
 */
export type ApiCheckRunPelicanResponse =
  | {
      success: true
      result: PelicanTestResult
    }
  | { success: false; error?: string }

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
  /** Optional page the user found these credentials on, used for later revisits. */
  sourceUrl?: string
  tagIds?: string[]
  notes?: string
  expiresAt?: number | null
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

export type ApiCheckRunContextCapacityRequest = Omit<
  RunContextCapacityParams,
  "abortSignal" | "onProgress" | "onCheckpoint" | "requestHeaders"
> & { runId: string; recoverOnly?: boolean }
export type ApiCheckRunContextCapacityResponse =
  | { success: true; result: ContextCapacityRunResult }
  | { success: false; error?: string; checkpointLimitReached?: boolean }
export type ApiCheckContextCapacityProgress = {
  runId: string
  result: ContextCapacityResult
}

export type ApiCheckContextHistoryRequest = {
  request: ContextHistoryRequest
  action: (typeof CONTEXT_HISTORY_ACTIONS)[keyof typeof CONTEXT_HISTORY_ACTIONS]
  result?: ContextCapacityRunResult | null
}
export type ApiCheckContextHistoryResponse =
  | {
      success: true
      summary: ContextCapacitySummary | null
    }
  | { success: false }
