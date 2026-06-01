import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  coerceAccountIdentity,
  isValidManualAccountIdentity,
  normalizeAccountIdentity,
  requiresNumericManualAccountIdentity,
} from "~/services/accounts/accountIdentity"

describe("accountIdentity", () => {
  it("normalizes string and numeric identities to non-empty strings", () => {
    expect(normalizeAccountIdentity(" user-name ")).toBe("user-name")
    expect(normalizeAccountIdentity(42)).toBe("42")
  })

  it("rejects empty, non-finite, and unsupported identity values", () => {
    expect(normalizeAccountIdentity("   ")).toBeNull()
    expect(normalizeAccountIdentity(Number.NaN)).toBeNull()
    expect(normalizeAccountIdentity(Number.POSITIVE_INFINITY)).toBeNull()
    expect(normalizeAccountIdentity({ id: 1 })).toBeNull()
    expect(coerceAccountIdentity(null, "")).toBe("")
  })

  it("keeps numeric manual validation scoped to compatible site types", () => {
    expect(requiresNumericManualAccountIdentity(SITE_TYPES.NEW_API)).toBe(true)
    expect(requiresNumericManualAccountIdentity(SITE_TYPES.AIHUBMIX)).toBe(
      false,
    )
  })

  it("allows username identities only for site types that do not require numeric manual ids", () => {
    expect(
      isValidManualAccountIdentity("aihubmix-user", SITE_TYPES.AIHUBMIX),
    ).toBe(true)
    expect(isValidManualAccountIdentity("", SITE_TYPES.AIHUBMIX)).toBe(false)
    expect(isValidManualAccountIdentity("  ", SITE_TYPES.NEW_API)).toBe(false)
    expect(
      isValidManualAccountIdentity("not-a-number", SITE_TYPES.NEW_API),
    ).toBe(false)
    expect(isValidManualAccountIdentity("123", SITE_TYPES.NEW_API)).toBe(true)
  })

  it("requires positive integer strings for numeric manual account identities", () => {
    expect(isValidManualAccountIdentity("1.5", SITE_TYPES.NEW_API)).toBe(false)
    expect(isValidManualAccountIdentity("1e3", SITE_TYPES.NEW_API)).toBe(false)
    expect(isValidManualAccountIdentity("-1", SITE_TYPES.NEW_API)).toBe(false)
    expect(isValidManualAccountIdentity("0", SITE_TYPES.NEW_API)).toBe(false)
    expect(isValidManualAccountIdentity("001", SITE_TYPES.NEW_API)).toBe(false)
    expect(isValidManualAccountIdentity("1", SITE_TYPES.NEW_API)).toBe(true)
  })
})
