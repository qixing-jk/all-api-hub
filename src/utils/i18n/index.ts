import dayjs from "dayjs"

import "dayjs/locale/zh-cn"

import LanguageDetector from "i18next-browser-languagedetector"
import { initReactI18next } from "react-i18next"

import { DEFAULT_LANG } from "~/constants"
import { I18NEXT_LANGUAGE_STORAGE_KEY } from "~/services/core/storageKeys"
import { userPreferences } from "~/services/preferences/userPreferences"

import i18n from "./core"
import { resolveInitialAppLanguage } from "./language"
import { mapToDayjsLocale, resources } from "./resources"

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    debug: process.env.NODE_ENV === "development",
    fallbackLng: DEFAULT_LANG,
    defaultNS: "common",
    // default config: https://github.com/i18next/i18next-browser-languageDetector#detector-options
    detection: {
      lookupLocalStorage: I18NEXT_LANGUAGE_STORAGE_KEY,
    },
    resources,
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
    const initialLanguage = resolveInitialAppLanguage({
      userPreferenceLanguage: storedLanguage,
      detectedLanguage: i18n.resolvedLanguage || i18n.language,
    })

    if (
      initialLanguage !== i18n.resolvedLanguage &&
      initialLanguage !== i18n.language
    ) {
      await i18n.changeLanguage(initialLanguage)
    }

    dayjs.locale(mapToDayjsLocale(initialLanguage))
  })

export default i18n
export { mapToDayjsLocale }

i18n.on("languageChanged", async (lng) => {
  dayjs.locale(mapToDayjsLocale(lng))
})
