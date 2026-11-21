import { describe, expect, it } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { balancePosition, observeAmount } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  BALANCE_NATURES,
  BALANCE_ROLES,
  BALANCE_VALIDITY_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SETTLEMENT_STATUSES,
  FINANCIAL_SUBJECT_KINDS,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import type { FinancialConsumptionFact } from "~/services/amounts/usage"
import { estimateNetInflow } from "~/services/history/dailyBalanceHistory/netInflow"

const scope = {
  subject: {
    kind: FINANCIAL_SUBJECT_KINDS.Account,
    accountId: "account",
  } as const,
  authority: "https://wallet.example",
  walletId: "main",
  projects: { kind: SCOPE_SELECTION_KINDS.All } as const,
  keys: { kind: SCOPE_SELECTION_KINDS.All } as const,
  models: { kind: SCOPE_SELECTION_KINDS.All } as const,
  groups: { kind: SCOPE_SELECTION_KINDS.All } as const,
}
const source = {
  adapter: "fixture",
  operation: "wallet",
  contractVersion: "2",
  kind: EVIDENCE_KINDS.Reported,
} as const
const startAt = Date.UTC(2026, 4, 23),
  endAt = startAt + 3_600_000
const position = (value: string, observedAt: number) =>
  balancePosition({
    id: "ledger",
    role: BALANCE_ROLES.Ledger,
    nature: BALANCE_NATURES.Prepaid,
    scope,
    source,
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
    value,
    observedAt,
    validity: { kind: BALANCE_VALIDITY_KINDS.NoExpiry },
  })
const consumption = (value: string): FinancialConsumptionFact => ({
  asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
  amount: observeAmount(
    value,
    { ...source, operation: "settled-usage" },
    endAt,
  ),
  scope,
  window: { start: startAt, end: endAt, timeZone: "UTC" },
  settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
  coverage: FINANCIAL_COVERAGE.Complete,
})

describe("net inflow estimation", () => {
  it("subtracts a full-length native balance without requiring an out-of-range negative operand", () => {
    const magnitude = "9".repeat(256)
    expect(
      estimateNetInflow({
        start: position(magnitude, startAt),
        end: position(magnitude, endAt),
        consumption: [consumption("0")],
      }),
    ).toMatchObject({
      status: "available",
      amount: { asset: { kind: "currency", code: "USD" }, value: "0" },
    })
  })

  it("keeps a bounded final estimate when its balance difference exceeds the decimal bound", () => {
    const magnitude = "9".repeat(255)
    expect(
      estimateNetInflow({
        start: position(magnitude, startAt),
        end: position(`-${magnitude}`, endAt),
        consumption: [consumption(magnitude)],
      }),
    ).toMatchObject({
      status: "available",
      amount: {
        asset: { kind: "currency", code: "USD" },
        value: `-${magnitude}`,
      },
    })
  })

  it("keeps a negative unexplained balance change instead of calling it invalid income", () => {
    expect(
      estimateNetInflow({
        start: position("70", startAt),
        end: position("65", endAt),
        consumption: [consumption("0")],
      }),
    ).toMatchObject({
      status: "available",
      amount: { asset: { kind: "currency", code: "USD" }, value: "-5" },
      classification: "unclassified-net-change",
      window: { start: startAt, end: endAt, timeZone: "UTC" },
    })
  })
})

it.each([
  [
    "available is not a reversible ledger",
    (start: ReturnType<typeof position>, end: ReturnType<typeof position>) => {
      start.role = BALANCE_ROLES.Available
      end.role = BALANCE_ROLES.Available
    },
  ],
  [
    "asset switch",
    (_start: ReturnType<typeof position>, end: ReturnType<typeof position>) => {
      end.asset = { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY }
    },
  ],
  [
    "source switch",
    (_start: ReturnType<typeof position>, end: ReturnType<typeof position>) => {
      end.amount.source.operation = "inference"
    },
  ],
  [
    "semantic version switch",
    (_start: ReturnType<typeof position>, end: ReturnType<typeof position>) => {
      end.amount.source.contractVersion = "3"
    },
  ],
  [
    "wallet switch",
    (_start: ReturnType<typeof position>, end: ReturnType<typeof position>) => {
      end.scope.walletId = "other"
    },
  ],
  [
    "manual source",
    (start: ReturnType<typeof position>) => {
      start.amount.source.kind = EVIDENCE_KINDS.Manual
    },
  ],
  [
    "legacy source",
    (start: ReturnType<typeof position>) => {
      start.amount.source.kind = EVIDENCE_KINDS.Legacy
    },
  ],
  [
    "unknown restrictions",
    (start: ReturnType<typeof position>, end: ReturnType<typeof position>) => {
      start.scope.models = { kind: "unknown" }
      end.scope.models = { kind: "unknown" }
    },
  ],
])("refuses %s", (_label, change) => {
  const start = structuredClone(position("100", startAt))
  const end = structuredClone(position("70", endAt))
  change(start, end)
  expect(
    estimateNetInflow({ start, end, consumption: [consumption("30")] }).status,
  ).toBe("unavailable")
})

it.each([
  [
    "pending settlement",
    (fact: FinancialConsumptionFact) => {
      fact.settlement = FINANCIAL_SETTLEMENT_STATUSES.Pending
    },
  ],
  [
    "unknown coverage",
    (fact: FinancialConsumptionFact) => {
      fact.coverage = FINANCIAL_COVERAGE.Unknown
    },
  ],
  [
    "wrong consumption asset",
    (fact: FinancialConsumptionFact) => {
      fact.asset = { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY }
    },
  ],
  [
    "credential scoped consumption",
    (fact: FinancialConsumptionFact) => {
      fact.scope.subject = {
        kind: FINANCIAL_SUBJECT_KINDS.Credential,
        profileId: "key",
      }
    },
  ],
  [
    "different wallet source",
    (fact: FinancialConsumptionFact) => {
      fact.amount.source.adapter = "other"
    },
  ],
  [
    "materially late interval start",
    (fact: FinancialConsumptionFact) => {
      fact.window.start += 20 * 60_000
    },
  ],
  [
    "late interval end",
    (fact: FinancialConsumptionFact) => {
      fact.window.end += 1
    },
  ],
  [
    "invalid timezone",
    (fact: FinancialConsumptionFact) => {
      fact.window.timeZone = "invalid"
    },
  ],
])("refuses %s", (_label, change) => {
  const fact = structuredClone(consumption("30"))
  change(fact)
  expect(
    estimateNetInflow({
      start: position("100", startAt),
      end: position("70", endAt),
      consumption: [fact],
    }).status,
  ).toBe("unavailable")
})

it("accepts small gaps and unordered intervals but rejects overlap and timezone changes", () => {
  const first = consumption("20")
  const second = consumption("10")
  first.window.end = startAt + 1_800_000
  second.window.start = first.window.end
  const estimate = (facts: FinancialConsumptionFact[]) =>
    estimateNetInflow({
      start: position("100", startAt),
      end: position("70", endAt),
      consumption: facts,
    })
  expect(estimate([second, first])).toMatchObject({
    status: "available",
    amount: { value: "0" },
  })
  expect(estimate([first, first, second]).status).toBe("unavailable")
  second.window.start += 1
  expect(estimate([first, second]).status).toBe("available")
  second.window.start -= 1
  second.window.timeZone = "Asia/Shanghai"
  expect(estimate([first, second]).status).toBe("unavailable")
})

it("treats scope restrictions as sets and preserves decimal precision", () => {
  const start = structuredClone(
    position("9007199254740993.1234567890123456789", startAt),
  )
  const end = structuredClone(
    position("9007199254740993.1234567890123456788", endAt),
  )
  const fact = structuredClone(consumption("0.0000000000000000001"))
  start.scope.models = {
    kind: SCOPE_SELECTION_KINDS.Restricted,
    ids: ["a", "b"],
  }
  end.scope.models = {
    kind: SCOPE_SELECTION_KINDS.Restricted,
    ids: ["b", "a", "a"],
  }
  fact.scope.models = {
    kind: SCOPE_SELECTION_KINDS.Restricted,
    ids: ["b", "a"],
  }
  expect(estimateNetInflow({ start, end, consumption: [fact] })).toMatchObject({
    status: "available",
    amount: { value: "0" },
  })
})

it("selects consumption for the matching wallet and asset without rejecting independent wallets", () => {
  const unrelated = structuredClone(consumption("99"))
  unrelated.scope.walletId = "other"
  expect(
    estimateNetInflow({
      start: position("100", startAt),
      end: position("70", endAt),
      consumption: [unrelated, consumption("30")],
    }),
  ).toMatchObject({ status: "available", amount: { value: "0" } })
})

it("does not classify an expiry or reset boundary as a net inflow", () => {
  const start = position("100", startAt)
  const end = position("70", endAt)
  start.validity = end.validity = {
    kind: BALANCE_VALIDITY_KINDS.Expires,
    at: startAt + 1000,
  }
  expect(
    estimateNetInflow({ start, end, consumption: [consumption("30")] }).status,
  ).toBe("unavailable")
  start.validity = end.validity = { kind: BALANCE_VALIDITY_KINDS.NoExpiry }
  start.window = end.window = {
    start: startAt,
    end: endAt + 1000,
    timeZone: "UTC",
    resetsAt: startAt + 1000,
  }
  expect(
    estimateNetInflow({ start, end, consumption: [consumption("30")] }).status,
  ).toBe("unavailable")
})

it("rejects consumption observed before its settled interval ended", () => {
  const fact = consumption("30")
  if (fact.amount.status === OBSERVATION_STATUSES.Known)
    fact.amount.observedAt = startAt
  expect(
    estimateNetInflow({
      start: position("100", startAt),
      end: position("70", endAt),
      consumption: [fact],
    }).status,
  ).toBe("unavailable")
})
