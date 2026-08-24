import { DEFAULT_I18N_NAMESPACE, DEFAULT_LANG } from "~/constants"
import { userPreferences } from "~/services/preferences/userPreferences"

import i18n from "./core"
import { resolveInitialAppLanguage } from "./language"
import { loadAppLanguageResources } from "./resources"

/**
 * 初始化 background i18n
 */
export async function initBackgroundI18n() {
  const storedLanguage = await userPreferences.getLanguage()
  const initialLanguage = resolveInitialAppLanguage({
    userPreferenceLanguage: storedLanguage,
    detectedLanguage:
      typeof navigator !== "undefined" ? navigator.language : undefined,
  })
  const resources = await loadAppLanguageResources(initialLanguage)

  await i18n.init({
    resources,
    fallbackLng: DEFAULT_LANG,
    defaultNS: DEFAULT_I18N_NAMESPACE,
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  })

  await i18n.changeLanguage(initialLanguage)
}
