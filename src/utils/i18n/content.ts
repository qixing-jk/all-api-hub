import dayjs from "dayjs"

import "dayjs/locale/es"
import "dayjs/locale/ja"
import "dayjs/locale/vi"
import "dayjs/locale/zh-cn"
import "dayjs/locale/zh-tw"

import { initReactI18next } from "react-i18next"

import { DEFAULT_LANG } from "~/constants"
import { userPreferences } from "~/services/preferences/userPreferences"

import { applyPreferenceLanguage } from "./applyPreferenceLanguage"
import i18n from "./core"
import { resolveInitialAppLanguage } from "./language"
import { mapToDayjsLocale, resources } from "./resources"

let contentI18nReadyPromise: Promise<void> | null = null
let contentI18nInitialized = false

/**
 * Initializes i18n for content scripts without reading host-page storage.
 */
async function initContentI18n() {
  await i18n.use(initReactI18next).init({
    resources,
    fallbackLng: DEFAULT_LANG,
    defaultNS: "common",
    interpolation: { escapeValue: false },
    returnEmptyString: false,
    react: { useSuspense: false },
  })

  const storedLanguage = await userPreferences.getLanguage()
  const initialLanguage = resolveInitialAppLanguage({
    userPreferenceLanguage: storedLanguage,
    detectedLanguage:
      typeof navigator !== "undefined" ? navigator.language : undefined,
  })

  await i18n.changeLanguage(initialLanguage)
  dayjs.locale(mapToDayjsLocale(initialLanguage))
  contentI18nInitialized = true
}

/**
 * Waits for content i18n initialization and refreshes the current preference.
 */
export async function ensureContentI18nReady() {
  const shouldRefreshLanguage = contentI18nInitialized

  if (!contentI18nReadyPromise) {
    contentI18nReadyPromise = initContentI18n().catch((error) => {
      contentI18nReadyPromise = null
      throw error
    })
  }

  await contentI18nReadyPromise
  if (shouldRefreshLanguage) {
    await applyPreferenceLanguage(await userPreferences.getLanguage())
  }
}

i18n.on("languageChanged", (lng) => {
  dayjs.locale(mapToDayjsLocale(lng))
})
