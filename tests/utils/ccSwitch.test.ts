import { describe, expect, it, vi } from "vitest"

import { openInCCSwitch } from "~/services/integrations/ccSwitch"
import type { ApiToken } from "~/types"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

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
    it.each(["opencode", "openclaw", "grokbuild", "hermes"] as const)(
      "uses the selected app parameter for %s exports",
      (app) => {
        const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)

        openInCCSwitch({
          account: mockAccount,
          token: mockToken,
          app,
        })

        expect(openSpy).toHaveBeenCalled()
        const deeplink = openSpy.mock.calls[0][0] as string
        const parsed = new URL(deeplink)
        expect(parsed.searchParams.get("app")).toBe(app)

        openSpy.mockRestore()
      },
    )

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

    it("normalizes the Hermes provider name to a lowercase ASCII slug", () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)

      openInCCSwitch({
        account: mockAccount,
        token: mockToken,
        app: "hermes",
        name: "  Acme 中文_API Gateway__  ",
      })

      const deeplink = openSpy.mock.calls[0][0] as string
      const parsed = new URL(deeplink)
      expect(parsed.searchParams.get("name")).toBe("acme-api-gateway")

      openSpy.mockRestore()
    })

    it("uses the endpoint hostname when the Hermes name has no ASCII characters", () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)

      openInCCSwitch({
        account: mockAccount,
        token: mockToken,
        app: "hermes",
        name: "示例中转",
        endpoint: "https://api.example.invalid/v1",
      })

      const deeplink = openSpy.mock.calls[0][0] as string
      const parsed = new URL(deeplink)
      expect(parsed.searchParams.get("name")).toBe("api-example-invalid")

      openSpy.mockRestore()
    })

    it("preserves Unicode and underscores in provider names for non-Hermes apps", () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)

      openInCCSwitch({
        account: mockAccount,
        token: mockToken,
        app: "grokbuild",
        name: "示例_Provider",
      })

      const deeplink = openSpy.mock.calls[0][0] as string
      const parsed = new URL(deeplink)
      expect(parsed.searchParams.get("name")).toBe("示例_Provider")

      openSpy.mockRestore()
    })
  })
})
