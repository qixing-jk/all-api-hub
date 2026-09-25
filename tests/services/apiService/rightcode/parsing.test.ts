import { describe, expect, it } from "vitest"

import {
  amountToQuota,
  isRecord,
  isRightCodeEffectiveUpstreamPayload,
  isRightCodeKeyListPayload,
  isRightCodeOverallUsageStats,
  isRightCodeSubscriptionListPayload,
  isRightCodeSubscriptionSummary,
  isRightCodeUsageStats,
  isRightCodeUserInfo,
  toFiniteNumber,
  toOptionalFiniteNumber,
  toOptionalString,
  toStringArray,
} from "~/services/apiService/rightcode/parsing"

describe("rightcode parsing helpers", () => {
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

  it("amountToQuota scales USD to quota points", () => {
    expect(amountToQuota(1)).toBe(500000)
    expect(amountToQuota(0.5)).toBe(250000)
    expect(amountToQuota(0)).toBe(0)
  })

  it("isRecord correctly classifies objects", () => {
    expect(isRecord({})).toBe(true)
    expect(isRecord({ a: 1 })).toBe(true)
    expect(isRecord([])).toBe(false)
    expect(isRecord(null)).toBe(false)
    expect(isRecord("string")).toBe(false)
    expect(isRecord(123)).toBe(false)
  })

  it("isRightCodeUserInfo validates expected user shape", () => {
    expect(isRightCodeUserInfo({ id: 1, user_token: "tok" })).toBe(true)
    expect(isRightCodeUserInfo({ id: "1", user_token: "tok" })).toBe(false)
    expect(isRightCodeUserInfo({ id: 1 })).toBe(false)
    expect(isRightCodeUserInfo(null)).toBe(false)
  })

  it("isRightCodeKeyListPayload validates keys array", () => {
    expect(isRightCodeKeyListPayload({ keys: [] })).toBe(true)
    expect(isRightCodeKeyListPayload({ keys: null })).toBe(false)
    expect(isRightCodeKeyListPayload({})).toBe(false)
  })

  it("isRightCodeSubscriptionListPayload validates subscriptions array", () => {
    expect(isRightCodeSubscriptionListPayload({ subscriptions: [] })).toBe(true)
    expect(isRightCodeSubscriptionListPayload({ subscriptions: "no" })).toBe(
      false,
    )
  })

  it("isRightCodeUsageStats and isRightCodeOverallUsageStats validate stats fields", () => {
    expect(isRightCodeUsageStats({ total_requests: 10 })).toBe(true)
    expect(isRightCodeUsageStats({ total_tokens: 500 })).toBe(true)
    expect(isRightCodeUsageStats({ total_cost: 0.5 })).toBe(true)
    expect(isRightCodeUsageStats({})).toBe(false)
    expect(isRightCodeOverallUsageStats({ total_cost: 0.5 })).toBe(true)
    expect(isRightCodeOverallUsageStats(null)).toBe(false)
  })

  it("isRightCodeSubscriptionSummary validates summary fields", () => {
    expect(isRightCodeSubscriptionSummary({ total_quota: 100 })).toBe(true)
    expect(isRightCodeSubscriptionSummary({ remaining_quota: 50 })).toBe(true)
    expect(isRightCodeSubscriptionSummary({ used_quota: 50 })).toBe(true)
    expect(isRightCodeSubscriptionSummary({})).toBe(false)
  })

  it("isRightCodeEffectiveUpstreamPayload validates upstreams array", () => {
    expect(isRightCodeEffectiveUpstreamPayload({ upstreams: [] })).toBe(true)
    expect(isRightCodeEffectiveUpstreamPayload({})).toBe(false)
  })
})
