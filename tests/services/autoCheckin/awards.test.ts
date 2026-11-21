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
