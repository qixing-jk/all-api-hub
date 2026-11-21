import { describe, expect, it } from "vitest"

import { CURRENCIES } from "~/constants/money"
import {
  ALLOWANCE_COUNTDOWN_LABELS,
  buildAllowanceSignals,
  getAllowanceCountdown,
} from "~/features/ApiCredentialProfiles/allowance/apiCredentialAllowance"
import {
  formatAllowanceCountdown,
  formatAllowanceSignalLabel,
  formatProviderBalance,
  formatQuotaWindowAmount,
  formatQuotaWindowLabel,
  formatTelemetryAmount,
  getBalanceSemanticsLabel,
} from "~/features/ApiCredentialProfiles/allowance/apiCredentialTelemetryFormatting"
import en from "~/locales/en/apiCredentialProfiles.json"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_OBSERVATION_REASONS,
  MEASUREMENT_UNIT_KINDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import {
  normalizeTelemetryPatchToFacts,
  selectTelemetryBalances,
} from "~/services/apiCredentialProfiles/telemetry/facts"
import type {
  ApiCredentialTelemetryBalanceFact,
  ApiCredentialTelemetryQuotaWindowFact,
} from "~/types/apiCredentialProfiles"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

const i18n = await createResourceTestI18n({ en: { apiCredentialProfiles: en } })
const t = i18n.t.bind(i18n)
const money = {
  kind: MEASUREMENT_UNIT_KINDS.Money,
  currency: CURRENCIES.USD,
  decimalPlaces: 2,
} as const
const quota = {
  kind: MEASUREMENT_UNIT_KINDS.Quota,
  code: "provider-quota",
  label: "Credits",
} as const

describe("credential telemetry presentation", () => {
  it("formats quota spending in its native units when old display metadata is absent", () => {
    expect(
      formatTelemetryAmount(
        {
          value: "25",
          unit: { kind: "quota", code: "credits", label: "Credits" },
        },
        t,
      ),
    ).toBe("25 Credits")
  })
  it("identifies manually mapped wallets and budgets without implying reported cash", () => {
    const context = {
      profileId: "manual",
      baseUrl: "https://manual.example",
      observedAt: 1000,
    }
    const wallet = selectTelemetryBalances(
      normalizeTelemetryPatchToFacts(
        {
          balance: { currency: "USD", amount: "3" },
          financialMapping: {
            asset: { kind: "currency", code: "USD" },
            role: "available",
            scope: "credential",
          },
        },
        "customReadOnlyEndpoint",
        context,
      ),
    )[0]!
    const budget = selectTelemetryBalances(
      normalizeTelemetryPatchToFacts(
        {
          budget: { asset: { kind: "currency", code: "USD" }, remaining: "5" },
          financialMapping: {
            asset: { kind: "currency", code: "USD" },
            role: "budget-remaining",
            scope: "credential",
          },
        },
        "customReadOnlyEndpoint",
        context,
      ),
    )[0]!
    expect(getBalanceSemanticsLabel(wallet, t)).toBe(
      en.telemetry.balanceSemantics.manual,
    )
    expect(getBalanceSemanticsLabel(budget, t)).toBe(
      en.telemetry.balanceSemantics.manual,
    )
    expect(
      getBalanceSemanticsLabel(
        { amount: 42, unit: money, semantics: "legacy" },
        t,
      ),
    ).toBe(en.telemetry.balanceSemantics.legacy)
    expect(
      formatProviderBalance(
        {
          amount: 0.125,
          unit: { kind: "crypto", id: "XNO" },
          semantics: "legacy",
        },
        t,
      ),
    ).toBe("0.125 XNO")
  })
  it("qualifies a retained unlimited state as last known in the allowance badge", () => {
    const facts = normalizeTelemetryPatchToFacts(
      {
        budget: {
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          unlimited: true,
        },
      },
      "newApiTokenUsage",
      {
        profileId: "credential",
        baseUrl: "https://gateway.example",
        observedAt: 1000,
      },
    )
    facts.budgets![0]!.stateObservation = {
      status: OBSERVATION_STATUSES.Stale,
      source: {
        adapter: "newApiTokenUsage",
        operation: "newApiTokenUsage",
        contractVersion: "2",
        kind: EVIDENCE_KINDS.Reported,
      },
      observedAt: 1000,
      reason: FINANCIAL_OBSERVATION_REASONS.RefreshFailed,
    }
    expect(selectTelemetryBalances(facts)[0]).toMatchObject({
      status: "stale",
      observedAt: 1000,
    })
    expect(
      formatAllowanceSignalLabel(t, buildAllowanceSignals(facts)[0]!),
    ).toContain(en.telemetry.balanceSemantics.stale)
    expect(buildAllowanceSignals(facts)[0]!.level).toBe("unknown")
  })
  it("uses the same original asset scale in budget details and the allowance badge", () => {
    const facts = normalizeTelemetryPatchToFacts(
      {
        budget: {
          asset: {
            kind: ASSET_KINDS.Quota,
            id: "provider:credit",
            label: "credit",
            displayScale: 10,
            displayLabel: "credit",
          },
          remaining: "50",
          limit: "100",
        },
      },
      "customReadOnlyEndpoint",
      {
        profileId: "fixture",
        baseUrl: "https://fixture.example",
        observedAt: 1000,
      },
    )
    expect(
      formatAllowanceSignalLabel(t, buildAllowanceSignals(facts)[0]!),
    ).toBe("5 credit")
    expect(formatProviderBalance(selectTelemetryBalances(facts)[0]!, t)).toBe(
      "5 credit",
    )
  })
  it("shows a known currency even when its observed amount is unavailable", () => {
    const facts = normalizeTelemetryPatchToFacts(
      { balance: { currency: CURRENCIES.CNY } },
      "deepSeekBalance",
      {
        profileId: "fixture",
        baseUrl: "https://fixture.example",
        observedAt: 1000,
      },
    )
    expect(
      formatProviderBalance(selectTelemetryBalances(facts)[0]!, t),
    ).toContain("CNY")
    expect(
      formatProviderBalance(selectTelemetryBalances(facts)[0]!, t),
    ).toContain(en.telemetry.notProvided)
  })
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
    ["provider-quota", "Credits"],
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
    ).not.toContain("/")
  })

  it("omits missing absolute amounts and uses the generic label for percentage units", () => {
    const window: ApiCredentialTelemetryQuotaWindowFact = {
      type: "total",
      remainingPercent: 50,
      unit: { kind: MEASUREMENT_UNIT_KINDS.Percent },
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
    [2 * 86400000 + 3 * 3600000, ALLOWANCE_COUNTDOWN_LABELS.DaysHours],
    [3 * 3600000 + 2 * 60000, ALLOWANCE_COUNTDOWN_LABELS.HoursMinutes],
    [2 * 60000, ALLOWANCE_COUNTDOWN_LABELS.Minutes],
    [1000, ALLOWANCE_COUNTDOWN_LABELS.Imminent],
    [-1000, ALLOWANCE_COUNTDOWN_LABELS.Elapsed],
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
