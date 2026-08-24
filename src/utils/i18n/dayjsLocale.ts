import {
  DEFAULT_LANG,
  ENGLISH_LANG,
  GERMAN_LANG,
  JAPANESE_LANG,
  PORTUGUESE_BRAZIL_LANG,
  SPANISH_LATIN_AMERICA_LANG,
  TRADITIONAL_CHINESE_LANG,
  VIETNAMESE_LANG,
  type SupportedUiLanguage,
} from "~/constants"

import { createCachedLocaleLoader } from "./createCachedLocaleLoader"
import { normalizeAppLanguage } from "./language"

const ENGLISH_DAYJS_LOCALE = "en" as const
const localeImporters = {
  de: () => import("dayjs/locale/de"),
  es: () => import("dayjs/locale/es"),
  ja: () => import("dayjs/locale/ja"),
  "pt-br": () => import("dayjs/locale/pt-br"),
  vi: () => import("dayjs/locale/vi"),
  "zh-cn": () => import("dayjs/locale/zh-cn"),
  "zh-tw": () => import("dayjs/locale/zh-tw"),
} as const

type NonEnglishDayjsLocale = keyof typeof localeImporters
type DayjsLocale = typeof ENGLISH_DAYJS_LOCALE | NonEnglishDayjsLocale

const resolvedEnglishLocale = Promise.resolve(ENGLISH_DAYJS_LOCALE)
const DAYJS_LOCALE_BY_APP_LANGUAGE = {
  [ENGLISH_LANG]: ENGLISH_DAYJS_LOCALE,
  [GERMAN_LANG]: "de",
  [SPANISH_LATIN_AMERICA_LANG]: "es",
  [PORTUGUESE_BRAZIL_LANG]: "pt-br",
  [JAPANESE_LANG]: "ja",
  [VIETNAMESE_LANG]: "vi",
  [DEFAULT_LANG]: "zh-cn",
  [TRADITIONAL_CHINESE_LANG]: "zh-tw",
} as const satisfies Record<SupportedUiLanguage, DayjsLocale>

const loadDayjsLocaleImport = createCachedLocaleLoader(
  async (locale: NonEnglishDayjsLocale) => {
    await localeImporters[locale]()
    return locale
  },
)

/** Resolve a runtime language tag to the finite Day.js locale set we ship. */
export function resolveDayjsLocale(language?: string | null): DayjsLocale {
  const appLanguage = normalizeAppLanguage(language) ?? ENGLISH_LANG
  return DAYJS_LOCALE_BY_APP_LANGUAGE[appLanguage]
}

/** Load one Day.js locale module, sharing in-flight work and allowing retries. */
export function loadDayjsLocale(
  language?: string | null,
): Promise<DayjsLocale> {
  const locale = resolveDayjsLocale(language)
  if (locale === ENGLISH_DAYJS_LOCALE) return resolvedEnglishLocale
  return loadDayjsLocaleImport(locale)
}
