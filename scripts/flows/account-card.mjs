import { dismissModals } from "../cdp/ui-driver.mjs"

/**
 * Common UI flow to test account card visibility and rendering on the options account page.
 */
export async function testAccountCardFlow({ page, extensionId, accountName }) {
  console.log(
    `  [通用流: 账户卡片] 校验 #account 页面中账户 [${accountName}] 的卡片展示...`,
  )

  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  await page.waitForLoadState("domcontentloaded")
  await page.waitForTimeout(1000)
  await dismissModals(page)

  // 如果账号列表较多存在虚拟列表，利用搜索框快速过滤
  const searchInput = page
    .locator('input[placeholder*="搜索"], input[placeholder*="Search"]')
    .first()
  if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await searchInput.fill(accountName)
    await page.waitForTimeout(600)
  }

  const accountCard = page.locator(`text=${accountName}`).first()
  const isCardVisible = await accountCard
    .isVisible({ timeout: 6000 })
    .catch(() => false)

  console.log(
    `  - 账户列表中 [${accountName}] 是否渲染: ${isCardVisible ? "✅ 可见" : "❌ 未检测到"}`,
  )

  return { ok: isCardVisible }
}
