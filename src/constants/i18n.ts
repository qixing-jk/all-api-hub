export const DEFAULT_LANG = "zh-CN"

export const SUPPORTED_UI_LANGUAGES = ["en", DEFAULT_LANG] as const

export type SupportedUiLanguage = (typeof SUPPORTED_UI_LANGUAGES)[number]
