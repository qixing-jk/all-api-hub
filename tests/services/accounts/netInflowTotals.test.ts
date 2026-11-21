import { describe, expect, it } from "vitest"

import { buildNetInflowTotals } from "~/services/accounts/metrics/netInflowTotals"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_SUBJECT_KINDS,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import type { NetInflowResult } from "~/services/history/dailyBalanceHistory/netInflow"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { buildNetInflowItem } from "~~/tests/test-utils/netInflow"

type Estimate = Extract<NetInflowResult, { status: "available" }>
function site(id: string, overrides: Partial<Estimate> = {}) {
  return buildDisplaySiteData({
    id,
    netInflowEstimate: {
      status: "available",
      estimates: [
        buildNetInflowItem({
          status: "available",
          amount: {
            value: "-5",
            asset: { kind: ASSET_KINDS.Currency, code: "CNY" },
          },
          classification: "unclassified-net-change",
          window: { start: 1000, end: 2000, timeZone: "UTC" },
          source: {
            adapter: "provider",
            operation: "wallet",
            contractVersion: "2",
            kind: EVIDENCE_KINDS.Derived,
          },
          scope: {
            subject: { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId: id },
            authority: "https://example.com",
            walletId: "shared",
            projects: { kind: SCOPE_SELECTION_KINDS.All },
            keys: { kind: SCOPE_SELECTION_KINDS.All },
            models: { kind: SCOPE_SELECTION_KINDS.All },
            groups: { kind: SCOPE_SELECTION_KINDS.All },
          },
          ...overrides,
        }),
      ],
    },
  })
}

describe("native net inflow totals", () => {
  it("normalizes cancelled fractional charges before checking the final precision bound", () => {
    const entries = ["9".repeat(256), "0.1", "-0.1"].map((value, index) => {
      const account = site(`wallet-${index}`)
      const estimate = account.netInflowEstimate!.estimates[0]!.netInflow!
      if (estimate.status !== "available") throw new Error("fixture")
      estimate.amount.value = value
      estimate.scope.walletId = account.id
      return account
    })
    const totals = buildNetInflowTotals(entries)
    expect(totals.groups[0]?.amount.value).toBe("9".repeat(256))
    expect(totals.coverage).toBe("complete")
  })
  it("keeps overflowed totals unavailable without breaking other native groups", () => {
    const a = site("a"),
      b = site("b")
    for (const account of [a, b]) {
      const item = account.netInflowEstimate!.estimates[0]!
      if (item.netInflow?.status !== "available") throw new Error("fixture")
      item.netInflow.amount.value = "9".repeat(256)
      item.netInflow.scope.walletId = account.id
    }
    const other = site("xno", {
      amount: { value: "2", asset: { kind: ASSET_KINDS.Crypto, id: "XNO" } },
    })
    const totals = buildNetInflowTotals([a, b, other])
    expect(totals.groups.map((group) => group.amount)).toEqual([
      { value: "2", asset: { kind: "crypto", id: "XNO" } },
    ])
    expect(totals.availableAccounts).toBe(1)
    expect(totals.coverage).toBe("partial")
    expect(totals.excluded.map((item) => item.reason)).toEqual([
      "amount-out-of-range",
      "amount-out-of-range",
    ])
  })
  it("does not mistake distinct equal-valued ledger metrics for duplicate observations", () => {
    const account = site("account")
    const other = structuredClone(account.netInflowEstimate!.estimates[0]!)
    other.seriesKey = "gift-ledger"
    other.position.id = "gift-ledger"
    account.netInflowEstimate!.estimates.push(other)
    const totals = buildNetInflowTotals([account])
    expect(totals.groups).toEqual([])
    expect(totals.duplicateCount).toBe(0)
    expect(totals.coverage).toBe("partial")
  })
  it("retains every native ledger and per-item failure while counting accounts once", () => {
    const account = site("account")
    const xno = site("account", {
      amount: { value: "2", asset: { kind: ASSET_KINDS.Crypto, id: "XNO" } },
    })
    account.netInflowEstimate!.estimates.push(
      ...xno.netInflowEstimate!.estimates,
    )
    const missing = structuredClone(account.netInflowEstimate!.estimates[0]!)
    missing.seriesKey = "missing-wallet"
    missing.position.scope.walletId = "missing-wallet"
    missing.status = "missing_baseline"
    delete missing.netInflow
    account.netInflowEstimate!.estimates.push(missing)
    const result = buildNetInflowTotals([account])
    expect(result.groups.map((group) => group.amount)).toEqual([
      { value: "-5", asset: { kind: "currency", code: "CNY" } },
      { value: "2", asset: { kind: "crypto", id: "XNO" } },
    ])
    expect(result.availableAccounts).toBe(1)
    expect(result.totalAccounts).toBe(1)
    expect(result.excluded).toMatchObject([
      {
        accountId: "account",
        seriesKey: "missing-wallet",
        reason: "missing_baseline",
      },
    ])
    expect(result.coverage).toBe("partial")
  })
  it.each(["-5", "3"])(
    "does not add or equate nested scopes on one wallet (%s)",
    (value) => {
      const all = site("all")
      const restricted = site("restricted")
      const result = restricted.netInflowEstimate!.estimates[0]!.netInflow!
      if (result.status !== "available") throw new Error("fixture")
      result.scope.keys = {
        kind: SCOPE_SELECTION_KINDS.Restricted,
        ids: ["one"],
      }
      result.amount.value = value
      const totals = buildNetInflowTotals([all, restricted])
      expect(totals.groups).toEqual([])
      expect(totals.coverage).toBe("partial")
      expect(totals.excluded).toMatchObject([
        { accountId: "all", reason: "wallet-conflict" },
        { accountId: "restricted", reason: "wallet-conflict" },
      ])
    },
  )
  it("deduplicates proven wallets without discarding contribution scope and provenance", () => {
    const result = buildNetInflowTotals([site("a"), site("b")])
    expect(result.groups[0]?.amount.value).toBe("-5")
    expect(result.duplicateCount).toBe(1)
    expect(result.availableAccounts).toBe(1)
    expect(result.groups[0]?.contributions[0]?.estimate.scope.walletId).toBe(
      "shared",
    )
  })

  it("adds distinct wallets and counts a shared wallet once despite small refresh offsets", () => {
    const first = site("first", {
      window: { start: 0, end: 43_200_000, timeZone: "UTC" },
    })
    const later = site("later", {
      window: { start: 0, end: 43_260_000, timeZone: "UTC" },
      amount: {
        value: "-6",
        asset: { kind: ASSET_KINDS.Currency, code: "CNY" },
      },
    })
    const independent = site("independent", {
      window: { start: 60_000, end: 43_320_000, timeZone: "UTC" },
    })
    const estimate = independent.netInflowEstimate!.estimates[0]!.netInflow!
    if (estimate.status !== "available") throw new Error("fixture")
    estimate.scope.walletId = "independent"

    const result = buildNetInflowTotals([first, independent, later])
    expect(result.groups.map(({ amount }) => amount.value)).toEqual(["-11"])
    expect(result.duplicateCount).toBe(1)
    expect(result.coverage).toBe("partial")
  })
  it("excludes conflicting observations of one wallet rather than choosing the first estimate", () => {
    const result = buildNetInflowTotals([
      site("a"),
      site("b", {
        amount: {
          value: "9",
          asset: { kind: ASSET_KINDS.Currency, code: "CNY" },
        },
      }),
    ])
    expect(result.groups).toEqual([])
    expect(result.availableAccounts).toBe(0)
    expect(result.excluded).toMatchObject([
      { accountId: "a", reason: "wallet-conflict" },
      { accountId: "b", reason: "wallet-conflict" },
    ])
    expect(result.coverage).toBe("partial")
  })

  it("discloses possible overlap when wallet identity is unknown", () => {
    const a = site("a"),
      b = site("b")
    for (const entry of [a, b]) {
      const result = entry.netInflowEstimate!.estimates[0]!.netInflow!
      if (result.status === "available") delete result.scope.walletId
    }
    const result = buildNetInflowTotals([a, b])
    expect(result.groups[0]?.amount.value).toBe("-10")
    expect(result.duplicateCount).toBe(0)
    expect(result.potentialDuplicateCount).toBe(1)
    expect(result.coverage).toBe("partial")
  })

  it("keeps different assets and observation windows in separate groups and discloses unavailable accounts", () => {
    const later = site("later", {
      window: { start: 1000, end: 3000, timeZone: "UTC" },
    })
    const estimate = later.netInflowEstimate!.estimates[0]!.netInflow!
    if (estimate.status !== "available") throw new Error("fixture")
    estimate.scope.walletId = "independent"
    const result = buildNetInflowTotals([
      site("cny"),
      later,
      site("xno", {
        amount: { value: "2", asset: { kind: ASSET_KINDS.Crypto, id: "XNO" } },
      }),
      buildDisplaySiteData({
        id: "legacy",
        netInflowEstimate: { status: "legacy", estimates: [] },
      }),
    ])
    expect(result.groups).toHaveLength(3)
    expect(result.groups.map((group) => group.amount.value)).toEqual([
      "-5",
      "-5",
      "2",
    ])
    expect(result.excluded).toContainEqual({
      accountId: "legacy",
      reason: "legacy",
    })
    expect(result.coverage).toBe("partial")
  })
})
