import i18n from "./core"
import { normalizeAppLanguage } from "./language"

/**
 * Apply a persisted UI language preference to the active i18n instance when it
 * differs from the current runtime language.
 */
export async function applyPreferenceLanguage(
  language?: string | null,
): Promise<boolean> {
  const nextLanguage = normalizeAppLanguage(language)
  if (!nextLanguage) {
    return false
  }

  const currentLanguage = normalizeAppLanguage(
    i18n.resolvedLanguage || i18n.language,
  )

  if (nextLanguage === currentLanguage) {
    return false
  }

  await i18n.changeLanguage(nextLanguage)
  return true
}
