import { DEFAULT_LANG } from "~/constants"

export const SUPPORTED_UI_LANGUAGES = ["en", DEFAULT_LANG] as const

export type SupportedUiLanguage = (typeof SUPPORTED_UI_LANGUAGES)[number]

const ENGLISH_LANG: SupportedUiLanguage = "en"

const isLanguageFamily = (
  language: string | undefined,
  family: string,
): boolean => {
  return language === family || language?.startsWith(`${family}-`) === true
}

export const UI_LANGUAGE_OPTIONS = [
  {
    code: ENGLISH_LANG,
    translationKey: "appearanceLanguage.switcher.options.en",
  },
  {
    code: DEFAULT_LANG,
    translationKey: "appearanceLanguage.switcher.options.zh_CN",
  },
] as const satisfies ReadonlyArray<{
  code: SupportedUiLanguage
  translationKey: string
}>

/**
 * Normalize a runtime language tag into a lowercase, hyphenated form.
 */
export function normalizeLanguageTag(
  language?: string | null,
): string | undefined {
  const normalized = language?.trim().toLowerCase().replace(/_/g, "-")
  return normalized || undefined
}

/**
 * Return true when the language belongs to the Chinese locale family.
 */
export function isChineseLanguage(language?: string | null): boolean {
  return isLanguageFamily(normalizeLanguageTag(language), "zh")
}

/**
 * Return true when the language belongs to the English locale family.
 */
export function isEnglishLanguage(language?: string | null): boolean {
  return isLanguageFamily(normalizeLanguageTag(language), "en")
}

/**
 * Return true when the language belongs to the Japanese locale family.
 */
export function isJapaneseLanguage(language?: string | null): boolean {
  return isLanguageFamily(normalizeLanguageTag(language), "ja")
}

/**
 * Normalize runtime/browser language codes to the app's supported locale keys.
 */
export function normalizeAppLanguage(
  language?: string | null,
): SupportedUiLanguage | undefined {
  if (isEnglishLanguage(language)) return ENGLISH_LANG
  if (isChineseLanguage(language)) return DEFAULT_LANG

  return undefined
}

/**
 * Resolve the startup language with user preference taking priority over runtime detection.
 */
export function resolveInitialAppLanguage(input: {
  userPreferenceLanguage?: string | null
  detectedLanguage?: string | null
}): SupportedUiLanguage {
  return (
    normalizeAppLanguage(input.userPreferenceLanguage) ??
    normalizeAppLanguage(input.detectedLanguage) ??
    ENGLISH_LANG
  )
}
