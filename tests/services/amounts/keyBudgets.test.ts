import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import { CURRENCIES } from "~/constants/money"
import {
  budgetConstraint,
  budgetConstraintSchema,
  staleBudgetConstraint,
} from "~/services/amounts/budgets"
import {
  ASSET_KINDS,
  BUDGET_ENFORCEMENT,
  BUDGET_LIMIT_STATES,
  BUDGET_PERIODS,
  BUDGET_WINDOW_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_OBSERVATION_REASONS,
  FINANCIAL_SUBJECT_KINDS,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import { keyProtocolAmount } from "~/services/apiAdapters/accountKeyResources/budgetFacts"
import {
  formatBudgetConstraint,
  formatBudgetRules,
} from "~/utils/core/budgetPresentation"

// Source fixture only: TrustedRouter is not a registered integration.
// Lore-Hex/quill-router bc244eab03508cca6e9f27894506c391672c9c4b,
// serialization.py:key_shape (retained in balance-semantics/artifacts).
const source = {
  adapter: "trustedrouter",
  contractVersion: "bc244eab",
  operation: "key_shape",
  kind: EVIDENCE_KINDS.Reported,
}
const scope = {
  subject: { kind: FINANCIAL_SUBJECT_KINDS.Credential, profileId: "fixture" },
  authority: "https://trustedrouter.com",
  workspaceId: "workspace-1",
  projects: { kind: SCOPE_SELECTION_KINDS.Unknown },
  keys: { kind: SCOPE_SELECTION_KINDS.Restricted, ids: ["key-1"] },
  models: { kind: SCOPE_SELECTION_KINDS.Unknown },
  groups: { kind: SCOPE_SELECTION_KINDS.Unknown },
}
const base = {
  source,
  scope,
  asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
  observedAt: 1,
}

describe("source-backed key budgets", () => {
  it("does not invent a clock for unknown budget state and keeps confirmed clocks across repeated failures", () => {
    const unknown = budgetConstraint({
      ...base,
      limitState: BUDGET_LIMIT_STATES.Unknown,
    })
    expect(staleBudgetConstraint(unknown).stateObservation).toEqual(
      unknown.stateObservation,
    )
    expect(staleBudgetConstraint(unknown).stateObservation).not.toHaveProperty(
      "observedAt",
    )
    const finite = budgetConstraint({
      ...base,
      limitState: BUDGET_LIMIT_STATES.Finite,
      limit: "10",
      used: "3",
    })
    const first = staleBudgetConstraint(finite)
    const repeated = staleBudgetConstraint(first)
    expect(repeated.stateObservation).toEqual(first.stateObservation)
    expect(repeated.limit).toMatchObject({
      value: "10",
      status: "stale",
      observedAt: 1,
    })
    expect(repeated.used).toMatchObject({
      value: "3",
      status: "stale",
      observedAt: 1,
    })
  })
  it("keeps value observations strict across freshness states without widening budget-state observations", () => {
    const budget = budgetConstraint({
      ...base,
      limitState: BUDGET_LIMIT_STATES.Finite,
      limit: "10",
      enabled: false,
    })
    const known = { source, observedAt: 1 }
    const stale = {
      ...known,
      reason: FINANCIAL_OBSERVATION_REASONS.RefreshUnavailable,
    }
    for (const status of [
      OBSERVATION_STATUSES.Known,
      OBSERVATION_STATUSES.Stale,
    ]) {
      const metadata = status === OBSERVATION_STATUSES.Known ? known : stale
      expect(
        budgetConstraintSchema.safeParse({
          ...budget,
          limit: { ...metadata, status, value: "10" },
          enabled: { ...metadata, status, value: false },
        }).success,
      ).toBe(true)
    }
    for (const status of [
      OBSERVATION_STATUSES.Unknown,
      OBSERVATION_STATUSES.Unsupported,
      OBSERVATION_STATUSES.Unavailable,
    ]) {
      const observation = { status, source, reason: "not-reported" }
      expect(
        budgetConstraintSchema.safeParse({ ...budget, enabled: observation })
          .success,
      ).toBe(true)
      expect(
        budgetConstraintSchema.safeParse({
          ...budget,
          enabled: { ...observation, value: false },
        }).success,
      ).toBe(false)
    }
    for (const enabled of [
      { ...known, status: OBSERVATION_STATUSES.Known, value: 0 },
      { source, status: OBSERVATION_STATUSES.Known, value: false },
      { ...known, status: OBSERVATION_STATUSES.Stale, value: false },
    ]) {
      expect(
        budgetConstraintSchema.safeParse({ ...budget, enabled }).success,
      ).toBe(false)
    }
    expect(
      budgetConstraintSchema.safeParse({
        ...budget,
        limit: { ...known, status: OBSERVATION_STATUSES.Known, value: "10.0" },
      }).success,
    ).toBe(false)
    expect(
      budgetConstraintSchema.safeParse({
        ...budget,
        stateObservation: {
          status: OBSERVATION_STATUSES.Unsupported,
          source,
          reason: "not-reported",
        },
      }).success,
    ).toBe(false)
  })
  it("observes nonnumeric budget states without duplicating the limit state", () => {
    const budget = budgetConstraint({
      ...base,
      limitState: BUDGET_LIMIT_STATES.Unlimited,
    })
    expect(budget.stateObservation).toEqual({
      status: "known",
      source,
      observedAt: 1,
    })
    expect(
      budgetConstraint({ ...base, limitState: BUDGET_LIMIT_STATES.Unknown })
        .stateObservation,
    ).toEqual({
      status: "unknown",
      source,
      reason: "not-reported",
    })
  })
  it("retains authoritative remaining, reserved and separate BYOK counter semantics across all windows", () => {
    const lifetime = budgetConstraint({
      ...base,
      limitState: BUDGET_LIMIT_STATES.Finite,
      limit: keyProtocolAmount("100000000", 1000000),
      used: keyProtocolAmount("25000000", 1000000),
      byokUsed: keyProtocolAmount("5000000", 1000000),
      reserved: keyProtocolAmount("10000000", 1000000),
      remaining: keyProtocolAmount("60000000", 1000000),
      includesByok: true,
      usedIncludesByok: false,
      enforcement: BUDGET_ENFORCEMENT.Hard,
      window: { kind: BUDGET_WINDOW_KINDS.Lifetime },
    })
    const windows = (
      [BUDGET_PERIODS.Day, BUDGET_PERIODS.Week, BUDGET_PERIODS.Month] as const
    ).map((period, index) =>
      budgetConstraint({
        ...base,
        limitState: BUDGET_LIMIT_STATES.Finite,
        limit: String((index + 1) * 50),
        used: "5",
        remaining: String((index + 1) * 50 - 5),
        includesByok: true,
        usedIncludesByok: true,
        enforcement: BUDGET_ENFORCEMENT.Advisory,
        window: { kind: BUDGET_WINDOW_KINDS.Periodic, period, timeZone: "UTC" },
      }),
    )
    expect(lifetime).toMatchObject({
      remaining: { status: "known", value: "60" },
      reserved: { status: "known", value: "10" },
      used: { status: "known", value: "25" },
      byokUsed: { status: "known", value: "5" },
      usedIncludesByok: { value: false },
      includesByok: { value: true },
    })
    expect(windows.map((budget) => budget.window)).toEqual([
      { kind: "periodic", period: "day", timeZone: "UTC" },
      { kind: "periodic", period: "week", timeZone: "UTC" },
      { kind: "periodic", period: "month", timeZone: "UTC" },
    ])
    expect(
      windows.every(
        (budget) =>
          budget.reserved.status === OBSERVATION_STATUSES.Unknown &&
          budget.usedIncludesByok.status === OBSERVATION_STATUSES.Known &&
          budget.usedIncludesByok.value,
      ),
    ).toBe(true)
    expect(
      [lifetime, ...windows].every(
        (budget) => budgetConstraintSchema.safeParse(budget).success,
      ),
    ).toBe(true)
  })

  it("rejects a finite stored budget when neither its limit nor its remaining amount is known", () => {
    const budget = budgetConstraint({
      ...base,
      limitState: BUDGET_LIMIT_STATES.Unknown,
    })
    const result = budgetConstraintSchema.safeParse({
      ...budget,
      limitState: BUDGET_LIMIT_STATES.Finite,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        message: "Finite budgets require an observed limit or remaining",
      }),
    ])
  })

  it("keeps microdollar strings exact and rejects numeric sentinels in unbounded budgets", () => {
    const exact = budgetConstraint({
      ...base,
      limitState: BUDGET_LIMIT_STATES.Finite,
      limit: keyProtocolAmount("9007199254740993", 1000000),
      remaining: "0",
    })
    expect(exact.limit).toMatchObject({
      status: "known",
      value: "9007199254.740993",
    })
    for (const limitState of [
      BUDGET_LIMIT_STATES.Unlimited,
      BUDGET_LIMIT_STATES.Unconfigured,
    ] as const) {
      const budget = budgetConstraint({ ...base, limitState })
      expect(budget.limit.status).toBe("unknown")
      expect(
        budgetConstraintSchema.safeParse({ ...budget, limit: exact.limit })
          .success,
      ).toBe(false)
    }
    expect(
      budgetConstraint({
        ...base,
        limitState: BUDGET_LIMIT_STATES.Finite,
        limit: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toMatchObject({
      limitState: "unknown",
      limit: { status: "unavailable" },
      remaining: { status: "unknown" },
      enabled: { status: "unknown" },
      includesByok: { status: "unknown" },
    })
  })
})

describe("key budget presentation", () => {
  const t = ((key: string) => key.split(".").at(-1)) as TFunction

  it("shows enforcement, reset, disablement and BYOK rules for a rolling budget", () => {
    const budget = budgetConstraint({
      ...base,
      limitState: "finite",
      limit: "12",
      enabled: false,
      enforcement: "hard",
      includesByok: true,
      window: { kind: "rolling", period: "5h", resetsAt: 1 },
    })
    expect(formatBudgetRules(budget, t)).toEqual([
      "5h (rolling)",
      expect.stringMatching(/^reset: /),
      "disabled",
      "hardLimit",
      "includesByok",
    ])
    expect(
      formatBudgetRules(
        budgetConstraint({
          ...base,
          limitState: "unknown",
          window: { kind: "unknown", period: "year" },
        }),
        t,
        false,
      ),
    ).toEqual(["year"])
  })

  it("distinguishes absent limits from unbounded budgets without showing invented zeroes", () => {
    const unlimited = budgetConstraint({
      ...base,
      limitState: "unlimited",
      includesByok: false,
      window: { kind: "periodic", period: "week" },
    })
    expect(formatBudgetConstraint(unlimited, t, false)).toBe(
      "unlimitedQuota · week · excludesByok",
    )
    const inherited = budgetConstraint({
      ...base,
      limitState: "inherited",
      used: "0",
    })
    expect(formatBudgetConstraint(inherited, t, false)).toMatch(
      /^inherited · used: USD\s0$/,
    )
  })
})
