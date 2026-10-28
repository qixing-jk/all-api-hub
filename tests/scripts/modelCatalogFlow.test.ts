import type { Page } from "@playwright/test"
import { afterEach, describe, expect, it, vi } from "vitest"

import { testModelCatalogFlow } from "~~/scripts/flows/model-catalog.mjs"

vi.mock("~~/scripts/cdp/ui-driver.mjs", () => ({ dismissModals: vi.fn() }))
afterEach(() => vi.restoreAllMocks())

describe("live model catalog assertions", () => {
  const options = {
    extensionId: "test",
    accountName: "Fixture",
    accountId: "fixture-id",
  }
  it.each([undefined, 30000])(
    "honors the bounded provider readiness timeout (%s)",
    async (timeoutMs) => {
      const page = {
        goto: vi.fn(),
        waitForLoadState: vi.fn(),
        waitForFunction: vi.fn(),
        locator: () => ({
          locator: () => ({ allTextContents: async () => [] }),
        }),
      } as unknown as Page
      await expect(
        testModelCatalogFlow({ ...options, page, timeoutMs }),
      ).rejects.toThrow("model_catalog_has_no_rendered_models")
      expect(page.waitForFunction).toHaveBeenCalledWith(
        expect.any(Function),
        "account:fixture-id",
        { timeout: timeoutMs ?? 15000 },
      )
    },
  )
  it("reports an empty completed catalog without timing out", async () => {
    const root = {
      getAttribute: () => "account:fixture-id",
      hasAttribute: () => false,
      querySelector: () => null,
    }
    vi.stubGlobal("document", { querySelector: () => root })
    const page = {
      goto: vi.fn(),
      waitForLoadState: vi.fn(),
      waitForFunction: vi.fn(async (predicate, source) => {
        if (!predicate(source)) throw new Error("catalog wait timed out")
      }),
      locator: () => ({ locator: () => ({ allTextContents: async () => [] }) }),
    } as unknown as Page
    try {
      await expect(testModelCatalogFlow({ ...options, page })).rejects.toThrow(
        "model_catalog_has_no_rendered_models",
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })
  it("does not report success when the requested source never loads", async () => {
    const page = {
      goto: vi.fn(),
      waitForLoadState: vi.fn(),
      waitForFunction: vi
        .fn()
        .mockRejectedValue(new Error("source not selected")),
      innerText: vi.fn(async () => "总计 99 个模型"),
    } as unknown as Page
    await expect(testModelCatalogFlow({ ...options, page })).rejects.toThrow(
      "source not selected",
    )
  })
  it.each(["", "Price unavailable"])(
    "rejects unpriced rows (%s) rather than trusting a model count",
    async (priceText) => {
      const names = { allTextContents: async () => ["kimi-k2.6"] }
      const page = {
        goto: vi.fn(),
        waitForLoadState: vi.fn(),
        waitForFunction: vi.fn(),
        locator: () => ({
          locator: () => names,
          innerText: async () => priceText,
        }),
      } as unknown as Page
      await expect(testModelCatalogFlow({ ...options, page })).rejects.toThrow(
        "model_catalog_has_no_rendered_prices",
      )
    },
  )
  it("accepts actual model names and prices regardless of the statistics language", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    const page = {
      goto: vi.fn(),
      waitForLoadState: vi.fn(),
      waitForFunction: vi.fn(),
      locator: () => ({
        locator: () => ({ allTextContents: async () => ["kimi-k2.6"] }),
        innerText: async () => "kimi-k2.6 Input $0.60 Output $2.50",
      }),
    } as unknown as Page
    await expect(
      testModelCatalogFlow({ ...options, page }),
    ).resolves.toMatchObject({ ok: true })
  })

  it("allows an explicit catalog-only inspection without claiming pricing coverage", async () => {
    const page = {
      goto: vi.fn(),
      waitForLoadState: vi.fn(),
      waitForFunction: vi.fn(),
      locator: () => ({
        locator: () => ({ allTextContents: async () => ["unpriced-model"] }),
        innerText: async () => "Price unavailable",
      }),
    } as unknown as Page
    await expect(
      testModelCatalogFlow({ ...options, page, requirePrices: false }),
    ).resolves.toMatchObject({ ok: true })
  })
})
