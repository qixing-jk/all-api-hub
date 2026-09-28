import { dismissModals } from "../cdp/ui-driver.mjs"

/**
 * Common UI flow to test model catalog loading and rendering for a specific account data source.
 */
export async function testModelCatalogFlow({ page, extensionId, accountName }) {
  console.log(
    `  [通用流: 模型目录] 校验【模型列表】在数据源 [${accountName}] 下的渲染...`,
  )

  await page.goto(`chrome-extension://${extensionId}/options.html#models`)
  await page.waitForLoadState("domcontentloaded")
  await page.waitForTimeout(1000)
  await dismissModals(page)

  const selectSourceBtn = page
    .getByRole("button")
    .filter({
      hasText: new RegExp(`请选择数据源|选择数据源|${accountName}`, "i"),
    })
    .first()

  let countLine = ""
  if (await selectSourceBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await selectSourceBtn.click()
    await page.waitForTimeout(400)

    const optionItem = page
      .locator('[role="option"], [role="menuitem"], div.cursor-pointer')
      .filter({ hasText: accountName })
      .first()

    if (await optionItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await optionItem.click()
      await page.waitForTimeout(3000)

      const pageText = await page.innerText("body")
      const lines = pageText.split("\n").filter((l) => l.trim().length > 0)
      countLine =
        lines.find((l) => l.includes("总计") && l.includes("模型")) || ""

      console.log(
        `  - 模型列表实际渲染统计: "${countLine || "未直接捕获统计行"}"`,
      )
      if (countLine && !countLine.includes("总计 0 个模型")) {
        console.log("  ✅ 模型列表成功渲染并展示价格条目！")
      }
    }
  }

  return {
    countLine,
    ok: Boolean(countLine && !countLine.includes("总计 0 个模型")),
  }
}
