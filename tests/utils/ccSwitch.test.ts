import { describe, expect, it, vi } from "vitest"

import { buildDisplaySiteData } from "~/tests/test-utils/factories"
import type { ApiToken } from "~/types"
import { openInCCSwitch } from "~/utils/ccSwitch"

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const mockAccount = buildDisplaySiteData({
  id: "acc",
  name: "Example",
  baseUrl: "https://x.test",
})

const mockToken: ApiToken = {
  id: 1,
  user_id: 1,
  key: "test-api-key",
  name: "Test Token",
  created_time: Date.now(),
  accessed_time: Date.now(),
  expired_time: -1,
  remain_quota: 1000000,
  used_quota: 0,
  unlimited_quota: true,
  status: 1,
}

describe("ccSwitch", () => {
  describe("openInCCSwitch", () => {
    it("exports the provided endpoint without app-specific coercion", () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)

      openInCCSwitch({
        account: mockAccount,
        token: mockToken,
        app: "codex",
        endpoint: "https://x.test/v1",
      })

      expect(openSpy).toHaveBeenCalled()
      const deeplink = openSpy.mock.calls[0][0] as string
      const parsed = new URL(deeplink)
      expect(parsed.searchParams.get("endpoint")).toBe("https://x.test/v1")

      openSpy.mockRestore()
    })

    it("does not append /v1 automatically for Codex when endpoint is missing it", () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)

      openInCCSwitch({
        account: { ...mockAccount, baseUrl: "https://x.test" },
        token: mockToken,
        app: "codex",
      })

      const deeplink = openSpy.mock.calls[0][0] as string
      const parsed = new URL(deeplink)
      expect(parsed.searchParams.get("endpoint")).toBe("https://x.test")

      openSpy.mockRestore()
    })

    it("normalizes endpoint by adding https:// and stripping trailing slash", () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)

      openInCCSwitch({
        account: mockAccount,
        token: mockToken,
        app: "codex",
        endpoint: "x.test/v1/",
      })

      const deeplink = openSpy.mock.calls[0][0] as string
      const parsed = new URL(deeplink)
      expect(parsed.searchParams.get("endpoint")).toBe("https://x.test/v1")

      openSpy.mockRestore()
    })
  })
})
