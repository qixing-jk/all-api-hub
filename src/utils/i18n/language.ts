import { DEFAULT_LANG } from "~/constants"

export const SUPPORTED_UI_LANGUAGES = ["en", DEFAULT_LANG] as const

export type SupportedUiLanguage = (typeof SUPPORTED_UI_LANGUAGES)[number]

export const UI_LANGUAGE_OPTIONS = [
  {
    code: "en",
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
 * Normalize runtime/browser language codes to the app's supported locale keys.
 */
export function normalizeAppLanguage(
  language?: string | null,
): SupportedUiLanguage | undefined {
  if (!language) return undefined

  const normalized = language.trim().toLowerCase().replace(/_/g, "-")

  if (/^en(?:-|$)/.test(normalized)) return "en"
  if (/^zh(?:-|$)/.test(normalized)) return DEFAULT_LANG

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
    DEFAULT_LANG
  )
}
