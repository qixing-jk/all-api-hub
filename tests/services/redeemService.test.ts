/**
 * Tests for Redemption Service
 */

import { describe, expect, it } from "vitest"

import { isPossibleRedemptionCode } from "~/services/redeemService"

describe("isPossibleRedemptionCode", () => {
  it("should return true for valid 32-character hex codes", () => {
    expect(isPossibleRedemptionCode("a1b2c3d4e5f67890a1b2c3d4e5f67890")).toBe(
      true
    )
    expect(isPossibleRedemptionCode("ABCDEF1234567890ABCDEF1234567890")).toBe(
      true
    )
    expect(isPossibleRedemptionCode("0123456789abcdef0123456789abcdef")).toBe(
      true
    )
  })

  it("should return false for invalid formats", () => {
    // Wrong length
    expect(isPossibleRedemptionCode("abc123")).toBe(false)
    expect(isPossibleRedemptionCode("a1b2c3d4e5f67890a1b2c3d4e5f6789")).toBe(
      false
    ) // 31 chars
    expect(isPossibleRedemptionCode("a1b2c3d4e5f67890a1b2c3d4e5f678900")).toBe(
      false
    ) // 33 chars

    // Non-hex characters
    expect(isPossibleRedemptionCode("g1b2c3d4e5f67890a1b2c3d4e5f67890")).toBe(
      false
    )
    expect(isPossibleRedemptionCode("a1b2c3d4-5f67890a1b2c3d4e5f67890")).toBe(
      false
    )

    // Empty or invalid input
    expect(isPossibleRedemptionCode("")).toBe(false)
    expect(isPossibleRedemptionCode(null as any)).toBe(false)
    expect(isPossibleRedemptionCode(undefined as any)).toBe(false)
  })

  it("should trim whitespace before checking", () => {
    expect(
      isPossibleRedemptionCode("  a1b2c3d4e5f67890a1b2c3d4e5f67890  ")
    ).toBe(true)
  })

  it("should be case-insensitive", () => {
    expect(isPossibleRedemptionCode("ABCDEF1234567890abcdef1234567890")).toBe(
      true
    )
  })
})
