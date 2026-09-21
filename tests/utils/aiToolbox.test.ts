import { describe, expect, it, vi } from "vitest"

import {
  AI_TOOLBOX_APPS,
  AI_TOOLBOX_BASE_URL_STYLES,
  openInAiToolbox,
} from "~/services/integrations/aiToolbox"
import type { CredentialExportData } from "~/services/integrations/credentialExport"

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

/** Read the deeplink handed to `window.open` by the last export call. */
function captureDeeplink(run: () => void) {
  const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)
  run()
  expect(openSpy).toHaveBeenCalled()
  const deeplink = openSpy.mock.calls[0][0] as string
  openSpy.mockRestore()
  return new URL(deeplink)
}

describe("aiToolbox", () => {
  describe("AI_TOOLBOX_APPS", () => {
    it("uses AI Toolbox app ids rather than CC Switch ids", () => {
      // AI Toolbox rejects the whole link on an unknown app, and CC Switch names
      // the same tool `grokbuild`, so a shared list would silently break exports.
      expect(AI_TOOLBOX_APPS).toContain("grok")
      expect(AI_TOOLBOX_APPS).not.toContain("grokbuild")
    })
  })

  describe("openInAiToolbox", () => {
    it.each(AI_TOOLBOX_APPS)(
      "builds an aitoolbox v1 import deeplink for %s",
      (app) => {
        const parsed = captureDeeplink(() =>
          openInAiToolbox({ credential: mockCredential, app }),
        )

        expect(parsed.protocol).toBe("aitoolbox:")
        expect(parsed.host).toBe("v1")
        expect(parsed.pathname).toBe("/import")
        expect(parsed.searchParams.get("resource")).toBe("provider")
        expect(parsed.searchParams.get("app")).toBe(app)
        expect(parsed.searchParams.get("name")).toBe("Example")
        expect(parsed.searchParams.get("apiKey")).toBe("test-api-key")
        expect(parsed.searchParams.get("homepage")).toBe("https://x.test")
      },
    )

    it("maps the endpoint to the baseUrl query parameter AI Toolbox expects", () => {
      const parsed = captureDeeplink(() =>
        openInAiToolbox({
          credential: mockCredential,
          app: "codex",
          endpoint: "https://x.test/v1",
        }),
      )

      expect(parsed.searchParams.get("baseUrl")).toBe("https://x.test/v1")
      expect(parsed.searchParams.get("endpoint")).toBeNull()
    })

    it("normalizes the endpoint by adding https:// and stripping the trailing slash", () => {
      const parsed = captureDeeplink(() =>
        openInAiToolbox({
          credential: mockCredential,
          app: "codex",
          endpoint: "x.test/v1/",
        }),
      )

      expect(parsed.searchParams.get("baseUrl")).toBe("https://x.test/v1")
    })

    it("omits optional parameters when they carry no value", () => {
      const parsed = captureDeeplink(() =>
        openInAiToolbox({ credential: mockCredential, app: "claude" }),
      )

      expect(parsed.searchParams.get("model")).toBeNull()
      expect(parsed.searchParams.get("notes")).toBeNull()
      expect(parsed.searchParams.get("apiFormat")).toBeNull()
      expect(parsed.searchParams.get("category")).toBeNull()
      expect(parsed.searchParams.get("sourceApp")).toBeNull()
    })

    it("passes the model, notes, and API format through when provided", () => {
      const parsed = captureDeeplink(() =>
        openInAiToolbox({
          credential: mockCredential,
          app: "opencode",
          model: "vendor/model-a",
          notes: "relay note",
          apiFormat: "anthropic_messages",
        }),
      )

      expect(parsed.searchParams.get("model")).toBe("vendor/model-a")
      expect(parsed.searchParams.get("notes")).toBe("relay note")
      expect(parsed.searchParams.get("apiFormat")).toBe("anthropic_messages")
    })

    it("reports the base URL style only when the caller supplies one", () => {
      const parsed = captureDeeplink(() =>
        openInAiToolbox({
          credential: mockCredential,
          app: "claude",
          baseUrlStyle: AI_TOOLBOX_BASE_URL_STYLES.Versioned,
        }),
      )

      expect(parsed.searchParams.get("baseUrlStyle")).toBe("versioned")
    })

    it("keeps Unicode and underscores in provider names", () => {
      const parsed = captureDeeplink(() =>
        openInAiToolbox({
          credential: mockCredential,
          app: "claude",
          name: "示例_Provider",
        }),
      )

      expect(parsed.searchParams.get("name")).toBe("示例_Provider")
    })

    it("rejects an app id that only CC Switch supports", () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)

      const opened = openInAiToolbox({
        credential: mockCredential,
        app: "grokbuild" as never,
      })

      expect(opened).toBe(false)
      expect(openSpy).not.toHaveBeenCalled()
      openSpy.mockRestore()
    })

    it("rejects an export without an API key", () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)

      const opened = openInAiToolbox({
        credential: { ...mockCredential, apiKey: "" },
        app: "claude",
      })

      expect(opened).toBe(false)
      expect(openSpy).not.toHaveBeenCalled()
      openSpy.mockRestore()
    })

    it("rejects a non-http endpoint", () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)

      const opened = openInAiToolbox({
        credential: mockCredential,
        app: "claude",
        endpoint: "ftp://x.test",
      })

      expect(opened).toBe(false)
      expect(openSpy).not.toHaveBeenCalled()
      openSpy.mockRestore()
    })
  })
})
