import { describe, expect, it, vi } from "vitest"

import { openInCCSwitch } from "~/utils/ccSwitch"

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const mockAccount = {
  id: "acc",
  name: "Example",
  baseUrl: "https://x.test",
} as any

const mockToken = { id: "tok", key: "sk-test" } as any

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
