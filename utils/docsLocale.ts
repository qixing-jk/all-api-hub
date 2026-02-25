import i18n from "i18next"

import { DEFAULT_LANG } from "~/constants"
import { I18NEXT_LANGUAGE_STORAGE_KEY } from "~/services/storageKeys"

/**
 * resolvePreferredLanguage determines the most appropriate language to use for the documentation interface.
 * @param language - An optional language code provided directly (e.g., from a query parameter or user selection).
 */
export function resolvePreferredLanguage(language?: string): string {
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

  return DEFAULT_LANG
}

/**
 * normalizeLanguage standardizes a language code by trimming whitespace, converting to lowercase, and replacing underscores with hyphens.
 * @param language - The language code to normalize (e.g., " en_US " becomes "en-us").
 */
export function normalizeLanguage(language: string): string {
  return language.trim().toLowerCase().replace(/_/g, "-")
}

/**
 * getDocsLocalePath generates the appropriate locale path segment for documentation URLs based on the provided or resolved language code.
 * @param language - An optional language code to determine the locale path (e.g., "en", "ja"). If not provided, it will be resolved using resolvePreferredLanguage.
 */
export function getDocsLocalePath(language?: string): string {
  const normalized = normalizeLanguage(resolvePreferredLanguage(language))

  if (normalized.startsWith("en")) return "en/"
  if (normalized.startsWith("ja")) return "ja/"
  return ""
}
