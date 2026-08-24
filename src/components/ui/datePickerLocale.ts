import type { Locale } from "date-fns"

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
import { createCachedLocaleLoader } from "~/utils/i18n/createCachedLocaleLoader"
import { normalizeAppLanguage } from "~/utils/i18n/language"

const DEFAULT_DATE_PICKER_LOCALE_KEY = "en-US" as const
const resolvedEnglishLocale = Promise.resolve(undefined)

const localeImporters = {
  de: () => import("date-fns/locale/de").then(({ de }) => de),
  es: () => import("date-fns/locale/es").then(({ es }) => es),
  ja: () => import("date-fns/locale/ja").then(({ ja }) => ja),
  "pt-BR": () => import("date-fns/locale/pt-BR").then(({ ptBR }) => ptBR),
  vi: () => import("date-fns/locale/vi").then(({ vi }) => vi),
  "zh-CN": () => import("date-fns/locale/zh-CN").then(({ zhCN }) => zhCN),
  "zh-TW": () => import("date-fns/locale/zh-TW").then(({ zhTW }) => zhTW),
} as const satisfies Record<string, () => Promise<Locale>>

type LocalizedDatePickerLocaleKey = keyof typeof localeImporters
type DatePickerLocaleKey =
  | typeof DEFAULT_DATE_PICKER_LOCALE_KEY
  | LocalizedDatePickerLocaleKey

const DATE_PICKER_LOCALE_BY_APP_LANGUAGE = {
  [ENGLISH_LANG]: DEFAULT_DATE_PICKER_LOCALE_KEY,
  [GERMAN_LANG]: "de",
  [SPANISH_LATIN_AMERICA_LANG]: "es",
  [PORTUGUESE_BRAZIL_LANG]: "pt-BR",
  [JAPANESE_LANG]: "ja",
  [VIETNAMESE_LANG]: "vi",
  [DEFAULT_LANG]: "zh-CN",
  [TRADITIONAL_CHINESE_LANG]: "zh-TW",
} as const satisfies Record<SupportedUiLanguage, DatePickerLocaleKey>

const loadDatePickerLocaleImport = createCachedLocaleLoader(
  (localeKey: LocalizedDatePickerLocaleKey) => localeImporters[localeKey](),
)

/** Resolve a runtime language tag to the closest date-fns calendar locale. */
export function resolveDatePickerLocaleKey(
  language?: string | null,
): DatePickerLocaleKey {
  const appLanguage = normalizeAppLanguage(language) ?? ENGLISH_LANG
  return DATE_PICKER_LOCALE_BY_APP_LANGUAGE[appLanguage]
}

/** Load one date-fns locale, sharing in-flight work and allowing retries. */
export function loadDatePickerLocale(
  language?: string | null,
): Promise<Locale | undefined> {
  const localeKey = resolveDatePickerLocaleKey(language)
  if (localeKey === DEFAULT_DATE_PICKER_LOCALE_KEY) {
    return resolvedEnglishLocale
  }
  return loadDatePickerLocaleImport(localeKey)
}
