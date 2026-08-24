import type { Locale } from "date-fns"

import {
  DEFAULT_LANG,
  GERMAN_LANG,
  JAPANESE_LANG,
  PORTUGUESE_BRAZIL_LANG,
  SPANISH_LATIN_AMERICA_LANG,
  TRADITIONAL_CHINESE_LANG,
  VIETNAMESE_LANG,
} from "~/constants"
import { createCachedLocaleLoader } from "~/utils/i18n/createCachedLocaleLoader"
import { normalizeAppLanguage } from "~/utils/i18n/language"

type DatePickerLocaleKey =
  | "de"
  | "en-US"
  | "es"
  | "ja"
  | "pt-BR"
  | "vi"
  | "zh-CN"
  | "zh-TW"

const resolvedEnglishLocale = Promise.resolve(undefined)
type LocalizedDatePickerLocaleKey = Exclude<DatePickerLocaleKey, "en-US">

const localeImporters: Record<
  LocalizedDatePickerLocaleKey,
  () => Promise<Locale>
> = {
  de: () => import("date-fns/locale/de").then(({ de }) => de),
  es: () => import("date-fns/locale/es").then(({ es }) => es),
  ja: () => import("date-fns/locale/ja").then(({ ja }) => ja),
  "pt-BR": () => import("date-fns/locale/pt-BR").then(({ ptBR }) => ptBR),
  vi: () => import("date-fns/locale/vi").then(({ vi }) => vi),
  "zh-CN": () => import("date-fns/locale/zh-CN").then(({ zhCN }) => zhCN),
  "zh-TW": () => import("date-fns/locale/zh-TW").then(({ zhTW }) => zhTW),
}

const loadDatePickerLocaleImport = createCachedLocaleLoader(
  (localeKey: LocalizedDatePickerLocaleKey) => localeImporters[localeKey](),
)

/** Resolve a runtime language tag to the closest date-fns calendar locale. */
export function resolveDatePickerLocaleKey(
  language?: string | null,
): DatePickerLocaleKey {
  switch (normalizeAppLanguage(language)) {
    case GERMAN_LANG:
      return "de"
    case SPANISH_LATIN_AMERICA_LANG:
      return "es"
    case PORTUGUESE_BRAZIL_LANG:
      return "pt-BR"
    case JAPANESE_LANG:
      return "ja"
    case VIETNAMESE_LANG:
      return "vi"
    case DEFAULT_LANG:
      return "zh-CN"
    case TRADITIONAL_CHINESE_LANG:
      return "zh-TW"
    default:
      return "en-US"
  }
}

/** Load one date-fns locale, sharing in-flight work and allowing retries. */
export function loadDatePickerLocale(
  language?: string | null,
): Promise<Locale | undefined> {
  const localeKey = resolveDatePickerLocaleKey(language)
  if (localeKey === "en-US") return resolvedEnglishLocale
  return loadDatePickerLocaleImport(localeKey)
}
