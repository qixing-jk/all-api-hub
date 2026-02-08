import { beforeEach, describe, expect, it, vi } from "vitest"

import { isFirefox } from "~/utils/browser"
import {
  getProtectionBypassUiVariant,
  isProtectionBypassFirefoxEnv,
  ProtectionBypassUiVariants,
  shouldUseCookieInterceptorForProtectionBypass,
} from "~/utils/protectionBypass"

vi.mock("~/utils/browser", () => ({
  isFirefox: vi.fn(),
}))

const mockedIsFirefox = vi.mocked(isFirefox)

/**
 * Unit tests for protection-bypass UI variant helpers.
 *
 * These tests intentionally mock browser detection so the decision logic can be
 * validated without relying on the underlying WebExtension runtime.
 */
describe("protectionBypass", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedIsFirefox.mockReturnValue(false)
  })

  it("should treat non-Firefox environments as temp-window-only", () => {
    expect(isProtectionBypassFirefoxEnv()).toBe(false)
    expect(shouldUseCookieInterceptorForProtectionBypass()).toBe(false)
    expect(getProtectionBypassUiVariant()).toBe(
      ProtectionBypassUiVariants.TempWindowOnly,
    )
  })

  it("should use cookie-interceptor variant on Firefox", () => {
    mockedIsFirefox.mockReturnValue(true)

    expect(isProtectionBypassFirefoxEnv()).toBe(true)
    expect(shouldUseCookieInterceptorForProtectionBypass()).toBe(true)
    expect(getProtectionBypassUiVariant()).toBe(
      ProtectionBypassUiVariants.TempWindowWithCookieInterceptor,
    )
  })

  it("should return false when Firefox detection throws", () => {
    mockedIsFirefox.mockImplementation(() => {
      throw new Error("boom")
    })

    expect(isProtectionBypassFirefoxEnv()).toBe(false)
    expect(getProtectionBypassUiVariant()).toBe(
      ProtectionBypassUiVariants.TempWindowOnly,
    )
  })
})
