export const AUTO_DETECT_ERROR_CODES = {
  CURRENT_TAB_CONTENT_SCRIPT_UNAVAILABLE:
    "current_tab_content_script_unavailable",
} as const

export type AutoDetectErrorCode =
  (typeof AUTO_DETECT_ERROR_CODES)[keyof typeof AUTO_DETECT_ERROR_CODES]
