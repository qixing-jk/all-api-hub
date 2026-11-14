import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { type UserPreferences } from "~/services/preferences/preferencesSchema"
import { userPreferences } from "~/services/preferences/userPreferences"
import { tagStorage } from "~/services/tags/tagStorage"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import { webAiApiCheckBaseUrlHistoryStorage } from "~/services/verification/webAiApiCheck/baseUrlHistory"
import { WEB_AI_API_CHECK_BASE_URL_HISTORY_SUGGESTION_LIMIT } from "~/services/verification/webAiApiCheck/constants"

import { logger, toGenericFailureResponse } from "./backgroundUtils"
import { isWebAiApiCheckPageAllowed } from "./siteAccess"
import type {
  ApiCheckCreateTagRequest,
  ApiCheckCreateTagResponse,
  ApiCheckGetBaseUrlHistorySuggestionsRequest,
  ApiCheckGetBaseUrlHistorySuggestionsResponse,
  ApiCheckListTagsRequest,
  ApiCheckListTagsResponse,
  ApiCheckRecordBaseUrlHistoryRequest,
  ApiCheckRecordBaseUrlHistoryResponse,
  ApiCheckRemoveBaseUrlHistoryRequest,
  ApiCheckRemoveBaseUrlHistoryResponse,
  ApiCheckRenameTagRequest,
  ApiCheckRenameTagResponse,
  ApiCheckShouldPromptRequest,
  ApiCheckShouldPromptResponse,
} from "./types"

/**
 * Read Web AI API Check preferences with safe defaults.
 */
function getWebAiApiCheckPreferences(
  prefs: UserPreferences,
): NonNullable<UserPreferences["webAiApiCheck"]> {
  return (
    prefs.webAiApiCheck ??
    DEFAULT_PREFERENCES.webAiApiCheck ?? {
      enabled: true,
      contextMenu: {
        enabled: true,
      },
      autoDetect: {
        enabled: true,
        enhanced: { enabled: true },
        urlWhitelist: { patterns: [] },
      },
      keyCleanup: {
        removalPatterns: [],
      },
    }
  )
}

/**
 * Resolve whether content auto-detection can prompt on the current page.
 */
export async function resolveWebAiApiCheckShouldPromptMessage(
  request: ApiCheckShouldPromptRequest,
): Promise<ApiCheckShouldPromptResponse> {
  try {
    const { pageUrl } = request
    if (!pageUrl?.trim()) {
      return {
        success: false,
        error: "Missing pageUrl",
      }
    }

    const prefs = await userPreferences.getPreferencesStrict()
    const config = getWebAiApiCheckPreferences(prefs)
    const autoDetectEnabled = config.enabled && !!config.autoDetect?.enabled
    const urlAllowed = isWebAiApiCheckPageAllowed(pageUrl, config.autoDetect)
    const shouldPrompt = autoDetectEnabled && urlAllowed
    const enhancedShouldPrompt =
      shouldPrompt && !!config.autoDetect?.enhanced?.enabled

    return {
      success: true,
      shouldPrompt,
      enhancedShouldPrompt,
      siteAllowed: urlAllowed,
      autoDetectEnabled,
      apiKeyCleanupPatterns: config.keyCleanup?.removalPatterns ?? [],
    }
  } catch (error) {
    logger.error("ApiCheck message handling failed", {
      message: toSanitizedErrorSummary(error, []),
    })
    return toGenericFailureResponse()
  }
}

/**
 * Resolve Base URL suggestions ranked for the current page origin.
 */
export async function resolveWebAiApiCheckGetBaseUrlHistorySuggestionsMessage(
  request: ApiCheckGetBaseUrlHistorySuggestionsRequest,
): Promise<ApiCheckGetBaseUrlHistorySuggestionsResponse> {
  try {
    const suggestions = await webAiApiCheckBaseUrlHistoryStorage.getSuggestions(
      {
        pageUrl: request.pageUrl,
        limit: request.limit,
      },
    )
    return { success: true, suggestions }
  } catch (error) {
    logger.error("Failed to read Base URL history suggestions", {
      message: toSanitizedErrorSummary(error, []),
    })
    return { success: false, error: "Failed to read Base URL history" }
  }
}

/**
 * Best-effort record of a user-confirmed Base URL usage.
 */
export async function resolveWebAiApiCheckRecordBaseUrlHistoryMessage(
  request: ApiCheckRecordBaseUrlHistoryRequest,
): Promise<ApiCheckRecordBaseUrlHistoryResponse> {
  try {
    if (request.baseUrl?.trim()) {
      await webAiApiCheckBaseUrlHistoryStorage.recordUse({
        baseUrl: request.baseUrl,
        pageUrl: request.pageUrl,
      })
    }
    const suggestions = await webAiApiCheckBaseUrlHistoryStorage.getSuggestions(
      {
        pageUrl: request.pageUrl,
        limit: WEB_AI_API_CHECK_BASE_URL_HISTORY_SUGGESTION_LIMIT,
      },
    )
    return { success: true, suggestions }
  } catch (error) {
    logger.error("Failed to record Base URL history", {
      message: toSanitizedErrorSummary(error, []),
    })
    return { success: true }
  }
}

/**
 * Best-effort removal of a user-discarded Base URL history entry.
 */
export async function resolveWebAiApiCheckRemoveBaseUrlHistoryMessage(
  request: ApiCheckRemoveBaseUrlHistoryRequest,
): Promise<ApiCheckRemoveBaseUrlHistoryResponse> {
  try {
    if (request.baseUrl?.trim()) {
      await webAiApiCheckBaseUrlHistoryStorage.removeBaseUrl({
        baseUrl: request.baseUrl,
      })
    }
    const suggestions = await webAiApiCheckBaseUrlHistoryStorage.getSuggestions(
      {
        pageUrl: request.pageUrl,
        limit: WEB_AI_API_CHECK_BASE_URL_HISTORY_SUGGESTION_LIMIT,
      },
    )
    return { success: true, suggestions }
  } catch (error) {
    logger.error("Failed to remove Base URL history", {
      message: toSanitizedErrorSummary(error, []),
    })
    return { success: true }
  }
}

/**
 * List global tags for the API-check save metadata picker.
 */
export async function resolveWebAiApiCheckListTagsMessage(
  _request: ApiCheckListTagsRequest,
): Promise<ApiCheckListTagsResponse> {
  try {
    const tags = await tagStorage.listTags()
    return { success: true, tags }
  } catch (error) {
    logger.error("Failed to list tags for ApiCheck metadata", {
      message: toSanitizedErrorSummary(error, []),
    })
    return { success: false, error: "Failed to list tags" }
  }
}

/**
 * Create a global tag from the API-check save metadata picker.
 */
export async function resolveWebAiApiCheckCreateTagMessage(
  request: ApiCheckCreateTagRequest,
): Promise<ApiCheckCreateTagResponse> {
  try {
    const tag = await tagStorage.createTag(request.name)
    return { success: true, tag }
  } catch (error) {
    logger.error("Failed to create tag from ApiCheck metadata", {
      message: toSanitizedErrorSummary(error, []),
    })
    return { success: false, error: toSanitizedErrorSummary(error, []) }
  }
}

/**
 * Rename a global tag from the API-check save metadata picker.
 */
export async function resolveWebAiApiCheckRenameTagMessage(
  request: ApiCheckRenameTagRequest,
): Promise<ApiCheckRenameTagResponse> {
  try {
    const tag = await tagStorage.renameTag(request.tagId, request.name)
    return { success: true, tag }
  } catch (error) {
    logger.error("Failed to rename tag from ApiCheck metadata", {
      message: toSanitizedErrorSummary(error, []),
    })
    return { success: false, error: toSanitizedErrorSummary(error, []) }
  }
}
