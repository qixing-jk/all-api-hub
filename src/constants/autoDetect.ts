import type { AccountSiteType } from "~/constants/siteType"

export const AUTO_DETECT_ERROR_CODES = {
  CURRENT_TAB_CONTENT_SCRIPT_UNAVAILABLE:
    "current_tab_content_script_unavailable",
  SITE_TYPE_DETECTION_FAILED: "site_type_detection_failed",
} as const

export type AutoDetectErrorCode =
  (typeof AUTO_DETECT_ERROR_CODES)[keyof typeof AUTO_DETECT_ERROR_CODES]

export const AUTO_DETECT_FAILURE_REASONS = {
  CurrentTabContentScriptUnavailable: "current_tab_content_script_unavailable",
  UserDataMissing: "user_data_missing",
  UserIdMissing: "user_id_missing",
  UsernameMissing: "username_missing",
  AccessTokenMissing: "access_token_missing",
  AccessTokenVerificationRequired: "access_token_verification_required",
  AccountIdentityMismatch: "account_identity_mismatch",
  TokenFetchFailed: "token_fetch_failed",
  SiteStatusFetchFailed: "site_status_fetch_failed",
  CheckInSupportFetchFailed: "check_in_support_fetch_failed",
  SiteTypeDetectionFailed: "site_type_detection_failed",
  UnexpectedException: "unexpected_exception",
} as const

export type AutoDetectFailureReason =
  (typeof AUTO_DETECT_FAILURE_REASONS)[keyof typeof AUTO_DETECT_FAILURE_REASONS]

export const AUTO_DETECT_STRATEGIES = {
  CurrentTab: "current_tab",
  ExistingTab: "existing_tab",
  BackgroundTempContext: "background_temp_context",
  DirectApi: "direct_api",
  FallbackApi: "fallback_api",
} as const

export type AutoDetectStrategy =
  (typeof AUTO_DETECT_STRATEGIES)[keyof typeof AUTO_DETECT_STRATEGIES]

export const AUTO_DETECT_FETCH_CONTEXT_KINDS = {
  CurrentTab: "current_tab",
  BrowserContext: "browser_context",
  None: "none",
} as const

export type AutoDetectFetchContextKind =
  (typeof AUTO_DETECT_FETCH_CONTEXT_KINDS)[keyof typeof AUTO_DETECT_FETCH_CONTEXT_KINDS]

export interface AutoDetectAnalyticsContext {
  strategy?: AutoDetectStrategy
  siteType?: AccountSiteType
  fetchContextKind?: AutoDetectFetchContextKind
  incognitoContextUsed?: boolean
  currentTabMatched?: boolean
}

/** Browser-source exhaustion still permits the final API fallback. */
export const AUTO_DETECT_BROWSER_OUTCOMES = {
  Detected: "detected",
  Exhausted: "exhausted",
} as const

/** Local diagnostic protocol names, shared across detection source handoffs. */
export const AUTO_DETECT_DIAGNOSTIC_EVENTS = {
  ApiSessionFailed: "api_session_failed",
  ApiSessionFinished: "api_session_finished",
  ApiSessionStarted: "api_session_started",
  CurrentTabSelected: "current_tab_selected",
  DetectionStarted: "detection_started",
  PlatformCapabilities: "platform_capabilities",
  SessionInvalid: "session_invalid",
  SiteDetectionFinished: "site_detection_finished",
  SourceFailed: "source_failed",
  SourceFallback: "source_fallback",
  SourceSkipped: "source_skipped",
  StrategyFinished: "strategy_finished",
  StrategyStarted: "strategy_started",
  DetectionFinished: "detection_finished",
} as const

export const AUTO_DETECT_SOURCE_REASONS = {
  BackgroundMessagingUnavailable: "background_messaging_unavailable",
  CapabilityUnavailable: "capability_unavailable",
  ContentScriptUnavailable: "content_script_unavailable",
  CookiesMissing: "cookies_missing",
  Exception: "exception",
  NoSession: "no_session",
  NoSessionData: "no_session_data",
  TabMissing: "tab_missing",
  TabsUnavailable: "tabs_unavailable",
} as const

export const AUTO_DETECT_SESSION_SOURCES = {
  Api: "api",
} as const
