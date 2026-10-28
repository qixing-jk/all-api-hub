import { dismissModals } from "../cdp/ui-driver.mjs"

/** Read an already-open account catalog without navigating or changing filters. */
export async function readModelCatalog({
  page,
  accountId,
  timeoutMs = 15000,
  requirePrices = true,
}) {
  if (!accountId) throw new Error("model_catalog_requires_account_id")
  await page.waitForFunction(
    (expectedSource) => {
      const root = document.querySelector('[data-testid="model-list-page"]')
      const display = root?.querySelector('[data-testid="model-list-display"]')
      return (
        root?.getAttribute("data-model-source") === expectedSource &&
        !root.hasAttribute("data-options-page-pending") &&
        (!display || Boolean(display.querySelector("h3")))
      )
    },
    `account:${accountId}`,
    { timeout: timeoutMs },
  )
  const modelDisplay = page.locator('[data-testid="model-list-display"]')
  const names = await modelDisplay.locator("h3").allTextContents()
  if (!names.some((name) => name.trim()))
    throw new Error("model_catalog_has_no_rendered_models")
  const prices = await modelDisplay.innerText()
  if (requirePrices && !/[$¥￥]\s*\d/.test(prices))
    throw new Error("model_catalog_has_no_rendered_prices")
  return { names, modelDisplay }
}

/** Navigate to the selected account and verify actual model rows. */
export async function testModelCatalogFlow({
  page,
  extensionId,
  accountName,
  accountId,
  timeoutMs = 15000,
  requirePrices = true,
}) {
  if (!accountId) throw new Error("model_catalog_requires_account_id")
  await page.goto(
    `chrome-extension://${extensionId}/options.html#models?accountId=${encodeURIComponent(accountId)}`,
  )
  await page.waitForLoadState("domcontentloaded")
  await dismissModals(page)
  const { names } = await readModelCatalog({
    page,
    accountId,
    timeoutMs,
    requirePrices,
  })
  const countLine = `${names.length} rendered model rows`
  console.log(
    `  ✅ 数据源 [${accountName}] 已展示模型${requirePrices ? "和价格" : ""}：${countLine}`,
  )
  return { ok: true, countLine }
}
