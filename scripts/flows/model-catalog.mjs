import { dismissModals } from "../cdp/ui-driver.mjs"

/**
 * Common UI flow to test model catalog loading and rendering for a specific account data source.
 */
export async function testModelCatalogFlow({
  page,
  extensionId,
  accountName,
  accountId,
}) {
  console.log(
    `  [通用流: 模型目录] 校验【模型列表】在数据源 [${accountName}] 下的渲染...`,
  )

  const routeUrl = accountId
    ? `chrome-extension://${extensionId}/options.html#models?accountId=${accountId}`
    : `chrome-extension://${extensionId}/options.html#models`

  await page.goto(routeUrl)
  await page.waitForLoadState("domcontentloaded")
  await page.waitForTimeout(1200)
  await dismissModals(page)

  // 1. 若尚未通过路由自动选中目标账号，通过选择器下拉切换
  const selectSourceBtn = page
    .locator(
      '[data-testid="model-list-source-selector"], button[role="combobox"]',
    )
    .first()

  if (await selectSourceBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    const currentText = await selectSourceBtn.innerText().catch(() => "")
    if (!currentText.includes(accountName)) {
      await selectSourceBtn.click({ timeout: 3000 }).catch(async () => {
        await dismissModals(page)
        await selectSourceBtn
          .click({ force: true, timeout: 3000 })
          .catch(() => {})
      })
      await page.waitForTimeout(600)

      const optionItem = page
        .locator(
          '[role="option"], [data-slot="select-item"], [data-slot="combobox-item"], div.cursor-pointer',
        )
        .filter({ hasText: accountName })
        .first()

      if (await optionItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await optionItem.click({ force: true }).catch(() => {})
        await page.waitForTimeout(1500)
      }
    }
  }

  // 2. 等待模型数据加载完成
  await page.waitForTimeout(2500)
  await dismissModals(page)

  const pageText = await page.innerText("body")
  const lines = pageText.split("\n").filter((l) => l.trim().length > 0)
  const countLine =
    lines.find((l) => l.includes("总计") && l.includes("模型")) || ""

  console.log(`  - 模型列表实际渲染统计: "${countLine || "未直接捕获统计行"}"`)
  if (countLine && !countLine.includes("总计 0 个模型")) {
    console.log("  ✅ 模型列表成功渲染并展示价格条目！")
  }

  return {
    countLine,
    ok: Boolean(countLine && !countLine.includes("总计 0 个模型")),
  }
}
