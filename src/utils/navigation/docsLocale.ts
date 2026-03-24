import { I18NEXT_LANGUAGE_STORAGE_KEY } from "~/services/core/storageKeys"
import i18n from "~/utils/i18n/core"
import {
  isChineseLanguage,
  isEnglishLanguage,
  isJapaneseLanguage,
  normalizeLanguageTag,
} from "~/utils/i18n/language"

/**
 * resolvePreferredLanguage determines the most appropriate language to use for the documentation interface.
 * @param language - An optional language code provided directly (e.g., from a query parameter or user selection).
 */
function resolvePreferredLanguage(language?: string): string {
  if (language) return language

  try {
    const stored =
      typeof window !== "undefined"
        ? window.localStorage?.getItem(I18NEXT_LANGUAGE_STORAGE_KEY)
        : null
    if (stored) return stored
  } catch {
    // Ignore storage access issues (e.g., background/service worker contexts)
  }

  if (i18n.isInitialized && i18n.language) return i18n.language

  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language
  }

  return "en"
}

/**
 * normalizeLanguage standardizes a language code by trimming whitespace, converting to lowercase, and replacing underscores with hyphens.
 * @param language - The language code to normalize (e.g., " en_US " becomes "en-us").
 */
function normalizeLanguage(language: string): string {
  return normalizeLanguageTag(language) ?? ""
}

/**
 * getDocsLocalePath generates the appropriate locale path segment for documentation URLs based on the provided or resolved language code.
 * @param language - An optional language code to determine the locale path (e.g., "en", "ja"). If not provided, it will be resolved using resolvePreferredLanguage.
 */
export function getDocsLocalePath(language?: string): string {
  const resolvedLanguage = resolvePreferredLanguage(language)
  const normalized = normalizeLanguage(resolvedLanguage)

  if (isChineseLanguage(normalized)) return ""
  if (isJapaneseLanguage(normalized)) return "ja/"
  if (isEnglishLanguage(normalized)) return "en/"
  return "en/"
}
