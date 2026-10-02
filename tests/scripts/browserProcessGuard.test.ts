import { describe, expect, it } from "vitest"

import { assertBrowsersClosed } from "~~/scripts/sync-extension-profile.mjs"

describe("profile sync browser process guard", () => {
  it("allows Electron crash handlers", () => {
    expect(() =>
      assertBrowsersClosed("chrome_crashpad\nchrome_crashpad_handler\nCode\n"),
    ).not.toThrow()
  })
  it.each([
    "chrome",
    "msedge",
    "/usr/bin/chromium",
    "Microsoft Edge",
    "Google Chrome",
    "Brave Browser",
    "google-chrome-stable",
  ])("blocks the browser %s", (name) => {
    expect(() => assertBrowsersClosed(`${name}\n`)).toThrow("请先关闭")
  })
})
