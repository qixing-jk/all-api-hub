import { describe, expect, it } from "vitest"

import { confirmedAward, mergeConfirmedAwards } from "~/services/amounts/awards"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_SUBJECT_KINDS,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import { readCheckinAwards } from "~/services/checkin/autoCheckin/awards"

describe("check-in award presentation facts", () => {
  const grant = (value: unknown, nativeUnitsPerAsset?: number) =>
    confirmedAward({
      id: "grant",
      asset: { kind: ASSET_KINDS.Currency, code: "USD" },
      value,
      nativeUnitsPerAsset,
      source: {
        adapter: "test",
        operation: "claim",
        contractVersion: "1",
        kind: EVIDENCE_KINDS.Reported,
      },
      observedAt: 1234,
      scope: {
        subject: {
          kind: FINANCIAL_SUBJECT_KINDS.Account,
          accountId: "account",
        },
        authority: "https://example.test",
        models: { kind: SCOPE_SELECTION_KINDS.Unknown },
        keys: { kind: SCOPE_SELECTION_KINDS.Unknown },
        groups: { kind: SCOPE_SELECTION_KINDS.Unknown },
        projects: { kind: SCOPE_SELECTION_KINDS.Unknown },
      },
      event: { namespace: "claim", id: "record-1" },
    })
  it("distinguishes an unreported grant amount from an invalid reported value", () => {
    expect(grant(undefined).amount.status).toBe("unknown")
    expect(grant(null).amount.status).toBe("unknown")
    expect(grant("invalid").amount.status).toBe("unavailable")
    expect(grant(-1).amount.status).toBe("unavailable")
    expect(grant(0).amount).toMatchObject({ status: "known", value: "0" })
  })
  it.each([false, true])(
    "preserves both the confirmed amount and the credited fulfillment (reversed: %s)",
    (reversed) => {
      const amount = {
        ...grant("1"),
        fulfillment: "pending-redemption" as const,
      }
      const receipt = { ...grant(undefined), fulfillment: "credited" as const }
      const [first, second] = reversed ? [receipt, amount] : [amount, receipt]
      expect(mergeConfirmedAwards([first], [second])).toMatchObject([
        { amount: { status: "known", value: "1" }, fulfillment: "credited" },
      ])
    },
  )

  it("retains conflicting event evidence without duplicating it on repeated readback", () => {
    const prior = [grant("1"), grant("2")]
    expect(mergeConfirmedAwards(prior, [grant("2")])).toEqual(prior)
  })
  it("scales a representable quota grant without overflowing an intermediate amount", () => {
    expect(grant(`6${"0".repeat(255)}`, 500000).amount).toMatchObject({
      status: "known",
      value: `12${"0".repeat(249)}`,
    })
  })
  it("keeps a confirmed grant when its protocol amount cannot be represented exactly", () => {
    expect(grant("1", 3)).toMatchObject({
      amount: {
        status: "unavailable",
        reason: "unsupported-amount-precision",
      },
    })
    expect(mergeConfirmedAwards([grant("1")], [grant("1", 3)])).toEqual([
      grant("1"),
    ])
  })

  it("deduplicates the same grant only within its native asset and usage scope", () => {
    const prior = grant("1")
    const quota = {
      ...prior,
      asset: {
        kind: ASSET_KINDS.Quota,
        id: "test:credits",
        label: "Credit",
        displayScale: 1,
        displayLabel: "Credit",
      },
    }
    const crypto = {
      ...prior,
      asset: { kind: ASSET_KINDS.Crypto, id: "XNO" as const },
    }
    const unknown = { ...prior, asset: { kind: ASSET_KINDS.Unknown } }
    const firstRoute = {
      ...prior,
      scope: {
        ...prior.scope,
        routes: { kind: SCOPE_SELECTION_KINDS.Restricted, ids: ["/b", "/a"] },
      },
    }
    const secondRoute = {
      ...firstRoute,
      scope: {
        ...prior.scope,
        routes: { kind: SCOPE_SELECTION_KINDS.Restricted, ids: ["/c"] },
      },
    }
    const repeatedRoute = {
      ...firstRoute,
      scope: {
        ...prior.scope,
        routes: {
          kind: SCOPE_SELECTION_KINDS.Restricted,
          ids: ["/a", "/b", "/a"],
        },
      },
    }
    expect(
      mergeConfirmedAwards(
        [prior, quota, crypto, unknown, firstRoute, secondRoute],
        [quota, crypto, unknown, repeatedRoute],
      ),
    ).toEqual([prior, quota, crypto, unknown, repeatedRoute, secondRoute])
  })

  it("reads old quota rewards as legacy facts without changing the persisted result", () => {
    const stored = {
      accountId: "old-account",
      timestamp: 1234,
      reward: { quota: 1000000 },
    }
    const original = structuredClone(stored)
    expect(readCheckinAwards(stored)).toMatchObject([
      {
        asset: { kind: "quota", id: "legacy:checkin:quota" },
        amount: {
          status: "known",
          value: "1000000",
          observedAt: 1234,
          source: { kind: "legacy" },
        },
        fulfillment: "unknown",
      },
    ])
    expect(stored).toEqual(original)
  })
})
