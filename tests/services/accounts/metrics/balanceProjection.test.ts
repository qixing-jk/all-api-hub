import { describe, expect, it } from "vitest"

import {
  aggregateBalances,
  BALANCE_PURPOSES,
} from "~/services/accounts/metrics/balanceProjection"
import {
  balancePosition,
  balanceSnapshotSchema,
  type BalancePosition,
  type BalanceSnapshot,
} from "~/services/amounts/balance"

function position(
  value: string,
  overrides: Partial<BalancePosition> = {},
): BalancePosition {
  return {
    ...balancePosition({
      id: "available",
      scope: {
        subject: { kind: "credential", profileId: "fixture" },
        authority: "https://wallet.example",
        walletId: "wallet",
        projects: { kind: "all" },
        keys: { kind: "all" },
        models: { kind: "all" },
        groups: { kind: "all" },
      },
      asset: { kind: "currency", code: "USD" },
      value,
      observedAt: 1000,
      source: {
        kind: "reported",
        adapter: "fixture",
        operation: "wallet",
        contractVersion: "1",
      },
      nature: "prepaid",
      validity: { kind: "no-expiry" },
    }),
    ...overrides,
  }
}
function snapshot(positions: BalancePosition[]): BalanceSnapshot {
  return {
    schemaVersion: 2,
    subject: positions[0]!.scope.subject,
    capturedAt: 2000,
    coverage: "complete",
    positions,
  }
}

describe("balance aggregation by confirmed financial meaning", () => {
  it("keeps distinct raw quota IDs separate even when one begins with the authority", () => {
    const asset = {
      kind: "quota",
      id: "credits",
      label: "Credits",
      displayScale: 10,
      displayLabel: "Credits",
    } as const
    const first = position("10", { asset })
    const second = position("20", {
      asset: { ...asset, id: "https://wallet.example:credits" },
      scope: { ...first.scope, walletId: "other" },
    })
    const result = aggregateBalances(
      [snapshot([first]), snapshot([second])],
      BALANCE_PURPOSES.Available,
    )
    expect(result.amounts.map((amount) => amount.value)).toEqual(["10", "20"])
    expect(
      new Set(
        result.amounts.map(
          (amount) => amount.asset.kind === "quota" && amount.asset.id,
        ),
      ).size,
    ).toBe(2)
    expect(
      result.amounts.every(
        (amount) =>
          amount.asset.kind === "quota" &&
          amount.asset.displayScale === 10 &&
          amount.asset.displayLabel === "Credits",
      ),
    ).toBe(true)
  })
  it("deduplicates equivalent multi-position wallet reads independent of order and resolves ties by owner", () => {
    const make = (owner: string, reverse = false) => {
      const first = position("10", {
        scope: {
          ...position("0").scope,
          subject: { kind: "credential", profileId: owner },
        },
      })
      const second = position("3", {
        id: "bonus",
        funding: "granted",
        scope: first.scope,
      })
      return snapshot(reverse ? [second, first] : [first, second])
    }
    const a = make("a")
    const z = make("z", true)
    for (const snapshots of [
      [z, a],
      [a, z],
    ]) {
      const result = aggregateBalances(snapshots, BALANCE_PURPOSES.Available)
      expect(result.amounts).toEqual([
        { asset: { kind: "currency", code: "USD" }, value: "13" },
      ])
      expect(result.duplicateCount).toBe(1)
      expect(result.contributions).toHaveLength(1)
      expect(result.contributions[0]!.positions[0]!.scope.subject).toEqual(
        a.subject,
      )
    }
  })
  it("isolates an overflowing asset inside one snapshot while preserving another native asset", () => {
    const first = position("9".repeat(256))
    const second = position("1", {
      id: "another-wallet",
      scope: { ...first.scope, walletId: "other" },
    })
    const cny = position("7", {
      id: "cny",
      asset: { kind: "currency", code: "CNY" },
    })
    const result = aggregateBalances(
      [snapshot([first, second, cny])],
      BALANCE_PURPOSES.Available,
    )
    expect(result.amounts).toEqual([
      { asset: { kind: "currency", code: "CNY" }, value: "7" },
    ])
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]).toMatchObject({
      reason: "amount-out-of-range",
      positions: [first, second],
    })
    expect(result.contributions[0]?.positions).toEqual([cny])
    expect(result.includedCount).toBe(1)
    expect(result.coverage).toBe("partial")
  })
  it("preserves the full raw ID when forming the authority and quota identity pair", () => {
    const asset = {
      kind: "quota",
      id: "https://wallet.example:credits",
      label: "Credits",
      displayScale: 1,
      displayLabel: "Credits",
    } as const
    expect(
      aggregateBalances(
        [snapshot([position("10", { asset })])],
        BALANCE_PURPOSES.Available,
      ).amounts,
    ).toEqual([
      {
        asset: {
          ...asset,
          id: JSON.stringify(["https://wallet.example", asset.id]),
        },
        value: "10",
      },
    ])
  })
  it.each([
    {
      name: "legacy observations",
      purpose: BALANCE_PURPOSES.Available,
      make: (p: BalancePosition) => ({
        ...p,
        amount: {
          ...p.amount,
          source: { ...p.amount.source, kind: "legacy" as const },
        },
      }),
    },
    {
      name: "unknown assets",
      purpose: BALANCE_PURPOSES.Available,
      make: (p: BalancePosition) => ({
        ...p,
        asset: { kind: "unknown" as const },
      }),
    },
    {
      name: "pending charges",
      purpose: BALANCE_PURPOSES.Available,
      make: (p: BalancePosition) => ({ ...p, role: "pending-charge" as const }),
    },
    {
      name: "subscription allocations",
      purpose: BALANCE_PURPOSES.Prepaid,
      make: (p: BalancePosition) => ({ ...p, nature: "subscription" as const }),
    },
    {
      name: "unknown prepaid scope",
      purpose: BALANCE_PURPOSES.Prepaid,
      make: (p: BalancePosition) => ({
        ...p,
        scope: { ...p.scope, keys: { kind: "unknown" as const } },
      }),
    },
    {
      name: "restricted routes",
      purpose: BALANCE_PURPOSES.Available,
      make: (p: BalancePosition) => ({
        ...p,
        scope: {
          ...p.scope,
          routes: { kind: "restricted" as const, ids: ["chat"] },
        },
      }),
    },
    {
      name: "expired positions",
      purpose: BALANCE_PURPOSES.Available,
      make: (p: BalancePosition) => ({
        ...p,
        validity: { kind: "expires" as const, at: 1000 },
      }),
    },
    {
      name: "unverified prepaid expiry",
      purpose: BALANCE_PURPOSES.Prepaid,
      make: (p: BalancePosition) => ({
        ...p,
        validity: { kind: "unknown" as const },
      }),
    },
    {
      name: "reset windows",
      purpose: BALANCE_PURPOSES.Available,
      make: (p: BalancePosition) => ({
        ...p,
        window: { start: 100, end: 3000, timeZone: "UTC", resetsAt: 1000 },
      }),
    },
  ])("excludes $name from eligible totals", ({ purpose, make }) => {
    expect(
      aggregateBalances([snapshot([make(position("10"))])], purpose, 2000)
        .amounts,
    ).toEqual([])
  })
  it("includes last-known amounts only when requested and never after identity changes or interval expiry", () => {
    const stale = position("10")
    stale.amount = {
      status: "stale",
      source: stale.amount.source,
      value: "10",
      observedAt: 1000,
      reason: "refresh-unavailable",
    }
    expect(
      aggregateBalances([snapshot([stale])], BALANCE_PURPOSES.Available, 2000)
        .amounts,
    ).toEqual([])
    expect(
      aggregateBalances(
        [snapshot([stale])],
        BALANCE_PURPOSES.Available,
        2000,
        true,
      ).amounts[0]?.value,
    ).toBe("10")
    expect(
      aggregateBalances(
        [
          snapshot([
            { ...stale, window: { start: 100, end: 1500, timeZone: "UTC" } },
          ]),
        ],
        BALANCE_PURPOSES.Available,
        2000,
        true,
      ).amounts,
    ).toEqual([])
    stale.amount.reason = "account-identity-changed"
    expect(
      aggregateBalances(
        [snapshot([stale])],
        BALANCE_PURPOSES.Available,
        2000,
        true,
      ).amounts,
    ).toEqual([])
  })
  it("reports conflicting concurrent wallet readings and incomparable collection contracts", () => {
    expect(
      aggregateBalances(
        [snapshot([position("10")]), snapshot([position("12")])],
        BALANCE_PURPOSES.Available,
      ),
    ).toMatchObject({ amounts: [], conflictCount: 1 })
    const other = position("3", { id: "other", collectionKey: "other" })
    expect(
      aggregateBalances(
        [snapshot([position("10"), other])],
        BALANCE_PURPOSES.Available,
      ),
    ).toMatchObject({ amounts: [], conflictCount: 1 })
  })
  it("warns about unidentified shared authorities without silently deduplicating them", () => {
    const first = position("10")
    delete first.scope.walletId
    const second = position("12", {
      scope: {
        ...first.scope,
        subject: { kind: "credential", profileId: "second" },
      },
    })
    expect(
      aggregateBalances(
        [snapshot([first]), snapshot([second])],
        BALANCE_PURPOSES.Available,
      ),
    ).toMatchObject({
      amounts: [{ value: "22" }],
      potentialDuplicateCount: 1,
      coverage: "partial",
    })
  })
  it("keeps overflowed totals unavailable and removes their contributions", () => {
    const first = position("9".repeat(256))
    const second = position("1", {
      scope: { ...first.scope, walletId: "other" },
    })
    const result = aggregateBalances(
      [snapshot([first]), snapshot([second])],
      BALANCE_PURPOSES.Available,
    )
    expect(result).toMatchObject({
      amounts: [],
      includedCount: 0,
      conflictCount: 1,
    })
    expect(
      result.contributions.every(
        (contribution) => contribution.positions.length === 0,
      ),
    ).toBe(true)
  })
  it.each(["duplicate", "subject", "missing-parent", "cycle"])(
    "rejects a malformed %s balance snapshot",
    (kind) => {
      const parent = position("10")
      const child = position("3", {
        id: "child",
        parentId: "available",
        relation: "component",
      })
      const invalid = snapshot([parent, child])
      if (kind === "duplicate") invalid.positions.push(parent)
      if (kind === "subject")
        child.scope = {
          ...child.scope,
          subject: { kind: "credential", profileId: "other" },
        }
      if (kind === "missing-parent") child.parentId = "missing"
      if (kind === "cycle") {
        parent.parentId = "child"
        parent.relation = "component"
      }
      expect(balanceSnapshotSchema.safeParse(invalid).success).toBe(false)
    },
  )
  it("compares identified wallets before scope metadata and selects the newest equivalent reading", () => {
    const first = position("10")
    const second = position("12", {
      scope: { ...first.scope, routes: { kind: "all" } },
      amount: {
        ...first.amount,
        status: "known",
        value: "12",
        observedAt: 2000,
      },
    })
    const result = aggregateBalances(
      [snapshot([first]), snapshot([second])],
      BALANCE_PURPOSES.Available,
    )
    expect(result.amounts).toEqual([
      { asset: { kind: "currency", code: "USD" }, value: "12" },
    ])
    expect(result.duplicateCount).toBe(1)
    const incomparable = {
      ...second,
      scope: { ...second.scope, routes: { kind: "unknown" as const } },
    }
    expect(
      aggregateBalances(
        [snapshot([first]), snapshot([incomparable])],
        BALANCE_PURPOSES.Available,
      ),
    ).toMatchObject({ amounts: [], conflictCount: 1 })
    const distinct = {
      ...second,
      scope: { ...second.scope, walletId: "other" },
    }
    expect(
      aggregateBalances(
        [snapshot([first]), snapshot([distinct])],
        BALANCE_PURPOSES.Available,
      ).amounts,
    ).toEqual([{ asset: { kind: "currency", code: "USD" }, value: "22" }])
  })
  it("keeps the prepaid parent rather than dropping both it and its ledger component", () => {
    const parent = position("12")
    const component = position("5", {
      id: "cash",
      parentId: "available",
      relation: "component",
      role: "ledger",
    })
    expect(
      aggregateBalances(
        [snapshot([parent, component])],
        BALANCE_PURPOSES.Prepaid,
      ).amounts,
    ).toEqual([{ asset: { kind: "currency", code: "USD" }, value: "12" }])
    expect(
      aggregateBalances(
        [snapshot([position("5", { role: "ledger" })])],
        BALANCE_PURPOSES.Prepaid,
      ).amounts,
    ).toEqual([{ asset: { kind: "currency", code: "USD" }, value: "5" }])
    const available = position("12")
    const ledger = position("5", { id: "ledger", role: "ledger" })
    expect(
      aggregateBalances(
        [snapshot([available, ledger])],
        BALANCE_PURPOSES.Prepaid,
      ).amounts,
    ).toEqual([{ asset: { kind: "currency", code: "USD" }, value: "5" }])
    expect(
      aggregateBalances(
        [snapshot([available, ledger])],
        BALANCE_PURPOSES.Available,
      ).amounts,
    ).toEqual([{ asset: { kind: "currency", code: "USD" }, value: "12" }])
    expect(
      aggregateBalances(
        [
          snapshot([
            available,
            { ...ledger, scope: { ...ledger.scope, walletId: "other" } },
          ]),
        ],
        BALANCE_PURPOSES.Prepaid,
      ).amounts,
    ).toEqual([{ asset: { kind: "currency", code: "USD" }, value: "17" }])
    expect(
      aggregateBalances(
        [
          snapshot([
            available,
            { ...ledger, asset: { kind: "currency", code: "CNY" } },
          ]),
        ],
        BALANCE_PURPOSES.Prepaid,
      ).amounts,
    ).toEqual([
      { asset: { kind: "currency", code: "USD" }, value: "12" },
      { asset: { kind: "currency", code: "CNY" }, value: "5" },
    ])
    expect(
      aggregateBalances(
        [
          snapshot([
            available,
            {
              ...ledger,
              amount: {
                ...ledger.amount,
                source: {
                  ...ledger.amount.source,
                  operation: "other-contract",
                },
              },
            },
          ]),
        ],
        BALANCE_PURPOSES.Prepaid,
      ),
    ).toMatchObject({ amounts: [], conflictCount: 1 })
  })
  it("keeps quota codes local to their reporting authority while summing currencies", () => {
    const asset = {
      kind: "quota",
      id: "credits",
      label: "Credits",
      displayScale: 1,
      displayLabel: "Credits",
    } as const
    const first = position("10", { asset })
    const second = position("20", {
      asset,
      scope: { ...first.scope, authority: "https://other.example" },
    })
    const result = aggregateBalances(
      [snapshot([first]), snapshot([second])],
      BALANCE_PURPOSES.Available,
    )
    expect(result.amounts).toEqual([
      {
        value: "10",
        asset: {
          ...asset,
          id: JSON.stringify(["https://wallet.example", "credits"]),
        },
      },
      {
        value: "20",
        asset: {
          ...asset,
          id: JSON.stringify(["https://other.example", "credits"]),
        },
      },
    ])
    expect(
      aggregateBalances(
        [
          snapshot([position("10")]),
          snapshot([position("20", { scope: second.scope })]),
        ],
        BALANCE_PURPOSES.Available,
      ).amounts,
    ).toEqual([{ asset: { kind: "currency", code: "USD" }, value: "30" }])
  })
  it("never substitutes a fresh component for an excluded parent total", () => {
    const parent = position("12")
    parent.amount = {
      ...parent.amount,
      status: "stale",
      value: "12",
      observedAt: 1000,
      reason: "refresh-unavailable",
    }
    const component = position("3", {
      id: "granted",
      parentId: "available",
      relation: "component",
    })
    expect(
      aggregateBalances(
        [snapshot([parent, component])],
        BALANCE_PURPOSES.Available,
      ).amounts,
    ).toEqual([])
    expect(
      aggregateBalances(
        [snapshot([position("12"), component])],
        BALANCE_PURPOSES.Available,
      ).amounts,
    ).toEqual([{ asset: { kind: "currency", code: "USD" }, value: "12" }])
  })
})
