/**
 * Automatically dismiss any blocking modals/dialogs (such as release notes, changelog, or intro tours).
 */
export async function dismissModals(page) {
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const modalElements = page.locator(
        '[role="dialog"], [data-slot="modal-overlay"], [data-slot="modal-panel"]',
      )
      const count = await modalElements.count().catch(() => 0)
      if (count === 0) break

      const closeButtons = page.locator(
        '[role="dialog"] button:has-text("关闭"), [role="dialog"] button:has-text("Close"), [role="dialog"] [aria-label="关闭"], [role="dialog"] [aria-label="Close"], button[aria-label="Close"], button[aria-label="关闭"]',
      )
      const btnCount = await closeButtons.count().catch(() => 0)
      if (btnCount > 0) {
        for (let i = 0; i < btnCount; i++) {
          await closeButtons
            .nth(i)
            .click({ force: true, timeout: 800 })
            .catch(() => {})
        }
        await page.waitForTimeout(300)
      } else {
        await page.keyboard.press("Escape").catch(() => {})
        await page.waitForTimeout(300)
      }

      // Keep application state intact when a dialog cannot be dismissed.
      // The caller's normal interaction must expose any remaining blocker.
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
