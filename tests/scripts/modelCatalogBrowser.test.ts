import { chromium, type Browser, type Page } from "@playwright/test"
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest"

import { readModelCatalog } from "~~/scripts/flows/model-catalog.mjs"

let browser: Browser
let page: Page
beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
})
beforeEach(async () => {
  page = await browser.newPage()
})
afterEach(async () => {
  await page.close()
})
afterAll(async () => {
  await browser.close()
})

async function catalog(
  source = "account:fixture",
  contents = "<h3>fixture-model</h3>Input $0.60/M",
) {
  await page.setContent(
    `<main data-testid="model-list-page" data-model-source="${source}"><div data-testid="model-list-display">${contents}</div></main>`,
  )
}

it("does not accept another account's priced catalog", async () => {
  await catalog("account:other")
  await expect(
    readModelCatalog({ page, accountId: "fixture", timeoutMs: 200 }),
  ).rejects.toThrow()
})

it("waits for the selected source to finish loading before reading its rows", async () => {
  await catalog()
  await page.getByTestId("model-list-page").evaluate((root) => {
    root.setAttribute("data-options-page-pending", "")
    setTimeout(() => {
      root.querySelector("h3")!.textContent = "loaded-model"
      root.removeAttribute("data-options-page-pending")
    }, 100)
  })
  const result = await readModelCatalog({
    page,
    accountId: "fixture",
    timeoutMs: 1500,
  })
  expect(result.names).toEqual(["loaded-model"])
  expect(await result.modelDisplay.isVisible()).toBe(true)
})

it("rejects a completed empty catalog instead of trusting its container", async () => {
  await catalog("account:fixture", "")
  await page
    .getByTestId("model-list-display")
    .evaluate((display) => display.remove())
  await expect(
    readModelCatalog({ page, accountId: "fixture", timeoutMs: 200 }),
  ).rejects.toThrow("model_catalog_has_no_rendered_models")
})

it("requires rendered monetary prices unless catalog-only coverage is explicit", async () => {
  await catalog(
    "account:fixture",
    "<h3>native-credit-model</h3>100 native credits",
  )
  await expect(
    readModelCatalog({ page, accountId: "fixture", timeoutMs: 1000 }),
  ).rejects.toThrow("model_catalog_has_no_rendered_prices")
  const result = await readModelCatalog({
    page,
    accountId: "fixture",
    requirePrices: false,
  })
  expect(result.names).toEqual(["native-credit-model"])
})
