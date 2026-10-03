import { afterEach, describe, expect, it, vi } from "vitest"

import { runGrsaiUiTest } from "~~/scripts/suites/grsai/ui.mjs"
import { main, parseArgs } from "~~/scripts/test-grsai-e2e-live.mjs"

const { connectDevExtension } = vi.hoisted(() => ({
  connectDevExtension: vi.fn(),
}))
vi.mock("~~/scripts/cdp/client.mjs", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("~~/scripts/cdp/client.mjs")>()
  return { ...original, connectDevExtension }
})
vi.mock("~~/scripts/suites/grsai/ui.mjs", () => ({ runGrsaiUiTest: vi.fn() }))
afterEach(() => vi.restoreAllMocks())

describe("Grsai runner arguments", () => {
  it("rejects an unknown suite before doing any work", () => {
    expect(() => parseArgs(["--suite=typo"])).toThrow("suite")
  })

  it("fails fast when the CDP extension is not reachable", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.mocked(connectDevExtension).mockRejectedValue(new Error("offline"))
    await expect(main(["--suite=ui"])).rejects.toThrow("offline")
    expect(runGrsaiUiTest).not.toHaveBeenCalled()
  })

  it("passes the session token through to the UI suite", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.mocked(connectDevExtension).mockResolvedValue({
      browser: {} as never,
      context: {} as never,
      extensionId: "ext-id",
      serviceWorker: {} as never,
      close: vi.fn(),
    })
    vi.mocked(runGrsaiUiTest).mockResolvedValue(undefined)

    await main(["--suite=ui", "--token=session-jwt"])

    expect(runGrsaiUiTest).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "session-jwt",
        siteUrl: "https://grsai.com",
      }),
    )
  })

  it("honors the documented --url and --suite options", () => {
    expect(
      parseArgs(["--url=https://grsai.ai", "--suite=probe"]),
    ).toMatchObject({
      siteUrl: "https://grsai.ai",
      suite: "probe",
    })
  })
})
