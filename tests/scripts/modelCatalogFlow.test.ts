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
})
