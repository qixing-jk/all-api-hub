import {
  DEFAULT_LANG,
  JAPANESE_LANG,
  TRADITIONAL_CHINESE_LANG,
  type SupportedUiLanguage,
} from "~/constants"

const ENGLISH_LANG: SupportedUiLanguage = "en"
const TRADITIONAL_CHINESE_REGIONS = new Set(["hk", "mo", "tw"])

const isLanguageFamily = (
  language: string | undefined,
  family: string,
): boolean => {
  return language === family || language?.startsWith(`${family}-`) === true
}

export const UI_LANGUAGE_OPTIONS = [
  {
    code: ENGLISH_LANG,
  },
  {
    code: JAPANESE_LANG,
  },
  {
    code: DEFAULT_LANG,
  },
  {
    code: TRADITIONAL_CHINESE_LANG,
  },
] as const satisfies ReadonlyArray<{
  code: SupportedUiLanguage
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
 * Return true when the language belongs to a Traditional Chinese variant.
 */
export function isTraditionalChineseLanguage(
  language?: string | null,
): boolean {
  const normalized = normalizeLanguageTag(language)
  if (!normalized || !isChineseLanguage(normalized)) return false

  const subtags = normalized.split("-")
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
  if (isJapaneseLanguage(language)) return JAPANESE_LANG
  if (isTraditionalChineseLanguage(language)) return TRADITIONAL_CHINESE_LANG
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
