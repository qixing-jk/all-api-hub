import { describe, expect, it } from "vitest"

import { getAllowanceCountdown } from "~/features/ApiCredentialProfiles/utils/apiCredentialAllowance"
import {
  formatAllowanceCountdown,
  formatAllowanceSignalLabel,
  formatProviderBalance,
  formatQuotaWindowAmount,
  formatQuotaWindowLabel,
  getBalanceSemanticsLabel,
} from "~/features/ApiCredentialProfiles/utils/apiCredentialTelemetryFormatting"
import en from "~/locales/en/apiCredentialProfiles.json"
import type {
  ApiCredentialTelemetryBalanceFact,
  ApiCredentialTelemetryQuotaWindowFact,
} from "~/types/apiCredentialProfiles"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

const i18n = await createResourceTestI18n({ en: { apiCredentialProfiles: en } })
const t = i18n.t.bind(i18n)
const money = { kind: "money", currency: "USD", decimalPlaces: 2 } as const
const quota = {
  kind: "quota",
  code: "provider-quota",
  label: "Credits",
} as const

describe("credential telemetry presentation", () => {
  it.each(["fiveHour", "weekly", "monthly", "total"] as const)(
    "names the %s window",
    (type) => {
      expect(formatQuotaWindowLabel(t, type)).toBe(
        en.telemetry.quotaWindows[type],
      )
    },
  )

  it.each([
    ["glm-credit", en.telemetry.source.glmQuota],
    ["usd-equivalent", en.telemetry.balanceSemantics.budgetEquivalent],
    ["provider-quota", en.telemetry.quota],
  ])("labels remaining %s quota amounts", (code, label) => {
    const window: ApiCredentialTelemetryQuotaWindowFact = {
      type: "monthly",
      remainingPercent: 25,
      remaining: 25,
      limit: 100,
      unit: { ...quota, code },
    }
    expect(formatQuotaWindowAmount(window, t)).toContain(label)
    expect(formatQuotaWindowAmount(window, t)).toContain("25")
    expect(formatQuotaWindowAmount(window, t)).toContain("100")
    expect(
      formatQuotaWindowAmount({ ...window, limit: undefined }, t),
    ).toContain("-")
  })

  it("omits missing absolute amounts and uses the generic label for percentage units", () => {
    const window: ApiCredentialTelemetryQuotaWindowFact = {
      type: "total",
      remainingPercent: 50,
      unit: { kind: "percent" },
    }
    expect(formatQuotaWindowAmount(window, t)).toBeNull()
    expect(formatQuotaWindowAmount({ ...window, remaining: 50 }, t)).toContain(
      en.telemetry.quota,
    )
  })

  it("preserves provider units and avoids repeating budget-equivalent semantics", () => {
    const balance: ApiCredentialTelemetryBalanceFact = {
      amount: 12,
      unit: quota,
      semantics: "budget-equivalent",
    }
    expect(formatProviderBalance(balance, t)).toBe("12 Credits")
    expect(getBalanceSemanticsLabel(balance, t)).toBe(
      en.telemetry.balanceSemantics.budgetEquivalent,
    )
    const equivalent = {
      ...balance,
      unit: { ...quota, code: "usd-equivalent" },
    }
    expect(formatProviderBalance(equivalent, t)).toContain(
      en.telemetry.balanceSemantics.budgetEquivalent,
    )
    expect(getBalanceSemanticsLabel(equivalent, t)).toBeNull()
    expect(
      getBalanceSemanticsLabel({ ...balance, semantics: "provider-wallet" }, t),
    ).toBe(en.telemetry.balanceSemantics.providerWallet)
    expect(
      formatProviderBalance(
        { ...balance, unit: { ...money, currency: "invalid" } },
        t,
      ),
    ).toBe("invalid 12.00")
  })

  it.each([
    [2 * 86400000 + 3 * 3600000, "daysHours"],
    [3 * 3600000 + 2 * 60000, "hoursMinutes"],
    [2 * 60000, "minutes"],
    [1000, "imminent"],
    [-1000, "elapsed"],
  ] as const)("localizes a reset %s ms away as %s", (delta, key) => {
    const countdown = getAllowanceCountdown(100000000 + delta, 100000000)!
    expect(formatAllowanceCountdown(t, countdown)).toBe(
      t(
        `apiCredentialProfiles:telemetry.quotaWindows.countdown.${key}`,
        countdown,
      ),
    )
  })

  it("names a quota window when its percentage is unavailable", () => {
    expect(
      formatAllowanceSignalLabel(t, {
        kind: "quota-window",
        id: "quota",
        level: "unknown",
        urgency: Infinity,
        windowType: "monthly",
        unit: quota,
        remainingPercent: NaN,
      }),
    ).toBe(en.telemetry.quotaWindows.monthly)
  })
})
