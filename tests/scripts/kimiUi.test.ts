import type { BrowserContext, Worker } from "@playwright/test"
import { afterEach, describe, expect, it, vi } from "vitest"

import { runKimiUiTest } from "~~/scripts/suites/kimi/ui.mjs"

const { openExtensionPage, withTemporaryAccount } = vi.hoisted(() => ({
  openExtensionPage: vi.fn(),
  withTemporaryAccount: vi.fn(),
}))
vi.mock("~~/scripts/cdp/ui-driver.mjs", () => ({
  openExtensionPage,
  dismissModals: vi.fn(),
}))
vi.mock("~~/scripts/cdp/sandbox.mjs", () => ({ withTemporaryAccount }))

afterEach(() => vi.restoreAllMocks())

describe("Kimi UI auto-detection verification", () => {
  it("accepts the product's capitalized Kimi label before starting sandbox checks", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    const control = {
      waitFor: async () => {},
      click: async () => {},
      fill: async () => {},
      isVisible: async () => true,
      innerText: async () => "Kimi Global",
      inputValue: async () => "user",
      evaluateAll: async () => ["7.2"],
      filter: () => control,
      first: () => control,
    }
    const page = {
      goto: async () => {},
      close: async () => {},
      waitForTimeout: async () => {},
      locator: () => control,
    }
    openExtensionPage.mockResolvedValueOnce(page)
    // Stop before any account write; reaching this boundary proves the detection checks passed.
    withTemporaryAccount.mockRejectedValueOnce(new Error("sandbox boundary"))
    await expect(
      runKimiUiTest({
        context: { newPage: async () => page } as unknown as BrowserContext,
        extensionId: "test",
        serviceWorker: undefined as unknown as Worker,
      }),
    ).rejects.toThrow("sandbox boundary")
  })
})
