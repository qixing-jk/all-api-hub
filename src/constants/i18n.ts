export const DEFAULT_LANG = "zh-CN"
export const SPANISH_LATIN_AMERICA_LANG = "es-419"
export const JAPANESE_LANG = "ja"
export const TRADITIONAL_CHINESE_LANG = "zh-TW"
export const VIETNAMESE_LANG = "vi"

export const SUPPORTED_UI_LANGUAGES = [
  "en",
  SPANISH_LATIN_AMERICA_LANG,
  JAPANESE_LANG,
  VIETNAMESE_LANG,
  DEFAULT_LANG,
  TRADITIONAL_CHINESE_LANG,
] as const

export type SupportedUiLanguage = (typeof SUPPORTED_UI_LANGUAGES)[number]
