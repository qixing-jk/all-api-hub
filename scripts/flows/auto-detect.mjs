/**
 * Common UI flow to test the Add Account dialog and site type auto-detection.
 */
export async function testAutoDetectFlow({
  page,
  targetUrl,
  expectedType = "",
}) {
  console.log(
    `  [通用流: 自动识别] 校验【新增账号】弹窗对站点 [${targetUrl}] 的识别响应...`,
  )

  const addAccountBtn = page
    .getByRole("button")
    .filter({ hasText: /新增账号|添加账号|Add Account/i })
    .first()

  await addAccountBtn.waitFor({ state: "visible", timeout: 8000 })
  await addAccountBtn.click()
  await page.waitForTimeout(600)

  const dialog = page.locator('[role="dialog"]').first()
  await dialog.waitFor({ state: "visible", timeout: 5000 })

  const siteUrlInput = dialog
    .locator('#site-url, input[placeholder*="http"]')
    .first()

  if (await siteUrlInput.isVisible()) {
    await siteUrlInput.fill(targetUrl)
    await siteUrlInput.dispatchEvent("change")
    await page.waitForTimeout(1500)
  }

  const dialogText = await dialog.innerText()
  const isDetected = expectedType
    ? dialogText.toLowerCase().includes(expectedType.toLowerCase())
    : dialogText.includes("成功") || dialogText.includes("检测")

  console.log(
    `  - 弹窗输入目标站点 [${targetUrl}] 识别状态: ${isDetected ? "✅ 匹配预期" : "ℹ️ 待手动确认"}`,
  )

  const cancelBtn = dialog
    .getByRole("button")
    .filter({ hasText: /取消|Cancel|关闭|Close/i })
    .first()

  if (await cancelBtn.isVisible()) {
    await cancelBtn.click()
    await page.waitForTimeout(400)
  }

  return { ok: isDetected, dialogText }
}
