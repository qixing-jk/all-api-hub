import { afterEach, describe, expect, it, vi } from "vitest"
import { browser } from "wxt/browser"
import { injectScript } from "wxt/utils/inject-script"

describe("WXT injectScript Firefox MV2 compatibility", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("resolves after appending an inline MV2 script without load events", async () => {
    vi.spyOn(browser.runtime, "getManifest").mockReturnValue({
      manifest_version: 2,
    } as ReturnType<typeof browser.runtime.getManifest>)
    vi.spyOn(browser.runtime, "getURL").mockImplementation(
      (path) => `moz-extension://example${path}`,
    )
    const script = {
      text: "",
      src: "",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      remove: vi.fn(),
    } as unknown as HTMLScriptElement
    const documentFixture = {
      createElement: vi.fn(() => script),
      head: {
        append: vi.fn(),
      },
      documentElement: null,
    } as unknown as Document
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue("window.__exampleInjected = true"),
      }),
    )
    vi.stubGlobal("document", documentFixture)

    const outcome = await Promise.race([
      injectScript("/openrouter-clerk-session.js").then(() => "resolved"),
      new Promise<"timeout">((resolve) => {
        setTimeout(() => resolve("timeout"), 50)
      }),
    ])

    expect(outcome).toBe("resolved")
  })
})
