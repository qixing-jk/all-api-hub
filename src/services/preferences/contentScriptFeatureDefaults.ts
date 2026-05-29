import type {
  RedemptionAssistPreferences,
  WebAiApiCheckPreferences,
} from "./userPreferences"

export type ContentFeaturePreferenceSource = {
  redemptionAssist?: {
    enabled?: boolean
    contextMenu?: {
      enabled?: boolean
    }
  }
  webAiApiCheck?: {
    enabled?: boolean
    contextMenu?: {
      enabled?: boolean
    }
    autoDetect?: {
      enabled?: boolean
      enhanced?: {
        enabled?: boolean
      }
    }
  }
}

export type ContentFeaturePreferences = {
  redemptionAssistDetectionEnabled: boolean
  redemptionAssistContextMenuEnabled: boolean
  webAiApiCheckDetectionEnabled: boolean
  webAiApiCheckEnhancedDetectionEnabled: boolean
  webAiApiCheckContextMenuEnabled: boolean
}

export const DEFAULT_REDEMPTION_ASSIST_PREFERENCES: RedemptionAssistPreferences =
  {
    enabled: true,
    contextMenu: {
      enabled: true,
    },
    relaxedCodeValidation: true,
    urlWhitelist: {
      enabled: true,
      patterns: ["cdk.linux.do"],
      includeAccountSiteUrls: true,
      includeCheckInAndRedeemUrls: true,
    },
  }

export const DEFAULT_WEB_AI_API_CHECK_PREFERENCES: WebAiApiCheckPreferences = {
  enabled: true,
  contextMenu: {
    enabled: true,
  },
  autoDetect: {
    enabled: true,
    enhanced: {
      enabled: true,
    },
    urlWhitelist: {
      patterns: [],
    },
  },
}

export const DEFAULT_CONTENT_FEATURE_PREFERENCES: ContentFeaturePreferences = {
  redemptionAssistDetectionEnabled:
    DEFAULT_REDEMPTION_ASSIST_PREFERENCES.enabled,
  redemptionAssistContextMenuEnabled:
    DEFAULT_REDEMPTION_ASSIST_PREFERENCES.enabled &&
    DEFAULT_REDEMPTION_ASSIST_PREFERENCES.contextMenu.enabled,
  webAiApiCheckDetectionEnabled:
    DEFAULT_WEB_AI_API_CHECK_PREFERENCES.enabled &&
    DEFAULT_WEB_AI_API_CHECK_PREFERENCES.autoDetect.enabled,
  webAiApiCheckEnhancedDetectionEnabled:
    DEFAULT_WEB_AI_API_CHECK_PREFERENCES.enabled &&
    DEFAULT_WEB_AI_API_CHECK_PREFERENCES.autoDetect.enabled &&
    DEFAULT_WEB_AI_API_CHECK_PREFERENCES.autoDetect.enhanced.enabled,
  webAiApiCheckContextMenuEnabled:
    DEFAULT_WEB_AI_API_CHECK_PREFERENCES.enabled &&
    DEFAULT_WEB_AI_API_CHECK_PREFERENCES.contextMenu.enabled,
}

/**
 * Normalize the subset of preferences that controls content-script listener registration.
 */
export function resolveContentFeaturePreferences(
  source: ContentFeaturePreferenceSource = {},
): ContentFeaturePreferences {
  const redemptionEnabled =
    source.redemptionAssist?.enabled ??
    DEFAULT_REDEMPTION_ASSIST_PREFERENCES.enabled
  const webAiApiCheckEnabled =
    source.webAiApiCheck?.enabled ??
    DEFAULT_WEB_AI_API_CHECK_PREFERENCES.enabled
  const webAiApiCheckAutoDetectEnabled =
    source.webAiApiCheck?.autoDetect?.enabled ??
    DEFAULT_WEB_AI_API_CHECK_PREFERENCES.autoDetect.enabled
  const webAiApiCheckEnhancedAutoDetectEnabled =
    source.webAiApiCheck?.autoDetect?.enhanced?.enabled ??
    DEFAULT_WEB_AI_API_CHECK_PREFERENCES.autoDetect.enhanced.enabled

  return {
    redemptionAssistDetectionEnabled: redemptionEnabled,
    redemptionAssistContextMenuEnabled:
      redemptionEnabled &&
      (source.redemptionAssist?.contextMenu?.enabled ??
        DEFAULT_REDEMPTION_ASSIST_PREFERENCES.contextMenu.enabled),
    webAiApiCheckDetectionEnabled:
      webAiApiCheckEnabled && webAiApiCheckAutoDetectEnabled,
    webAiApiCheckEnhancedDetectionEnabled:
      webAiApiCheckEnabled &&
      webAiApiCheckAutoDetectEnabled &&
      webAiApiCheckEnhancedAutoDetectEnabled,
    webAiApiCheckContextMenuEnabled:
      webAiApiCheckEnabled &&
      (source.webAiApiCheck?.contextMenu?.enabled ??
        DEFAULT_WEB_AI_API_CHECK_PREFERENCES.contextMenu.enabled),
  }
}
