import { describe, expect, it, vi } from "vitest"

import {
  generateNewApiTotpCode,
  hasNewApiTotpSecret,
} from "~/services/managedSites/providers/newApi/newApiTotp"

describe("newApiTotp", () => {
  it("detects whether a secret is effectively present after trimming", () => {
    expect(hasNewApiTotpSecret()).toBe(false)
    expect(hasNewApiTotpSecret(null)).toBe(false)
    expect(hasNewApiTotpSecret("   \n\t  ")).toBe(false)
    expect(hasNewApiTotpSecret("  jbsw y3dp ehpk3pxp  ")).toBe(true)
  })

  it("normalizes whitespace and casing before generating a TOTP code", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-29T00:00:00.000Z"))

    const compactCode = generateNewApiTotpCode("JBSWY3DPEHPK3PXP")
    const spacedCode = generateNewApiTotpCode("  jbsw y3dp ehpk3pxp  ")

    expect(compactCode).toMatch(/^\d{6}$/)
    expect(spacedCode).toBe(compactCode)
  })

  it("throws a stable error when no usable secret is provided", () => {
    expect(() => generateNewApiTotpCode("   ")).toThrow(
      "new_api_totp_secret_missing",
    )
  })
})
