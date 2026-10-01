import type { Page } from "@playwright/test"
import { describe, expect, it, vi } from "vitest"

import { dismissModals } from "~~/scripts/cdp/ui-driver.mjs"

describe("dismissModals", () => {
  it("leaves a non-dismissible dialog intact for the calling flow to detect", async () => {
    const dialog = {
      count: vi.fn(async () => 1),
      first: () => dialog,
      isVisible: vi.fn(async () => true),
    }
    const page = {
      locator: (selector: string) =>
        selector.includes("button") ? { count: async () => 0 } : dialog,
      keyboard: { press: vi.fn(async () => {}) },
      waitForTimeout: vi.fn(async () => {}),
      evaluate: vi.fn(async () => {}),
    }

    await dismissModals(page as unknown as Page)

    expect(page.keyboard.press).toHaveBeenCalledWith("Escape")
    expect(page.evaluate).not.toHaveBeenCalled()
  })
})
