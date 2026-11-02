import type { Page } from "@playwright/test"
import { afterEach, expect, it, vi } from "vitest"

import { navigateExtensionPage } from "~~/scripts/cdp/ui-driver.mjs"

afterEach(() => vi.unstubAllGlobals())

it.each([
  ["#models?accountId=a", "#models?accountId=a"],
  ["", ""],
])(
  "changes a mounted options route to %s without reloading its document",
  async (targetHash, expectedHash) => {
    let hash = "#account"
    const location = {
      get hash() {
        return hash
      },
      set hash(value: string) {
        hash = value
      },
    }
    vi.stubGlobal("window", { location })
    const goto = vi.fn()
    const page = {
      url: () => `chrome-extension://test/options.html${hash}`,
      evaluate: async (callback: (value: string) => void, value: string) =>
        callback(value),
      goto,
    } as unknown as Page
    await navigateExtensionPage(
      page,
      `chrome-extension://test/options.html${targetHash}`,
    )
    expect(hash).toBe(expectedHash)
    await navigateExtensionPage(
      page,
      `chrome-extension://test/options.html${targetHash}`,
    )
    expect(hash).toBe(expectedHash)
    expect(goto).not.toHaveBeenCalled()
  },
)

it("loads a different extension document and waits for its DOM", async () => {
  const goto = vi.fn(async () => {})
  const waitForLoadState = vi.fn(async () => {})
  const page = {
    url: () => "chrome-extension://test/popup.html",
    goto,
    waitForLoadState,
  } as unknown as Page
  await navigateExtensionPage(
    page,
    "chrome-extension://test/options.html#account",
  )
  expect(goto).toHaveBeenCalledWith(
    "chrome-extension://test/options.html#account",
    {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    },
  )
  expect(waitForLoadState).toHaveBeenCalledWith("domcontentloaded")
})
