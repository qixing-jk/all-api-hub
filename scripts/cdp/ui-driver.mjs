/**
 * Automatically dismiss any blocking modals/dialogs (such as release notes, changelog, or intro tours).
 */
export async function dismissModals(page) {
  try {
    const dialog = page.locator('[role="dialog"]').first()
    if (await dialog.isVisible({ timeout: 1200 }).catch(() => false)) {
      const closeBtn = dialog
        .getByRole("button")
        .filter({ hasText: /关闭|Close|知道了|Got it|好的|稍后/i })
        .first()

      if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await closeBtn.click().catch(() => {})
        await page.waitForTimeout(300)
      } else {
        await page.keyboard.press("Escape").catch(() => {})
        await page.waitForTimeout(300)
      }
    }
  } catch {
    // 弹窗处理非核心阻塞，忽略
  }
}

/**
 * Open an extension page, wait for load, and optionally clear any blocking dialogs.
 */
export async function openExtensionPage({
  context,
  extensionId,
  route = "options.html",
  autoDismissModals = true,
}) {
  const page = await context.newPage()
  const targetUrl = `chrome-extension://${extensionId}/${route}`
  await page.goto(targetUrl)
  await page.waitForLoadState("domcontentloaded")
  await page.waitForTimeout(600)

  if (autoDismissModals) {
    await dismissModals(page)
  }

  return page
}
