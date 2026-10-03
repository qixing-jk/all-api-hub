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
  it.each([false, true])(
    "deletes the owned key even when model validation fails: %s",
    async (failModels) => {
      vi.spyOn(console, "log").mockImplementation(() => {})
      const actions: string[] = []
      let keyExists = false
      let currentName = ""
      const locator = (selector: string): any => ({
        first: () => locator(selector),
        or: () => locator(selector),
        filter: () => locator(selector),
        getByRole: (_role: string, options: { name: string }) =>
          locator(options.name),
        isVisible: async () => true,
        innerText: async () => "",
        fill: async (value: string) => {
          currentName = value
        },
        count: async () => (keyExists ? 1 : 0),
        waitFor: async () => {},
        click: async () => {
          actions.push(selector)
          if (selector.includes("submit")) keyExists = true
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
        reload: vi.fn(),
        waitForLoadState: vi.fn(),
        waitForTimeout: vi.fn(),
        innerText: async () => "",
        close: vi.fn(async () => {}),
      }
      vi.mocked(withTemporaryAccount).mockImplementation(
        async (_worker: unknown, fixture: unknown, fn: any) => fn(fixture),
      )
      vi.mocked(openExtensionPage).mockResolvedValue(page)
      vi.mocked(testAccountCardFlow).mockResolvedValue({ ok: true })
      vi.mocked(testModelCatalogFlow).mockImplementation(async () => {
        if (failModels) throw new Error("models unavailable")
        return { ok: true, countLine: "1 model" }
      })
      const result = runGrsaiUiTest({
        context: { newPage: async () => page } as any,
        extensionId: "ext",
        serviceWorker: {} as any,
        token: "session",
      })
      if (failModels) await expect(result).rejects.toThrow("models unavailable")
      else await result
      expect(currentName).toContain("AAH E2E Grsai")
      expect(actions.some((action) => action.includes("delete-confirm"))).toBe(
        true,
      )
      expect(keyExists).toBe(false)
    },
  )
})
