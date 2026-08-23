import type { i18n as I18nInstance } from "i18next"

import type { SupportedUiLanguage } from "~/constants"

import i18n from "./core"
import { normalizeAppLanguage } from "./language"
import { changeAppLanguage } from "./resources"

type AppLanguageChanger = (
  instance: I18nInstance,
  language: SupportedUiLanguage,
) => Promise<boolean | void>

/**
 * Apply a persisted UI language preference to the active i18n instance when it
 * differs from the current runtime language.
 */
export async function applyPreferenceLanguage(
  language?: string | null,
  changeLanguage: AppLanguageChanger = changeAppLanguage,
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

  const applied = await changeLanguage(i18n, nextLanguage)
  return applied !== false
}
