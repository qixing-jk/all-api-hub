import { describe, expect, it } from "vitest"

import deAutoCheckin from "~/locales/de/autoCheckin.json"
import enAutoCheckin from "~/locales/en/autoCheckin.json"
import enSettings from "~/locales/en/settings.json"
import esAutoCheckin from "~/locales/es-419/autoCheckin.json"
import jaAutoCheckin from "~/locales/ja/autoCheckin.json"
import ptBrAutoCheckin from "~/locales/pt-BR/autoCheckin.json"
import viAutoCheckin from "~/locales/vi/autoCheckin.json"
import zhCnAutoCheckin from "~/locales/zh-CN/autoCheckin.json"
import zhCnSettings from "~/locales/zh-CN/settings.json"
import zhTwAutoCheckin from "~/locales/zh-TW/autoCheckin.json"

describe("auto-checkin result category copy", () => {
  it("describes skipped check-in outcomes as not executed in Chinese", () => {
    expect(zhCnAutoCheckin.execution.filters.skipped).toBe("未执行")
    expect(zhCnAutoCheckin.execution.status.skipped).toBe("未执行")
    expect(zhCnAutoCheckin.status.result.skipped).toBe("未执行")
    expect(zhCnAutoCheckin.status.summary.skipped).toBe("未执行")
    expect(zhCnAutoCheckin.execution.filters.selectedStatuses).toBe(
      "已选 {{count}} 类",
    )
    expect(
      zhCnSettings.taskNotifications.notification
        .countsWithAutoCheckinCategories,
    ).toContain("未执行 {{skipped}}")
  })

  it("describes skipped check-in outcomes as not executed in English", () => {
    expect(enAutoCheckin.execution.filters.skipped).toBe("Not executed")
    expect(enAutoCheckin.execution.status.skipped).toBe("Not executed")
    expect(enAutoCheckin.status.result.skipped).toBe("Not executed")
    expect(enAutoCheckin.status.summary.skipped).toBe("Not executed")
    expect(enAutoCheckin.execution.filters.selectedStatuses_one).toBe(
      "{{count}} status selected",
    )
    expect(enAutoCheckin.execution.filters.selectedStatuses_other).toBe(
      "{{count}} statuses selected",
    )
    expect(
      enSettings.taskNotifications.notification.countsWithAutoCheckinCategories,
    ).toContain("not executed {{skipped}}")
  })
})

/**
 * The per-account failure copy users read in the execution result table and in
 * the quick check-in toast. It has to name what happened in the user's own terms
 * and keep the recovery affordances, in every shipped locale.
 */
type CheckinFailureFamilies = {
  providerFallback: Record<string, string>
  skipReasons: Record<string, string>
}

const CHECKIN_FAILURE_FAMILIES: Record<string, CheckinFailureFamilies> = {
  "zh-CN": zhCnAutoCheckin,
  "zh-TW": zhTwAutoCheckin,
  en: enAutoCheckin,
  ja: jaAutoCheckin,
  de: deAutoCheckin,
  "es-419": esAutoCheckin,
  "pt-BR": ptBrAutoCheckin,
  vi: viAutoCheckin,
}

/** Implementation vocabulary of the check-in pipeline, not of the user's world. */
const INTERNAL_JARGON: Record<string, string[]> = {
  "zh-CN": ["临时签到页面", "临时窗口", "目标账号", "执行上下文", "签到接口"],
  "zh-TW": ["臨時簽到頁面", "臨時視窗", "目標帳號", "執行內容", "簽到介面"],
  en: [
    "temporary check-in page",
    "temp window",
    "target account",
    "execution context",
    "check-in endpoint",
  ],
  ja: [
    "一時チェックインページ",
    "一時ウィンドウ",
    "対象アカウント",
    "実行コンテキスト",
    "チェックインエンドポイント",
  ],
  de: [
    "temporäre Check-in-Seite",
    "temporäres Fenster",
    "Zielkonto",
    "Ausführungskontext",
    "Check-in-Endpunkt",
  ],
  "es-419": [
    "página de check-in temporal",
    "ventana temporal",
    "cuenta de destino",
    "contexto de ejecución",
    "endpoint de check-in",
  ],
  "pt-BR": [
    "página de check-in temporária",
    "página de check-in temporário",
    "janela temporária",
    "conta de destino",
    "contexto de execução",
    "endpoint de check-in",
  ],
  vi: [
    "trang điểm danh tạm thời",
    "cửa sổ tạm thời",
    "tài khoản mục tiêu",
    "ngữ cảnh thực thi",
    "giao diện điểm danh",
  ],
}

const getFamilies = (locale: string): CheckinFailureFamilies => {
  const families = CHECKIN_FAILURE_FAMILIES[locale]
  if (!families) throw new Error(`No auto-checkin copy for ${locale}`)
  return families
}

const getJargon = (locale: string): string[] => {
  const jargon = INTERNAL_JARGON[locale]
  if (!jargon) throw new Error(`No jargon list for ${locale}`)
  return jargon
}

const readMessage = (
  locale: string,
  family: keyof CheckinFailureFamilies,
  key: string,
): string => {
  const message = getFamilies(locale)[family][key]
  if (message === undefined)
    throw new Error(`Missing ${locale} ${family}.${key}`)
  return message
}

const readFailureCopy = (
  locale: string,
  family: keyof CheckinFailureFamilies,
): Array<[string, string]> => Object.entries(getFamilies(locale)[family])

const readPlaceholders = (message: string): string[] =>
  [...message.matchAll(/\{\{(\w+)\}\}/g)]
    .flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
    .sort()

const localeNames = Object.keys(CHECKIN_FAILURE_FAMILIES)
const failureFamilies: Array<keyof CheckinFailureFamilies> = [
  "providerFallback",
  "skipReasons",
]

describe("auto-checkin failure copy", () => {
  it.each(localeNames)("%s translates the same failure keys", (locale) => {
    for (const family of failureFamilies) {
      const referenceKeys = Object.keys(getFamilies("zh-CN")[family]).sort()
      const localeKeys = Object.keys(getFamilies(locale)[family])

      expect(localeKeys.sort()).toEqual(referenceKeys)
    }
  })

  it.each(localeNames)("%s keeps the same message placeholders", (locale) => {
    for (const family of failureFamilies) {
      for (const [key, referenceMessage] of readFailureCopy("zh-CN", family)) {
        const message = readMessage(locale, family, key)

        expect(readPlaceholders(message)).toEqual(
          readPlaceholders(referenceMessage),
        )
      }
    }
  })

  it.each(localeNames)(
    "%s describes failures without internal pipeline jargon",
    (locale) => {
      const jargon = getJargon(locale)

      for (const family of failureFamilies) {
        for (const [key, message] of readFailureCopy(locale, family)) {
          for (const term of jargon) {
            expect(
              message.toLowerCase(),
              `${locale} ${family}.${key} leaks "${term}"`,
            ).not.toContain(term.toLowerCase())
          }
        }
      }
    },
  )

  it.each(localeNames)(
    "%s points page-level failures at the check-in page",
    (locale) => {
      const { providerFallback } = getFamilies(locale)

      for (const message of [
        providerFallback.turnstileManualRequired,
        providerFallback.nativePageIdentityMissing,
        providerFallback.nativePageIdentityMismatch,
        providerFallback.nativePageTargetNotFound,
        providerFallback.nativePageTriggerFailed,
        providerFallback.nativePageStatusUnconfirmed,
      ]) {
        expect(message).toContain("{{checkInUrl}}")
      }
    },
  )

  it("keeps skip reasons short enough to read as filter labels", () => {
    // Skip reasons are reused as reason-filter entries in the results toolbar,
    // so they stay a single short phrase instead of a paragraph of advice.
    const cjkLocales = new Set(["zh-CN", "zh-TW", "ja"])
    for (const [locale, families] of Object.entries(CHECKIN_FAILURE_FAMILIES)) {
      const maxLength = cjkLocales.has(locale) ? 48 : 120
      for (const [key, message] of Object.entries(families.skipReasons)) {
        expect(
          message.length,
          `${locale} skipReasons.${key} is too long for a filter label`,
        ).toBeLessThanOrEqual(maxLength)
        expect(message).not.toContain("{{")
      }
    }
  })

  it("explains the manual verification step in the user's own words", () => {
    expect(zhCnAutoCheckin.providerFallback.turnstileManualRequired).toContain(
      "人机验证",
    )
    expect(zhCnAutoCheckin.providerFallback.turnstileManualRequired).toContain(
      "Turnstile",
    )
    expect(enAutoCheckin.providerFallback.turnstileManualRequired).toMatch(
      /human verification/i,
    )
    expect(zhCnAutoCheckin.skipReasons.manual_verification_required).toContain(
      "人机验证",
    )
  })
})
