import { describe, expect, it } from "vitest"

import { assertXingchiClaimEvidence } from "~~/scripts/flows/xingchi-checkin.mjs"

const requests = (count: number) => [
  { method: "GET" },
  ...Array.from({ length: count }, () => ({ method: "POST" })),
  { method: "GET" },
]

describe("Xingchi live claim evidence", () => {
  it("accepts a fresh grant with exactly one native claim", () => {
    expect(() =>
      assertXingchiClaimEvidence({ status: "success" }, requests(1)),
    ).not.toThrow()
  })

  it.each([0, 2])("rejects success with %s claims", (count) => {
    expect(() =>
      assertXingchiClaimEvidence({ status: "success" }, requests(count)),
    ).toThrow("exactly one POST")
  })

  it.each([
    { status: "already_checked" },
    { status: "skipped", reasonCode: "already_checked_today" },
  ])("accepts an already-claimed result with no POST: %j", (result) => {
    expect(() => assertXingchiClaimEvidence(result, requests(0))).not.toThrow()
    expect(() => assertXingchiClaimEvidence(result, requests(1))).toThrow(
      "must not POST",
    )
  })

  it.each([
    { status: "skipped", reasonCode: "automatic_check_in_disabled" },
    { status: "failed" },
    { status: "uncertain" },
  ])("does not label an unsuccessful result already claimed: %j", (result) => {
    expect(() => assertXingchiClaimEvidence(result, requests(0))).toThrow()
  })
})
