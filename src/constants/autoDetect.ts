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
