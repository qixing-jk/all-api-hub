import { describe, expect, it } from "vitest"

import { acceptBalanceRefresh } from "~/services/accounts/refresh/balanceAcceptance"
import {
  balanceSnapshotParts,
  type BalanceSnapshot,
} from "~/services/amounts/balance"
import { normalizeTelemetryPatchToFacts } from "~/services/apiCredentialProfiles/telemetry/facts"
import { parseDeepSeekBalance } from "~/services/apiCredentialProfiles/telemetry/parsers"

const context = {
  profileId: "fixture",
  baseUrl: "https://wallet.example",
  observedAt: 1000,
}
function wallet(
  currency: string,
  value: string | undefined,
  observedAt = 1000,
): BalanceSnapshot {
  return normalizeTelemetryPatchToFacts(
    parseDeepSeekBalance({
      balance_infos: [{ currency, total_balance: value }],
    }),
    "deepSeekBalance",
    { ...context, observedAt },
  ).balanceSnapshot!
}

describe("balance collection acceptance", () => {
  it.each(["partial", "unavailable", "not-requested"] as const)(
    "retains omitted balances with original times on %s enumeration",
    (enumeration) => {
      const previous = wallet("USD", "10")
      const next = wallet("CNY", "20", 2000)
      const accepted = acceptBalanceRefresh(
        previous,
        balanceSnapshotParts(next, enumeration),
        previous.subject,
        2000,
      )
      expect(accepted.positions).toContainEqual(
        expect.objectContaining({
          id: "available:USD",
          amount: expect.objectContaining({
            status: "stale",
            value: "10",
            observedAt: 1000,
          }),
        }),
      )
      expect(accepted.coverage).toBe("partial")
    },
  )
  it("does not reassign a retained amount to a changed financial scope", () => {
    const previous = wallet("USD", "10")
    const next = wallet("USD", undefined, 2000)
    next.positions.forEach((position) => {
      position.scope.keys = { kind: "restricted", ids: ["other"] }
    })
    const accepted = acceptBalanceRefresh(
      previous,
      balanceSnapshotParts(next, "partial"),
      previous.subject,
      2000,
    )
    expect(accepted.positions[0]?.amount.status).toBe("unavailable")
    expect(accepted.positions[0]?.amount).not.toHaveProperty("value")
  })
  it("does not revive an amount already invalidated by an identity change", () => {
    const previous = wallet("USD", "10")
    previous.positions[0]!.amount = {
      status: "stale",
      value: "10",
      observedAt: 1000,
      source: previous.positions[0]!.amount.source,
      reason: "account-identity-changed",
    }
    const next = wallet("USD", undefined, 2000)
    const accepted = acceptBalanceRefresh(
      previous,
      balanceSnapshotParts(next, "partial"),
      previous.subject,
      2000,
    )
    expect(accepted.positions[0]?.amount.status).toBe("unavailable")
  })
  it("rejects a source collection mismatch before accepting its positions", () => {
    const next = wallet("USD", "10")
    const parts = balanceSnapshotParts(next, "complete")
    parts[0]!.collectionKey = "different"
    expect(() =>
      acceptBalanceRefresh(undefined, parts, next.subject, 2000),
    ).toThrow("balance_collection_mismatch")
  })
  it("keeps an empty complete enumeration distinct from an unavailable read", () => {
    const previous = wallet("USD", "10")
    const parts = balanceSnapshotParts(previous, "complete")
    parts[0]!.positions = []
    expect(
      acceptBalanceRefresh(previous, parts, previous.subject, 2000),
    ).toMatchObject({ positions: [], coverage: "complete" })
  })
})
