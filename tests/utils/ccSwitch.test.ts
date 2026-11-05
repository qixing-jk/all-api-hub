import { describe, expect, it, vi } from "vitest"

import {
  CCSWITCH_APP_IDS,
  CCSWITCH_APPS,
  openInCCSwitch,
} from "~/services/integrations/ccSwitch"
import type { CredentialExportData } from "~/services/integrations/credentialExport"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

vi.mock("~/lib/notify", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const mockCredential: CredentialExportData = {
  providerId: "acc",
  providerName: "Example",
  baseUrl: "https://x.test",
  apiKey: "test-api-key",
}

describe("ccSwitch", () => {
  it("preserves supported wire identifiers and target order", () => {
    expect(CCSWITCH_APPS).toEqual([
      "claude",
      "claude-desktop",
      "codex",
      "gemini",
      "agy",
      "pi",
      "mcode",
      "kimi",
      "dsh",
      "omp",
      "grokbuild",
      "hermes",
      "opencode",
      "openclaw",
    ])
  })

  describe("openInCCSwitch", () => {
    it.each([
      CCSWITCH_APP_IDS.OpenCode,
      CCSWITCH_APP_IDS.OpenClaw,
      CCSWITCH_APP_IDS.GrokBuild,
      CCSWITCH_APP_IDS.Hermes,
      CCSWITCH_APP_IDS.ClaudeDesktop,
      CCSWITCH_APP_IDS.Antigravity,
    ] as const)("uses the selected app parameter for %s exports", (app) => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)

      openInCCSwitch({
        credential: mockCredential,
        app,
      })

      expect(openSpy).toHaveBeenCalled()
      const deeplink = atIndex(openSpy.mock.calls, 0)[0] as string
      const parsed = new URL(deeplink)
      expect(parsed.searchParams.get("app")).toBe(app)

      openSpy.mockRestore()
    })

    it.each([
      CCSWITCH_APP_IDS.Pi,
      CCSWITCH_APP_IDS.MiniMaxCode,
      CCSWITCH_APP_IDS.KimiCode,
      CCSWITCH_APP_IDS.DeepSeekHarness,
      CCSWITCH_APP_IDS.OhMyPi,
    ] as const)("requires a model before opening %s", (app) => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)
      expect(openInCCSwitch({ credential: mockCredential, app })).toBe(false)
      expect(
        openInCCSwitch({ credential: mockCredential, app, model: "   " }),
      ).toBe(false)
      expect(openSpy).not.toHaveBeenCalled()
      expect(
        openInCCSwitch({
          credential: mockCredential,
          app,
          model: "test-model",
        }),
      ).toBe(true)
      expect(
        new URL(String(openSpy.mock.calls[0]?.[0])).searchParams.get("model"),
      ).toBe("test-model")
      openSpy.mockRestore()
    })

    it("exports the provided endpoint without app-specific coercion", () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)

      openInCCSwitch({
        credential: mockCredential,
        app: CCSWITCH_APP_IDS.Codex,
        endpoint: "https://x.test/v1",
      })

      expect(openSpy).toHaveBeenCalled()
      const deeplink = atIndex(openSpy.mock.calls, 0)[0] as string
      const parsed = new URL(deeplink)
      expect(parsed.searchParams.get("endpoint")).toBe("https://x.test/v1")

      openSpy.mockRestore()
    })

    it("does not append /v1 automatically for Codex when endpoint is missing it", () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)

      openInCCSwitch({
        credential: { ...mockCredential, baseUrl: "https://x.test" },
        app: CCSWITCH_APP_IDS.Codex,
      })

      const deeplink = atIndex(openSpy.mock.calls, 0)[0] as string
      const parsed = new URL(deeplink)
      expect(parsed.searchParams.get("endpoint")).toBe("https://x.test")

      openSpy.mockRestore()
    })

    it("normalizes endpoint by adding https:// and stripping trailing slash", () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)

      openInCCSwitch({
        credential: mockCredential,
        app: CCSWITCH_APP_IDS.Codex,
        endpoint: "x.test/v1/",
      })

      const deeplink = atIndex(openSpy.mock.calls, 0)[0] as string
      const parsed = new URL(deeplink)
      expect(parsed.searchParams.get("endpoint")).toBe("https://x.test/v1")

      openSpy.mockRestore()
    })

    it("normalizes the Hermes provider name to a lowercase ASCII slug", () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)

      openInCCSwitch({
        credential: mockCredential,
        app: CCSWITCH_APP_IDS.Hermes,
        name: "  Acme 中文_API Gateway__  ",
      })

      const deeplink = atIndex(openSpy.mock.calls, 0)[0] as string
      const parsed = new URL(deeplink)
      expect(parsed.searchParams.get("name")).toBe("acme-api-gateway")

      openSpy.mockRestore()
    })

    it("uses the endpoint hostname when the Hermes name has no ASCII characters", () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)

      openInCCSwitch({
        credential: mockCredential,
        app: CCSWITCH_APP_IDS.Hermes,
        name: "示例中转",
        endpoint: "https://api.example.invalid/v1",
      })

      const deeplink = atIndex(openSpy.mock.calls, 0)[0] as string
      const parsed = new URL(deeplink)
      expect(parsed.searchParams.get("name")).toBe("api-example-invalid")

      openSpy.mockRestore()
    })

    it("preserves Unicode and underscores in provider names for non-Hermes apps", () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)

      openInCCSwitch({
        credential: mockCredential,
        app: CCSWITCH_APP_IDS.GrokBuild,
        name: "示例_Provider",
      })

      const deeplink = atIndex(openSpy.mock.calls, 0)[0] as string
      const parsed = new URL(deeplink)
      expect(parsed.searchParams.get("name")).toBe("示例_Provider")

      openSpy.mockRestore()
    })
  })
})
