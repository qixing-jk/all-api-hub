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
