import {
  DEFAULT_LANG,
  GERMAN_LANG,
  JAPANESE_LANG,
  PORTUGUESE_BRAZIL_LANG,
  SPANISH_LATIN_AMERICA_LANG,
  TRADITIONAL_CHINESE_LANG,
  VIETNAMESE_LANG,
} from "~/constants"

import { normalizeAppLanguage } from "./language"

type DayjsLocale =
  | "de"
  | "en"
  | "es"
  | "ja"
  | "pt-br"
  | "vi"
  | "zh-cn"
  | "zh-tw"

const ENGLISH_DAYJS_LOCALE: DayjsLocale = "en"
const resolvedEnglishLocale = Promise.resolve(ENGLISH_DAYJS_LOCALE)
const localeImportCache = new Map<DayjsLocale, Promise<DayjsLocale>>()

const localeImporters: Partial<Record<DayjsLocale, () => Promise<unknown>>> = {
  de: () => import("dayjs/locale/de"),
  es: () => import("dayjs/locale/es"),
  ja: () => import("dayjs/locale/ja"),
  "pt-br": () => import("dayjs/locale/pt-br"),
  vi: () => import("dayjs/locale/vi"),
  "zh-cn": () => import("dayjs/locale/zh-cn"),
  "zh-tw": () => import("dayjs/locale/zh-tw"),
}

/** Resolve a runtime language tag to the finite Day.js locale set we ship. */
export function resolveDayjsLocale(language?: string | null): DayjsLocale {
  switch (normalizeAppLanguage(language)) {
    case GERMAN_LANG:
      return "de"
    case SPANISH_LATIN_AMERICA_LANG:
      return "es"
    case PORTUGUESE_BRAZIL_LANG:
      return "pt-br"
    case JAPANESE_LANG:
      return "ja"
    case VIETNAMESE_LANG:
      return "vi"
    case DEFAULT_LANG:
      return "zh-cn"
    case TRADITIONAL_CHINESE_LANG:
      return "zh-tw"
    default:
      return ENGLISH_DAYJS_LOCALE
  }
}

/** Load one Day.js locale module, sharing in-flight work and allowing retries. */
export function loadDayjsLocale(
  language?: string | null,
): Promise<DayjsLocale> {
  const locale = resolveDayjsLocale(language)
  if (locale === ENGLISH_DAYJS_LOCALE) return resolvedEnglishLocale

  const cachedImport = localeImportCache.get(locale)
  if (cachedImport) return cachedImport

  const importer = localeImporters[locale]
  if (!importer) return resolvedEnglishLocale

  const importPromise = importer()
    .then(() => locale)
    .catch((error) => {
      localeImportCache.delete(locale)
      throw error
    })
  localeImportCache.set(locale, importPromise)
  return importPromise
}
