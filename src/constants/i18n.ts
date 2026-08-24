export const DEFAULT_LANG = "zh-CN"
export const DEFAULT_I18N_NAMESPACE = "common"
export const ENGLISH_LANG = "en"
export const GERMAN_LANG = "de"
export const PORTUGUESE_BRAZIL_LANG = "pt-BR"
export const SPANISH_LATIN_AMERICA_LANG = "es-419"
export const JAPANESE_LANG = "ja"
export const TRADITIONAL_CHINESE_LANG = "zh-TW"
export const VIETNAMESE_LANG = "vi"
const APP_LOCALE_ASSET_DIR = "app-locales"
const APP_LOCALE_ASSET_FILE_EXTENSION = ".json"
export const APP_LOCALE_ASSET_GLOB =
  `${APP_LOCALE_ASSET_DIR}/*${APP_LOCALE_ASSET_FILE_EXTENSION}` as const

export const SUPPORTED_UI_LANGUAGES = [
  ENGLISH_LANG,
  GERMAN_LANG,
  SPANISH_LATIN_AMERICA_LANG,
  PORTUGUESE_BRAZIL_LANG,
  JAPANESE_LANG,
  VIETNAMESE_LANG,
  DEFAULT_LANG,
  TRADITIONAL_CHINESE_LANG,
] as const

export type SupportedUiLanguage = (typeof SUPPORTED_UI_LANGUAGES)[number]

/** Return the canonical packaged asset path for one application locale. */
export function getAppLocaleAssetPath(language: SupportedUiLanguage) {
  return `${APP_LOCALE_ASSET_DIR}/${language}${APP_LOCALE_ASSET_FILE_EXTENSION}` as const
}
