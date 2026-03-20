export const DEFAULT_LANG = "zh-CN"
export const JAPANESE_LANG = "ja"
export const TRADITIONAL_CHINESE_LANG = "zh-TW"

export const SUPPORTED_UI_LANGUAGES = [
  "en",
  JAPANESE_LANG,
  DEFAULT_LANG,
  TRADITIONAL_CHINESE_LANG,
] as const

export type SupportedUiLanguage = (typeof SUPPORTED_UI_LANGUAGES)[number]
