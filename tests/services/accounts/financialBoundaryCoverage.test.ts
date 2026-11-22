import { describe, expect, it } from "vitest"

import { CURRENCIES } from "~/constants/money"
import {
  accountAllowanceObservation,
  ALLOWANCE_IDENTITY_KINDS,
  parseAllowanceInstant,
} from "~/services/accounts/allowances"
import {
  accountBalanceScope,
  getAccountBalanceSnapshots,
} from "~/services/accounts/balanceSnapshot"
import {
  AccountUpdateUserTimestampMode,
  applySiteAccountUpdates,
  normalizeSiteAccount,
} from "~/services/accounts/editing/accountDefaults"
import { normalizeManualBalanceUsd } from "~/services/accounts/editing/accountFormValidation"
import { getSiteDayUsages } from "~/services/accounts/metrics/accountTodayStats"
import { acceptAccountAllowances } from "~/services/accounts/refresh/allowanceAcceptance"
import { observeAmount } from "~/services/amounts/balance"
import { budgetConstraint } from "~/services/amounts/budgets"
import {
  ASSET_KINDS,
  BALANCE_VALIDITY_KINDS,
  BUDGET_LIMIT_STATES,
  EVIDENCE_KINDS,
  FINANCIAL_ENUMERATION,
  FINANCIAL_SETTLEMENT_STATUSES,
} from "~/services/amounts/financialConstants"
import { isCumulativeIncome } from "~/services/amounts/income"
import {
  financialConsumptionFactSchema,
  isCumulativeConsumption,
} from "~/services/amounts/usage"
import { NEW_API_FINANCIAL_CONTRACT_VERSIONS } from "~/services/apiService/newApiFamily/financialContractVersions"
import { buildSiteAccount } from "~~/tests/test-utils/factories"
import {
  buildPeriodConsumption,
  buildPeriodIncome,
} from "~~/tests/test-utils/financialPeriod"

const scope = accountBalanceScope({
  baseUrl: "https://boundary.example",
  accountId: "native-account",
})
const source = {
  adapter: "fixture",
  operation: "account-state",
  contractVersion: "1",
  kind: EVIDENCE_KINDS.Reported,
} as const
const asset = { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD } as const

it("normalizes editor exponent syntax without rounding the original amount", () => {
  expect(normalizeManualBalanceUsd("1.0000000000000001e+0000")).toBe(
    "1.0000000000000001",
  )
  expect(normalizeManualBalanceUsd("1e-1000")).toBeUndefined()
})

it("invalidates omitted native daily facts when the account identity changes", () => {
  const account = buildSiteAccount()
  account.account_info.settledConsumption = [
    buildPeriodConsumption(account.id, "2"),
  ]
  account.account_info.reportedIncome = [buildPeriodIncome(account.id, "5")]
  const changed = applySiteAccountUpdates({
    account,
    updates: { site_url: "https://different.example" },
    now: Date.now(),
    userTimestampMode: AccountUpdateUserTimestampMode.Touch,
  })
  expect(changed.account_info.settledConsumption?.[0]?.amount).toMatchObject({
    status: "stale",
    value: "2",
  })
  expect(changed.account_info.reportedIncome?.[0]?.amount).toMatchObject({
    status: "stale",
    value: "5",
  })
})

it.each([
  NEW_API_FINANCIAL_CONTRACT_VERSIONS.StandardUsd,
  NEW_API_FINANCIAL_CONTRACT_VERSIONS.NativeQuota,
])(
  "recognizes archived cumulative report provenance for %s",
  (contractVersion) => {
    const usage = {
      asset,
      scope,
      window: { start: 100, end: 200, timeZone: "UTC" },
      settlement: "settled" as const,
      coverage: "complete" as const,
      amount: observeAmount(
        "2",
        { ...source, contractVersion, operation: "/api/log/self/stat:quota" },
        200,
      ),
    }
    expect(isCumulativeConsumption(usage)).toBe(true)
    expect(
      isCumulativeConsumption({
        ...usage,
        amount: observeAmount(
          "2",
          { ...source, contractVersion, operation: "balance" },
          200,
        ),
      }),
    ).toBe(false)
    expect(
      isCumulativeIncome({
        ...usage,
        classification: "unclassified",
        amount: observeAmount(
          "2",
          { ...source, contractVersion, operation: "logs:credited-quota" },
          200,
        ),
      }),
    ).toBe(true)
  },
)
const entry = () => ({
  id: "plan",
  identityKind: ALLOWANCE_IDENTITY_KINDS.Upstream,
  collectionKey: "plans",
  validity: { kind: BALANCE_VALIDITY_KINDS.Unknown } as const,
  constraint: budgetConstraint({
    source,
    scope,
    observedAt: 100,
    asset,
    limitState: BUDGET_LIMIT_STATES.Finite,
    remaining: 4,
  }),
})

describe("native financial input boundaries", () => {
  it("builds the same financial scope for a bare hostname and its normalized HTTPS URL", () => {
    expect(
      accountBalanceScope({
        baseUrl: "boundary.example/account",
        accountId: "native-account",
      }),
    ).toEqual(scope)
    expect(
      accountBalanceScope({ baseUrl: "", accountId: "native-account" })
        .authority,
    ).toBe("legacy:unknown-authority")
  })

  it("keeps a newly reported numeric allowance when an older plan was unlimited", () => {
    const old = entry()
    old.constraint = budgetConstraint({
      scope,
      source,
      observedAt: 100,
      asset,
      limitState: BUDGET_LIMIT_STATES.Unlimited,
    })
    const next = entry()
    next.constraint = budgetConstraint({
      scope,
      source,
      observedAt: 200,
      asset,
      limitState: BUDGET_LIMIT_STATES.Unknown,
      remaining: 7,
    })
    const snapshot = (plan: typeof old, capturedAt: number) =>
      accountAllowanceObservation(
        scope,
        [
          {
            source,
            collectionKey: "plans",
            enumeration: FINANCIAL_ENUMERATION.Complete,
            entries: [plan],
          },
        ],
        capturedAt,
      ).allowances
    const accepted = acceptAccountAllowances(
      snapshot(old, 100),
      snapshot(next, 200),
      undefined,
      "native-account",
      true,
      200,
    )
    expect(accepted?.entries[0]?.constraint).toMatchObject({
      limitState: "unknown",
      remaining: { status: "known", value: "7", observedAt: 200 },
    })
  })

  it("rejects duplicate plan observations rather than double-counting the allowance", () => {
    const plan = entry()
    expect(() =>
      accountAllowanceObservation(
        scope,
        [
          {
            source,
            collectionKey: "plans",
            enumeration: FINANCIAL_ENUMERATION.Complete,
            entries: [plan, plan],
          },
        ],
        100,
      ),
    ).toThrow("Duplicate allowance identity")
  })

  it("rejects an allowance for a different saved account", () => {
    const plan = entry()
    plan.constraint.scope.subject = { kind: "account", accountId: "other" }
    expect(() =>
      accountAllowanceObservation(
        scope,
        [
          {
            source,
            collectionKey: "plans",
            enumeration: FINANCIAL_ENUMERATION.Complete,
            entries: [plan],
          },
        ],
        100,
      ),
    ).toThrow("Mismatched allowance subject")
  })

  it("keeps an absent allowance collection distinct from a complete empty collection", () => {
    expect(
      accountAllowanceObservation(scope, [], 100).allowances.coverage,
    ).toBe("unknown")
    expect(
      accountAllowanceObservation(
        scope,
        [
          {
            source,
            collectionKey: "plans",
            enumeration: FINANCIAL_ENUMERATION.Complete,
            entries: [],
          },
        ],
        100,
      ).allowances.coverage,
    ).toBe("complete")
  })

  it.each(["not-a-dateZ", "2026-11-22T12:00:00", "", null])(
    "keeps an invalid or zone-less expiry as evidence instead of inventing an instant (%s)",
    (date) => expect(parseAllowanceInstant(date)).toBeUndefined(),
  )

  it("restores valid legacy components and preserves unlimited plans without inventing a finite balance", () => {
    const account = buildSiteAccount({ last_sync_time: 100 })
    delete account.account_info.balance
    account.account_info.nativeBalance = {
      unit: "USD",
      total: 35,
      components: [
        null,
        {
          kind: "permanent",
          amount: 15,
          unlockedModels: ["model-a", 42, "model-b"],
        },
        { kind: "subscription", amount: 20, name: "Plan", unlimited: true },
      ],
    } as any
    const restored = getAccountBalanceSnapshots(account).reported.positions
    expect(restored).toContainEqual(
      expect.objectContaining({
        label: "model-a, model-b",
        amount: expect.objectContaining({ value: "15", status: "stale" }),
      }),
    )
    expect(restored).toContainEqual(
      expect.objectContaining({
        label: "Plan · ∞",
        amount: expect.objectContaining({
          status: "unsupported",
          reason: "legacy-unlimited",
        }),
      }),
    )
    expect(
      restored.filter((position) =>
        position.id.startsWith("legacy-component:"),
      ),
    ).toHaveLength(2)
  })

  it.each([null, [], 17])(
    "rejects an invalid usage observation during account normalization (%j)",
    (usage) => {
      const account = buildSiteAccount()
      account.account_info.usageObservations = [usage] as any
      expect(() => normalizeSiteAccount(account)).toThrow(
        "invalid_account_usage_observation",
      )
    },
  )

  it.each([
    { start: 100, end: 200, timeZone: "Mars/Olympus" },
    { start: 200, end: 100, timeZone: "UTC" },
  ])(
    "keeps a malformed provider interval out of the daily readings (%j)",
    (window) => {
      const fact = {
        asset,
        scope,
        amount: observeAmount("4", source, 200),
        window,
        settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
        coverage: "complete" as const,
      }
      expect(financialConsumptionFactSchema.safeParse(fact).success).toBe(false)
      expect(getSiteDayUsages({ settledConsumption: [fact] }, 200)).toEqual([])
    },
  )
})
