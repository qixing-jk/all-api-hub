import dayjs from "dayjs"

import "dayjs/locale/de"
import "dayjs/locale/es"
import "dayjs/locale/ja"
import "dayjs/locale/pt-br"
import "dayjs/locale/vi"
import "dayjs/locale/zh-cn"
import "dayjs/locale/zh-tw"

import LanguageDetector from "i18next-browser-languagedetector"
import { initReactI18next } from "react-i18next"

import { DEFAULT_LANG } from "~/constants"
import { I18NEXT_LANGUAGE_STORAGE_KEY } from "~/services/core/storageKeys"
import { userPreferences } from "~/services/preferences/userPreferences"
import { isDevBuild } from "~/utils/core/environment"

import i18n from "./core"
import { normalizeAppLanguage, resolveInitialAppLanguage } from "./language"
import {
  installAppLanguageResources,
  loadAppLanguageResources,
  mapToDayjsLocale,
} from "./resources"

/**
 * Keep the extension page root language aligned with the active UI locale.
 */
function syncDocumentLanguage(language: string) {
  if (typeof document === "undefined") {
    return
  }

  document.documentElement.lang = normalizeAppLanguage(language) ?? language
}

export const i18nReady = i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    debug: isDevBuild(),
    fallbackLng: DEFAULT_LANG,
    defaultNS: "common",
    // default config: https://github.com/i18next/i18next-browser-languageDetector#detector-options
    detection: {
      lookupLocalStorage: I18NEXT_LANGUAGE_STORAGE_KEY,
    },
    resources: {},
    interpolation: {
      escapeValue: false, // react already escapes by default
    },
    missingInterpolationHandler: () => "",
    // Set the language determined by user preferences, or let detector handle it
    react: {
      useSuspense: false,
    },
  })
  .then(async () => {
    const storedLanguage = await userPreferences.getLanguage()
    const requestedLanguage = normalizeAppLanguage(i18n.language)
    const resolvedLanguage = normalizeAppLanguage(i18n.resolvedLanguage)
    // i18next resolves unsupported regional tags to the configured fallback
    // before the app can normalize them (for example, pt-PT -> pt-BR).
    const detectedLanguage =
      resolvedLanguage === DEFAULT_LANG &&
      requestedLanguage &&
      requestedLanguage !== DEFAULT_LANG
        ? requestedLanguage
        : resolvedLanguage ?? requestedLanguage
    const initialLanguage = resolveInitialAppLanguage({
      userPreferenceLanguage: storedLanguage,
      detectedLanguage,
    })

    installAppLanguageResources(
      i18n,
      await loadAppLanguageResources(initialLanguage),
    )
    // Re-resolve even when the detector selected the same language because
    // resources are intentionally installed only after detection completes.
    await i18n.changeLanguage(initialLanguage)

    dayjs.locale(mapToDayjsLocale(initialLanguage))
    syncDocumentLanguage(initialLanguage)
  })

export default i18n

i18n.on("languageChanged", async (lng) => {
  dayjs.locale(mapToDayjsLocale(lng))
  syncDocumentLanguage(lng)
})
