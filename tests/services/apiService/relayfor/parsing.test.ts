import { describe, expect, it } from "vitest"

import {
  isRecord,
  isRelayForAnnouncement,
  isRelayForCheckInCampaignList,
  isRelayForCheckInClaimResult,
  isRelayForModelList,
  isRelayForOverview,
  isRelayForToken,
  isRelayForTokenList,
  isRelayForUser,
  toFiniteNumber,
  toOptionalFiniteNumber,
  toOptionalString,
  toStringArray,
} from "~/services/apiService/relayfor/parsing"

describe("relayfor parsing helpers", () => {
  it("toOptionalFiniteNumber converts numbers and numeric strings", () => {
    expect(toOptionalFiniteNumber(42)).toBe(42)
    expect(toOptionalFiniteNumber("3.14")).toBe(3.14)
    expect(toOptionalFiniteNumber("   ")).toBeUndefined()
    expect(toOptionalFiniteNumber("abc")).toBeUndefined()
    expect(toOptionalFiniteNumber(Number.NaN)).toBeUndefined()
    expect(toOptionalFiniteNumber(Number.POSITIVE_INFINITY)).toBeUndefined()
    expect(toOptionalFiniteNumber(null)).toBeUndefined()
    expect(toOptionalFiniteNumber(undefined)).toBeUndefined()
  })

  it("toFiniteNumber provides fallback for undefined", () => {
    expect(toFiniteNumber(10, 5)).toBe(10)
    expect(toFiniteNumber(null, 5)).toBe(5)
    expect(toFiniteNumber(undefined)).toBe(0)
  })

  it("toOptionalString trims non-empty strings", () => {
    expect(toOptionalString("  hello  ")).toBe("hello")
    expect(toOptionalString("")).toBeUndefined()
    expect(toOptionalString("   ")).toBeUndefined()
    expect(toOptionalString(123)).toBeUndefined()
    expect(toOptionalString(null)).toBeUndefined()
  })

  it("toStringArray filters and trims string elements", () => {
    expect(toStringArray([" a ", "b", "", 12, null, "  c  "])).toEqual([
      "a",
      "b",
      "c",
    ])
    expect(toStringArray(null)).toEqual([])
    expect(toStringArray("not-an-array")).toEqual([])
  })

  it("isRecord correctly classifies objects", () => {
    expect(isRecord({})).toBe(true)
    expect(isRecord({ a: 1 })).toBe(true)
    expect(isRecord([])).toBe(false)
    expect(isRecord(null)).toBe(false)
    expect(isRecord("string")).toBe(false)
    expect(isRecord(123)).toBe(false)
  })

  it("isRelayForUser validates user shape", () => {
    expect(isRelayForUser({ id: 1, username: "user1", quota: 500000 })).toBe(
      true,
    )
    expect(isRelayForUser({ id: "1", username: "user1" })).toBe(false)
    expect(isRelayForUser({ id: 1 })).toBe(false)
    expect(isRelayForUser(null)).toBe(false)
  })

  it("isRelayForOverview validates overview shape", () => {
    expect(
      isRelayForOverview({
        user: { id: 1, username: "user1", quota: 500000 },
        total_quota: 500000,
        today: { requests: 2, tokens: 100, quota: 1000 },
      }),
    ).toBe(true)
    expect(isRelayForOverview({ user: null })).toBe(false)
    expect(isRelayForOverview({})).toBe(false)
  })

  it("isRelayForToken and isRelayForTokenList validate token items and arrays", () => {
    const validToken = {
      id: 1,
      name: "key1",
      key: "sk-...",
      status: 1,
      remain_quota: 100,
      used_quota: 50,
      unlimited_quota: false,
    }
    expect(isRelayForToken(validToken)).toBe(true)
    expect(isRelayForToken({ id: "1" })).toBe(false)
    expect(isRelayForToken(null)).toBe(false)

    expect(isRelayForTokenList([validToken])).toBe(true)
    expect(isRelayForTokenList([])).toBe(true)
    expect(isRelayForTokenList("not-an-array")).toBe(false)
    expect(isRelayForTokenList([{ invalid: true }])).toBe(false)
  })

  it("isRelayForModelList validates model array envelope", () => {
    expect(isRelayForModelList({ items: [{ model: "gpt-4o" }] })).toBe(true)
    expect(isRelayForModelList({ items: [] })).toBe(true)
    expect(isRelayForModelList({ items: "not-an-array" })).toBe(false)
    expect(isRelayForModelList(null)).toBe(false)
  })

  it("isRelayForCheckInCampaignList validates campaign array", () => {
    const validCampaign = {
      id: 1,
      name: "Daily",
      start_date: "2026-10-01",
      end_date: "2026-10-31",
      days: [{ date: "2026-10-19", claimed: false, can_claim: true }],
    }
    expect(isRelayForCheckInCampaignList([validCampaign])).toBe(true)
    expect(isRelayForCheckInCampaignList([])).toBe(true)
    expect(isRelayForCheckInCampaignList(null)).toBe(false)
  })

  it("isRelayForCheckInClaimResult validates claim result", () => {
    expect(
      isRelayForCheckInClaimResult({
        is_makeup: false,
        reward_type: "quota",
        quota_awarded: 10000,
      }),
    ).toBe(true)
    expect(isRelayForCheckInClaimResult({ is_makeup: "yes" })).toBe(false)
    expect(isRelayForCheckInClaimResult(null)).toBe(false)
  })

  it("isRelayForAnnouncement validates announcement shape", () => {
    expect(
      isRelayForAnnouncement({ title: "Welcome", content: "Hello world" }),
    ).toBe(true)
    expect(isRelayForAnnouncement({ title: 123 })).toBe(false)
    expect(isRelayForAnnouncement(null)).toBe(false)
  })
})
