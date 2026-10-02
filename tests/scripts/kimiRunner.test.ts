import { afterEach, describe, expect, it, vi } from "vitest"

import { runKimiUiTest } from "~~/scripts/suites/kimi/ui.mjs"
import { main, parseArgs } from "~~/scripts/test-kimi-e2e-live.mjs"

const { connectDevExtension } = vi.hoisted(() => ({
  connectDevExtension: vi.fn(),
}))
vi.mock("~~/scripts/cdp/client.mjs", () => ({ connectDevExtension }))
vi.mock("~~/scripts/suites/kimi/ui.mjs", () => ({ runKimiUiTest: vi.fn() }))
afterEach(() => vi.restoreAllMocks())

describe("Kimi runner arguments", () => {
  it("fails before mounting a live UI account when session extraction fails", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.mocked(connectDevExtension).mockRejectedValue(new Error("offline"))
    await expect(main(["--suite=ui", "--token="])).rejects.toThrow(
      "kimi_live_ui_requires_access_token",
    )
    expect(runKimiUiTest).not.toHaveBeenCalled()
    expect(connectDevExtension).toHaveBeenCalledTimes(1)
  })
  it("honors the documented --site option", () => {
    expect(parseArgs(["--site=cn", "--suite=probe"])).toMatchObject({
      siteUrl: "https://platform.kimi.com",
      siteType: "kimi",
      suite: "probe",
    })
  })
  it.each(["--site=unknown", "--suite=unknown"])(
    "rejects invalid selection %s",
    (arg) => {
      expect(() => parseArgs([arg])).toThrow()
    },
  )
})
