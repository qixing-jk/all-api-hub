import dayjs from "dayjs"

import "dayjs/locale/de"
import "dayjs/locale/es"
import "dayjs/locale/ja"
import "dayjs/locale/pt-br"
import "dayjs/locale/vi"
import "dayjs/locale/zh-cn"
import "dayjs/locale/zh-tw"

import { DEFAULT_LANG } from "~/constants"
import { userPreferences } from "~/services/preferences/userPreferences"

import i18n from "./core"
import { resolveInitialAppLanguage } from "./language"
import { loadAppLanguageResources, mapToDayjsLocale } from "./resources"

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
    defaultNS: "common",
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  })

  await i18n.changeLanguage(initialLanguage)

  // 同步 dayjs locale
  dayjs.locale(mapToDayjsLocale(initialLanguage))
}

// 监听语言变更，保持 dayjs 一致
i18n.on("languageChanged", (lng) => {
  dayjs.locale(mapToDayjsLocale(lng))
})
