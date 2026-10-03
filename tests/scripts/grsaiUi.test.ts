import { afterEach, describe, expect, it, vi } from "vitest"

import { runGrsaiUiTest } from "~~/scripts/suites/grsai/ui.mjs"

const {
  withTemporaryAccount,
  openExtensionPage,
  testAccountCardFlow,
  testModelCatalogFlow,
} = vi.hoisted(() => ({
  withTemporaryAccount: vi.fn(),
  openExtensionPage: vi.fn(),
  testAccountCardFlow: vi.fn(),
  testModelCatalogFlow: vi.fn(),
}))
vi.mock("~~/scripts/cdp/sandbox.mjs", () => ({ withTemporaryAccount }))
vi.mock("~~/scripts/cdp/ui-driver.mjs", () => ({
  openExtensionPage,
  dismissModals: vi.fn(),
}))
vi.mock("~~/scripts/flows/account-card.mjs", () => ({ testAccountCardFlow }))
vi.mock("~~/scripts/flows/model-catalog.mjs", () => ({ testModelCatalogFlow }))
afterEach(() => vi.restoreAllMocks())

describe("Grsai live UI cleanup", () => {
  it.each(["success", "models", "inventory"])(
    "cleans owned keys or reports cleanup failure: %s",
    async (failure) => {
      vi.spyOn(console, "log").mockImplementation(() => {})
      const actions: string[] = []
      let keyExists = false
      let currentName = ""
      let inventoryFailed = false
      let unlimited = true
      const fieldValues: Record<string, string> = {}
      const submittedLimits: Array<{
        unlimited: boolean
        credits?: string
        expiry?: string
      }> = []
      const locator = (selector: string): any => ({
        first: () => locator(selector),
        or: () => locator(selector),
        filter: () => locator(selector),
        getByRole: (_role: string, options: { name: string }) =>
          locator(options.name),
        isVisible: async () => true,
        innerText: async () => "",
        fill: async (value: string) => {
          fieldValues[selector] = value
          if (selector.includes("Name")) currentName = value
        },
        getAttribute: async () => String(unlimited),
        count: async () => (keyExists && !inventoryFailed ? 1 : 0),
        waitFor: async () => {},
        click: async () => {
          actions.push(selector)
          if (selector === "Unlimited Quota") unlimited = !unlimited
          if (selector.includes("submit")) {
            keyExists = true
            submittedLimits.push({
              unlimited,
              credits: fieldValues["Remaining credits"],
              expiry: fieldValues["Expiration Time"],
            })
          }
          if (selector.includes("delete-confirm")) keyExists = false
        },
      })
      const page: any = {
        locator,
        getByTestId: locator,
        getByLabel: locator,
        getByRole: (_role: string, options: { name: string }) =>
          locator(options.name),
        addInitScript: vi.fn(),
        goto: vi.fn(),
        reload: vi.fn(async () => {
          inventoryFailed = failure === "inventory"
        }),
        waitForLoadState: vi.fn(),
        waitForTimeout: vi.fn(),
        innerText: async () => (inventoryFailed ? "Failed to load keys" : ""),
        close: vi.fn(async () => {}),
      }
      vi.mocked(withTemporaryAccount).mockImplementation(
        async (_worker: unknown, fixture: unknown, fn: any) => fn(fixture),
      )
      vi.mocked(openExtensionPage).mockResolvedValue(page)
      vi.mocked(testAccountCardFlow).mockResolvedValue({ ok: true })
      vi.mocked(testModelCatalogFlow).mockImplementation(async () => {
        if (failure === "models") throw new Error("models unavailable")
        return { ok: true, countLine: "1 model" }
      })
      const result = runGrsaiUiTest({
        context: { newPage: async () => page } as any,
        extensionId: "ext",
        serviceWorker: {} as any,
        token: "session",
      })
      if (failure === "inventory") {
        await expect(result).rejects.toThrow("Grsai key cleanup failed")
        expect(keyExists).toBe(true)
        return
      }
      if (failure === "models")
        await expect(result).rejects.toThrow("models unavailable")
      else await result
      expect(submittedLimits).toHaveLength(2)
      for (const limits of submittedLimits) {
        expect(limits.unlimited).toBe(false)
        expect(Number(limits.credits)).toBe(100)
        const expiry = new Date(limits.expiry!).getTime()
        expect(expiry).toBeGreaterThan(Date.now())
        expect(expiry).toBeLessThanOrEqual(Date.now() + 30 * 60_000)
      }
      expect(currentName).toContain("AAH E2E Grsai")
      expect(actions.some((action) => action.includes("delete-confirm"))).toBe(
        true,
      )
      expect(keyExists).toBe(false)
    },
  )
})
