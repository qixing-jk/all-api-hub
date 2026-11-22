import { describe, expect, it } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { accountPresentation } from "~/services/accounts/accountStorage/accountPresentation"
import {
  accountBalanceSnapshot,
  readAccountBalance,
} from "~/services/accounts/balanceSnapshot"
import {
  aggregateBalances,
  BALANCE_PURPOSES,
  getDisplayBalancePortfolio,
  projectBalance,
} from "~/services/accounts/metrics/balanceProjection"
import { balancePosition } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  BALANCE_NATURES,
  BALANCE_RELATIONS,
  BALANCE_ROLES,
  BALANCE_VALIDITY_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_OBSERVATION_REASONS,
  FINANCIAL_SUBJECT_KINDS,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import { calculateTotalBalance } from "~/utils/core/formatters"
import {
  buildDisplaySiteData,
  buildSiteAccount,
} from "~~/tests/test-utils/factories"

const scope = {
  subject: { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId: "one" } as const,
  authority: "https://wallet.example",
  organizationId: "org-1",
  walletId: "main",
  models: { kind: SCOPE_SELECTION_KINDS.All } as const,
  groups: { kind: SCOPE_SELECTION_KINDS.All } as const,
  keys: { kind: SCOPE_SELECTION_KINDS.All } as const,
  projects: { kind: SCOPE_SELECTION_KINDS.All } as const,
}
const source = {
  adapter: "fixture",
  operation: "wallet",
  contractVersion: "1",
  kind: EVIDENCE_KINDS.Reported,
} as const
const position = (id: string, value: string) =>
  balancePosition({
    id,
    value,
    scope,
    source,
    observedAt: 100,
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
    nature: BALANCE_NATURES.Prepaid,
    validity: { kind: BALANCE_VALIDITY_KINDS.NoExpiry },
  })

describe("purpose-specific balance projection", () => {
  it("keeps the native balance when the converted subtotal exceeds decimal bounds", () => {
    const value = "9".repeat(256)
    const display = buildDisplaySiteData({
      id: "one",
      exchangeRate: 7,
      balanceSnapshot: accountBalanceSnapshot(
        scope,
        [position("available", value)],
        100,
        "complete",
      ),
    })
    const portfolio = getDisplayBalancePortfolio([display])
    expect(portfolio.amounts).toEqual([
      { asset: { kind: "currency", code: "USD" }, value },
    ])
    expect(portfolio.convertedCurrencyTotals.CNY).toBeUndefined()
  })

  it("reports every excluded account behind a conflicting shared-wallet subtotal", () => {
    const first = buildDisplaySiteData({
      id: "one",
      balanceSnapshot: accountBalanceSnapshot(
        scope,
        [position("available", "20")],
        100,
        "complete",
      ),
    })
    const secondScope = {
      ...scope,
      subject: { kind: "account" as const, accountId: "two" },
    }
    const second = buildDisplaySiteData({
      id: "two",
      balanceSnapshot: accountBalanceSnapshot(
        secondScope,
        [{ ...position("available", "30"), scope: secondScope }],
        100,
        "complete",
      ),
    })
    const portfolio = getDisplayBalancePortfolio([first, second])
    expect(portfolio.amounts).toEqual([])
    expect(portfolio.excludedAccounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: "one",
          reasons: expect.arrayContaining(["conflict"]),
        }),
        expect.objectContaining({
          accountId: "two",
          reasons: expect.arrayContaining(["conflict"]),
        }),
      ]),
    )
  })
  it.each([BALANCE_PURPOSES.Available, BALANCE_PURPOSES.Prepaid])(
    "does not revive an older wallet amount after the newest observation expires (%s)",
    (purpose) => {
      const newerScope = {
        ...scope,
        subject: {
          kind: FINANCIAL_SUBJECT_KINDS.Account,
          accountId: "two",
        } as const,
      }
      const older = accountBalanceSnapshot(
        scope,
        [position("available", "20")],
        100,
        FINANCIAL_COVERAGE.Complete,
      )
      const newer = accountBalanceSnapshot(
        newerScope,
        [
          {
            ...balancePosition({
              ...position("available", "30"),
              value: "30",
              scope: newerScope,
              source,
              observedAt: 200,
            }),
            validity: { kind: BALANCE_VALIDITY_KINDS.Expires, at: 250 },
          },
        ],
        200,
        FINANCIAL_COVERAGE.Complete,
      )
      for (const snapshots of [
        [older, newer],
        [newer, older],
      ]) {
        expect(aggregateBalances(snapshots, purpose, 300)).toMatchObject({
          amounts: [],
          includedCount: 0,
          coverage: "partial",
        })
      }
      expect(newer.positions[0]?.amount).toMatchObject({
        value: "30",
        observedAt: 200,
      })
    },
  )
  it("offers combined display totals for convertible currencies without altering native asset totals", () => {
    const sites = [
      { id: "usd", code: CURRENCIES.USD, value: "2", rate: 8 },
      { id: "yuan", code: CURRENCIES.CNY, value: "7", rate: 7 },
    ].map(({ id, code, value, rate }) => {
      const nativeScope = {
        ...scope,
        subject: {
          kind: FINANCIAL_SUBJECT_KINDS.Account,
          accountId: id,
        } as const,
        walletId: id,
      }
      return buildDisplaySiteData({
        id,
        exchangeRate: rate,
        balanceSnapshot: accountBalanceSnapshot(
          nativeScope,
          [
            {
              ...position("available", value),
              scope: nativeScope,
              asset: { kind: ASSET_KINDS.Currency, code },
            },
          ],
          100,
          FINANCIAL_COVERAGE.Complete,
        ),
      })
    })
    const total = getDisplayBalancePortfolio(
      sites,
      BALANCE_PURPOSES.Available,
      100,
    )
    expect(total.convertedCurrencyTotals).toEqual({ USD: "3", CNY: "23" })
    expect(total.amounts).toHaveLength(2)
    expect(total.amounts).toEqual(
      expect.arrayContaining([
        { asset: { kind: ASSET_KINDS.Currency, code: "USD" }, value: "2" },
        { asset: { kind: ASSET_KINDS.Currency, code: "CNY" }, value: "7" },
      ]),
    )
  })
  it("keeps native yuan totals and computes their display dollars at each account's rate", () => {
    const sites = [
      { id: "a", rate: 7 },
      { id: "b", rate: 14 },
    ].map(({ id, rate }) => {
      const nativeScope = {
        ...scope,
        subject: {
          kind: FINANCIAL_SUBJECT_KINDS.Account,
          accountId: id,
        } as const,
        walletId: id,
      }
      const balance = {
        ...position("available", "7"),
        scope: nativeScope,
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY } as const,
      }
      return buildDisplaySiteData({
        id,
        exchangeRate: rate,
        balanceSnapshot: accountBalanceSnapshot(
          nativeScope,
          [balance],
          100,
          FINANCIAL_COVERAGE.Complete,
        ),
      })
    })
    expect(
      getDisplayBalancePortfolio(sites, BALANCE_PURPOSES.Available, 100),
    ).toMatchObject({
      amounts: [
        { asset: { kind: ASSET_KINDS.Currency, code: "CNY" }, value: "14" },
      ],
      cnyInUsd: "1.5",
    })
  })
  it("stops counting a known balance at its reset while retaining the original card and history fact", () => {
    const resetting = {
      ...position("available", "10"),
      window: { start: 0, end: 300, resetsAt: 200, timeZone: "UTC" },
    }
    const snapshot = accountBalanceSnapshot(
      scope,
      [resetting],
      100,
      FINANCIAL_COVERAGE.Complete,
    )
    const before = structuredClone(snapshot)
    const site = buildDisplaySiteData({ id: "one", balanceSnapshot: snapshot })
    expect(
      getDisplayBalancePortfolio([site], BALANCE_PURPOSES.Available, 199),
    ).toMatchObject({
      amounts: [{ value: "10", asset: { kind: "currency", code: "USD" } }],
      includedCount: 1,
    })
    expect(
      getDisplayBalancePortfolio([site], BALANCE_PURPOSES.Available, 200),
    ).toMatchObject({ amounts: [], includedCount: 0 })
    for (const purpose of ["available", "prepaid"] as const) {
      expect(projectBalance(snapshot, purpose, 200)).toMatchObject({
        amounts: [],
        excluded: [{ reason: "validity" }],
      })
    }
    expect(
      readAccountBalance({ balance: snapshot }, scope, 200).positions,
    ).toEqual([resetting])
    expect(snapshot).toEqual(before)
  })
  it("keeps the last observed balance in a partial overview without reviving an expired balance", () => {
    const known = position("available", "20")
    const stale = {
      ...known,
      amount: {
        ...known.amount,
        status: "stale" as const,
        value: "20",
        observedAt: 100,
        reason: "refresh failed",
      },
    }
    const display = (funds: typeof stale) =>
      buildDisplaySiteData({
        id: "one",
        balanceSnapshot: accountBalanceSnapshot(scope, [funds], 180, "partial"),
        exchangeRate: 6.5,
      })
    expect(
      getDisplayBalancePortfolio([display(stale)], "available", 200),
    ).toMatchObject({
      amounts: [{ asset: { kind: "currency", code: "USD" }, value: "20" }],
      lastKnownCount: 1,
      coverage: "partial",
      usdInCny: "130",
    })
    const expired = display({
      ...stale,
      validity: { kind: BALANCE_VALIDITY_KINDS.Expires, at: 190 },
    })
    expect(
      getDisplayBalancePortfolio([expired], "available", 200).amounts,
    ).toEqual([])
  })
  it("keeps a known balance past its observation boundary while ending stale-window contributions", () => {
    const known = {
      ...position("available", "10"),
      window: { start: 0, end: 200, timeZone: "UTC" },
    }
    const stale = {
      ...known,
      amount: {
        ...known.amount,
        status: "stale" as const,
        value: "10",
        observedAt: 100,
        reason: FINANCIAL_OBSERVATION_REASONS.RefreshFailed,
      },
    }
    const display = (funds: typeof known | typeof stale) =>
      buildDisplaySiteData({
        id: "one",
        balanceSnapshot: accountBalanceSnapshot(
          scope,
          [funds],
          100,
          FINANCIAL_COVERAGE.Complete,
        ),
      })
    expect(
      getDisplayBalancePortfolio(
        [display(known)],
        BALANCE_PURPOSES.Available,
        200,
      ).amounts,
    ).toEqual([{ value: "10", asset: { kind: "currency", code: "USD" } }])
    expect(
      getDisplayBalancePortfolio(
        [display(stale)],
        BALANCE_PURPOSES.Available,
        200,
      ).amounts,
    ).toEqual([])
  })
  it("retains the last saved standard USD balance separately from spendable money", () => {
    const balanceSnapshot = readAccountBalance({ quota: 5_000_000 }, scope, 100)
    const site = buildDisplaySiteData({
      id: "one",
      balanceSnapshot,
      exchangeRate: 6.5,
    })
    expect(getDisplayBalancePortfolio([site])).toMatchObject({
      amounts: [],
      referenceUsd: { USD: "10", CNY: "65" },
    })
  })
  it("retains route-restricted funds for details while excluding them from the unrestricted portfolio", () => {
    const routedScope = {
      ...scope,
      routes: { kind: SCOPE_SELECTION_KINDS.Restricted, ids: ["/anthropic/"] },
    }
    const funds = { ...position("available", "20"), scope: routedScope }
    const snapshot = accountBalanceSnapshot(
      routedScope,
      [funds],
      100,
      FINANCIAL_COVERAGE.Complete,
    )
    expect(
      readAccountBalance({ balance: snapshot }, routedScope, 100).positions[0]
        ?.scope,
    ).toMatchObject({
      routes: { kind: "restricted", ids: ["/anthropic/"] },
    })
    expect(projectBalance(snapshot, BALANCE_PURPOSES.Prepaid)).toMatchObject({
      amounts: [],
      excluded: [{ reason: "restricted" }],
    })
  })
  it("keeps identical wallet IDs in different upstream workspaces separate", () => {
    const snapshots = ["workspace-a", "workspace-b"].map((workspaceId) => {
      const workspaceScope = { ...scope, workspaceId }
      return accountBalanceSnapshot(
        workspaceScope,
        [{ ...position("available", "20"), scope: workspaceScope }],
        100,
        FINANCIAL_COVERAGE.Complete,
      )
    })
    expect(
      aggregateBalances(snapshots, BALANCE_PURPOSES.Prepaid),
    ).toMatchObject({
      amounts: [{ value: "40", asset: { kind: "currency", code: "USD" } }],
      duplicateCount: 0,
      coverage: "complete",
    })
  })
  it("reports overflowing native portfolio totals without turning them into zero or throwing", () => {
    const value = "9".repeat(256)
    const a = position("a", value),
      b = position("b", value)
    b.scope = { ...scope, walletId: "other" }
    for (const entry of [a, b]) {
      expect(
        projectBalance(
          accountBalanceSnapshot(scope, [entry], 100, "complete"),
          BALANCE_PURPOSES.Prepaid,
        ),
      ).toMatchObject({
        amounts: [{ value, asset: entry.asset }],
        coverage: "complete",
      })
    }
    const snapshot = accountBalanceSnapshot(
      scope,
      [a, b],
      100,
      FINANCIAL_COVERAGE.Complete,
    )
    expect(projectBalance(snapshot, BALANCE_PURPOSES.Prepaid)).toMatchObject({
      amounts: [],
      coverage: "partial",
    })
    expect(
      aggregateBalances(
        [
          accountBalanceSnapshot(scope, [a], 100, "complete"),
          accountBalanceSnapshot(scope, [b], 100, "complete"),
        ],
        BALANCE_PURPOSES.Prepaid,
      ),
    ).toMatchObject({ amounts: [], includedCount: 0, coverage: "partial" })
  })
  it("does not produce a sort amount from two active source contracts for one local wallet", () => {
    const first = position("available", "20")
    const second = position("available", "30")
    second.amount.source = { ...source, operation: "inference" }
    const snapshot = accountBalanceSnapshot(
      scope,
      [first, second],
      100,
      FINANCIAL_COVERAGE.Complete,
    )
    expect(projectBalance(snapshot, BALANCE_PURPOSES.Available)).toMatchObject({
      amounts: [],
      coverage: "partial",
    })
  })
  it.each([
    scope,
    { ...scope, walletId: undefined, organizationId: undefined },
  ])(
    "does not treat ledger and available fields from independent sources as interchangeable: %j",
    (identity) => {
      const ledger = {
        ...position("ledger", "20"),
        scope: identity,
        role: BALANCE_ROLES.Ledger,
      }
      const available = { ...position("available", "30"), scope: identity }
      available.amount.source = { ...source, operation: "inference" }
      const snapshot = accountBalanceSnapshot(
        identity,
        [ledger, available],
        100,
        FINANCIAL_COVERAGE.Complete,
      )
      expect(
        projectBalance(snapshot, BALANCE_PURPOSES.Prepaid).positions,
      ).toHaveLength(0)
      expect(
        aggregateBalances([snapshot], BALANCE_PURPOSES.Prepaid),
      ).toMatchObject({
        amounts: [],
        coverage: "partial",
        conflictCount: 1,
      })
    },
  )
  it("distinguishes unknown prepaid eligibility from confirmed non-prepaid exclusions", () => {
    for (const nature of ["unknown", "mixed"] as const) {
      const snapshot = accountBalanceSnapshot(
        scope,
        [{ ...position("funds", "20"), nature }],
        100,
        FINANCIAL_COVERAGE.Complete,
      )
      expect(projectBalance(snapshot, BALANCE_PURPOSES.Prepaid)).toMatchObject({
        amounts: [],
        coverage: "partial",
        excluded: [{ reason: "nature" }],
      })
    }
    for (const nature of ["subscription", "credit"] as const) {
      const snapshot = accountBalanceSnapshot(
        scope,
        [{ ...position("funds", "20"), nature }],
        100,
        FINANCIAL_COVERAGE.Complete,
      )
      expect(projectBalance(snapshot, BALANCE_PURPOSES.Prepaid)).toMatchObject({
        amounts: [],
        coverage: "complete",
        excluded: [{ reason: "nature" }],
      })
    }
  })
  it("only warns about possible duplicates across accounts sharing an asset and authority", () => {
    const unidentifiedScope = {
      ...scope,
      walletId: undefined,
      organizationId: undefined,
    }
    const cash = { ...position("cash", "20"), scope: unidentifiedScope }
    const nano = {
      ...position("nano", "2"),
      scope: unidentifiedScope,
      asset: { kind: ASSET_KINDS.Crypto, id: "XNO" as const },
    }
    const single = accountBalanceSnapshot(
      unidentifiedScope,
      [cash, nano],
      100,
      FINANCIAL_COVERAGE.Complete,
    )
    expect(aggregateBalances([single], BALANCE_PURPOSES.Prepaid)).toMatchObject(
      {
        potentialDuplicateCount: 0,
        coverage: "complete",
      },
    )
    const secondScope = {
      ...unidentifiedScope,
      subject: { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId: "two" },
    }
    const second = accountBalanceSnapshot(
      secondScope,
      [{ ...cash, scope: secondScope }],
      100,
      FINANCIAL_COVERAGE.Complete,
    )
    expect(
      aggregateBalances([single, second], BALANCE_PURPOSES.Prepaid),
    ).toMatchObject({
      potentialDuplicateCount: 1,
      coverage: "partial",
    })
    const known = accountBalanceSnapshot(
      scope,
      [position("cash", "30")],
      100,
      FINANCIAL_COVERAGE.Complete,
    )
    expect(
      aggregateBalances([known, second], BALANCE_PURPOSES.Prepaid),
    ).toMatchObject({
      potentialDuplicateCount: 1,
      coverage: "partial",
    })
  })
  it("stops counting an allowance at its expiry while retaining the original card and history fact", () => {
    const expiring = {
      ...position("allowance", "10"),
      validity: { kind: BALANCE_VALIDITY_KINDS.Expires, at: 200 },
    }
    const snapshot = accountBalanceSnapshot(
      scope,
      [expiring],
      100,
      FINANCIAL_COVERAGE.Complete,
    )
    expect(
      projectBalance(snapshot, BALANCE_PURPOSES.Available, 199).amounts,
    ).toEqual([{ value: "10", asset: { kind: "currency", code: "USD" } }])
    expect(
      projectBalance(snapshot, BALANCE_PURPOSES.Available, 200),
    ).toMatchObject({
      amounts: [],
      excluded: [{ reason: "validity" }],
    })
    expect(
      readAccountBalance({ balance: snapshot }, scope, 200).positions,
    ).toEqual([expiring])
  })
  it("uses the newest comparable wallet observation regardless of account ordering and excludes source conflicts", () => {
    const older = accountBalanceSnapshot(
      scope,
      [position("available", "20")],
      100,
      FINANCIAL_COVERAGE.Complete,
    )
    const newScope = {
      ...scope,
      subject: { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId: "two" },
    }
    const newerPosition = balancePosition({
      ...position("available", "30"),
      scope: newScope,
      value: "30",
      source,
      observedAt: 200,
    })
    const newer = accountBalanceSnapshot(
      newScope,
      [newerPosition],
      200,
      FINANCIAL_COVERAGE.Complete,
    )
    for (const snapshots of [
      [older, newer],
      [newer, older],
    ]) {
      expect(
        aggregateBalances(snapshots, BALANCE_PURPOSES.Prepaid),
      ).toMatchObject({
        amounts: [{ value: "30" }],
        duplicateCount: 1,
        includedCount: 1,
      })
    }
    const otherSource = accountBalanceSnapshot(
      newScope,
      [
        {
          ...newerPosition,
          amount: {
            ...newerPosition.amount,
            source: { ...source, operation: "inference" },
          },
        },
      ],
      200,
      FINANCIAL_COVERAGE.Complete,
    )
    for (const snapshots of [
      [older, otherSource],
      [otherSource, older],
    ]) {
      expect(
        aggregateBalances(snapshots, BALANCE_PURPOSES.Prepaid),
      ).toMatchObject({
        amounts: [],
        coverage: "partial",
        conflicts: [
          expect.objectContaining({ reason: "incomparable-observations" }),
        ],
      })
    }
  })
  it("routes public totals through canonical facts and reports coverage instead of absorbing stale DTO money", () => {
    const original = buildSiteAccount({ id: "one" })
    original.account_info.balance = accountBalanceSnapshot(
      scope,
      [position("available", "20")],
      100,
      FINANCIAL_COVERAGE.Complete,
    )
    original.account_info.quota = 999000000
    const display = accountPresentation.convertToDisplayData(original)
    const totals = calculateTotalBalance([display])
    expect(totals.USD).toBe(20)
    expect(totals.portfolio).toMatchObject({
      includedCount: 1,
      eligibleCount: 1,
      amounts: [{ value: "20", asset: { kind: "currency", code: "USD" } }],
    })
  })
  it("keeps manual selection independent from reported facts and saved exclusion preferences", () => {
    const original = buildSiteAccount({
      id: "one",
      manualBalanceUsd: "99",
      excludeFromTotalBalance: false,
    })
    original.account_info.balance = accountBalanceSnapshot(
      scope,
      [position("available", "20")],
      100,
      FINANCIAL_COVERAGE.Complete,
    )
    const display = accountPresentation.convertToDisplayData(original)
    expect(display.balanceSnapshot?.positions[0]?.amount).toMatchObject({
      value: "20",
    })
    expect(display.manualBalanceSnapshot?.positions[0]?.amount).toMatchObject({
      value: "99",
      source: { kind: "manual" },
    })
    expect(display.excludeFromTotalBalance).toBe(false)
  })
  it("counts disjoint prepaid funds once and exposes exclusions without suppressing card history", () => {
    const snapshot = accountBalanceSnapshot(
      scope,
      [
        position("total", "120"),
        {
          ...position("pool", "100"),
          parentId: "total",
          relation: BALANCE_RELATIONS.Component,
        },
        {
          ...position("key", "20"),
          parentId: "total",
          relation: BALANCE_RELATIONS.Allocation,
        },
        {
          ...position("subscription", "50"),
          nature: BALANCE_NATURES.Subscription,
          validity: { kind: BALANCE_VALIDITY_KINDS.Expires, at: 200 },
        },
        {
          ...position("unknown", "10"),
          scope: { ...scope, models: { kind: SCOPE_SELECTION_KINDS.Unknown } },
        },
      ],
      100,
      FINANCIAL_COVERAGE.Complete,
    )
    expect(projectBalance(snapshot, BALANCE_PURPOSES.Prepaid).amounts).toEqual([
      { value: "120", asset: { kind: "currency", code: "USD" } },
    ])
    expect(
      readAccountBalance({ balance: snapshot }, scope, 100).positions,
    ).toHaveLength(5)
    expect(
      projectBalance(snapshot, BALANCE_PURPOSES.Prepaid).excluded.map(
        (e) => e.reason,
      ),
    ).toEqual(expect.arrayContaining(["overlap", "nature", "scope-unknown"]))
    const duplicate = {
      ...snapshot,
      subject: { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId: "two" },
      positions: snapshot.positions.map((p) => ({
        ...p,
        scope: {
          ...p.scope,
          subject: { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId: "two" },
        },
      })),
    }
    expect(
      aggregateBalances([snapshot, duplicate], BALANCE_PURPOSES.Prepaid)
        .amounts,
    ).toEqual([{ value: "120", asset: { kind: "currency", code: "USD" } }])
    expect(
      aggregateBalances([snapshot, duplicate], BALANCE_PURPOSES.Prepaid)
        .duplicateCount,
    ).toBe(1)
  })
})
