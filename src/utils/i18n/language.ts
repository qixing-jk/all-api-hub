import {
  DEFAULT_LANG,
  ENGLISH_LANG,
  GERMAN_LANG,
  JAPANESE_LANG,
  PORTUGUESE_BRAZIL_LANG,
  SPANISH_LATIN_AMERICA_LANG,
  TRADITIONAL_CHINESE_LANG,
  VIETNAMESE_LANG,
  type SupportedUiLanguage,
} from "~/constants"

const TRADITIONAL_CHINESE_REGIONS = new Set(["hk", "mo", "tw"])
const APP_LANGUAGE_BY_FAMILY: Partial<Record<string, SupportedUiLanguage>> = {
  en: ENGLISH_LANG,
  [GERMAN_LANG]: GERMAN_LANG,
  es: SPANISH_LATIN_AMERICA_LANG,
  pt: PORTUGUESE_BRAZIL_LANG,
  [JAPANESE_LANG]: JAPANESE_LANG,
  [VIETNAMESE_LANG]: VIETNAMESE_LANG,
}

const isLanguageFamily = (
  language: string | undefined,
  family: string,
): boolean => {
  return language === family || language?.startsWith(`${family}-`) === true
}

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
 * Return true when the language belongs to a Traditional Chinese variant.
 */
function isTraditionalChineseLanguage(normalizedLanguage: string): boolean {
  const subtags = normalizedLanguage.split("-")
  if (subtags.includes("hans")) return false

  return (
    subtags.includes("hant") ||
    subtags.some((tag) => TRADITIONAL_CHINESE_REGIONS.has(tag))
  )
}

/**
 * Return true when the language belongs to the English locale family.
 */
export function isEnglishLanguage(language?: string | null): boolean {
  return isLanguageFamily(normalizeLanguageTag(language), ENGLISH_LANG)
}

/**
 * Return true when the language belongs to the Japanese locale family.
 */
export function isJapaneseLanguage(language?: string | null): boolean {
  return isLanguageFamily(normalizeLanguageTag(language), JAPANESE_LANG)
}

/**
 * Normalize runtime/browser language codes to the app's supported locale keys.
 */
export function normalizeAppLanguage(
  language?: string | null,
): SupportedUiLanguage | undefined {
  const normalizedLanguage = normalizeLanguageTag(language)
  if (!normalizedLanguage) return undefined

  const languageFamily = normalizedLanguage.split("-")[0]
  if (languageFamily !== "zh") {
    return APP_LANGUAGE_BY_FAMILY[languageFamily]
  }

  return isTraditionalChineseLanguage(normalizedLanguage)
    ? TRADITIONAL_CHINESE_LANG
    : DEFAULT_LANG
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
