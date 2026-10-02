import { dismissModals } from "../cdp/ui-driver.mjs"

/** Verify the selected account and actual model rows, independent of UI language. */
export async function testModelCatalogFlow({
  page,
  extensionId,
  accountName,
  accountId,
}) {
  if (!accountId) throw new Error("model_catalog_requires_account_id")
  await page.goto(
    `chrome-extension://${extensionId}/options.html#models?accountId=${encodeURIComponent(accountId)}`,
  )
  await page.waitForLoadState("domcontentloaded")
  await dismissModals(page)
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
    { timeout: 15000 },
  )
  const modelDisplay = page.locator('[data-testid="model-list-display"]')
  const names = await modelDisplay.locator("h3").allTextContents()
  if (!names.some((name) => name.trim()))
    throw new Error("model_catalog_has_no_rendered_models")
  const prices = await modelDisplay.innerText()
  if (!/[$¥￥]\s*\d/.test(prices))
    throw new Error("model_catalog_has_no_rendered_prices")
  const countLine = `${names.length} rendered model rows`
  console.log(`  ✅ 数据源 [${accountName}] 已展示模型和价格：${countLine}`)
  return { ok: true, countLine }
}
