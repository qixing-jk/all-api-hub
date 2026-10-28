import path from "node:path"

import { UPDATE_LOG_DIALOG_TEST_IDS as updateLog } from "../../src/features/UpdateLog/testIds.ts"
import { I18NEXT_LANGUAGE_STORAGE_KEY } from "../../src/services/core/storageKeys.ts"

/** Configure an extension-owned page before its first navigation. */
export async function configureExtensionPage(
  page,
  { language, viewport, dismissUpdateLog = false } = {},
) {
  if (viewport) await page.setViewportSize(viewport)
  if (language)
    await page.addInitScript(
      ({ key, language }) => localStorage.setItem(key, language),
      { key: I18NEXT_LANGUAGE_STORAGE_KEY, language },
    )
  if (dismissUpdateLog)
    await page.addLocatorHandler(page.getByTestId(updateLog.root), () =>
      page.getByTestId(updateLog.closeButton).click(),
    )
}

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
  language,
  viewport,
  dismissUpdateLog = false,
}) {
  const page = await context.newPage()
  try {
    await configureExtensionPage(page, { language, viewport, dismissUpdateLog })
    const targetUrl = `chrome-extension://${extensionId}/${route}`
    await page.goto(targetUrl)
    await page.waitForLoadState("domcontentloaded")
    await page.waitForTimeout(600)

    if (autoDismissModals) {
      await dismissModals(page)
    }
    return page
  } catch (error) {
    await page.close().catch(() => {})
    throw error
  }
}

/** Capture a UI checkpoint and record the file actually written. */
export function createUiCapture({
  page,
  directory,
  screenshots,
  mask = [],
  bringToFront = false,
  fallbackToPage = false,
  timeoutMs,
}) {
  return async (name, target = page) => {
    const filename = name.endsWith(".png") ? name : `${name}.png`
    if (path.basename(filename) !== filename || filename.includes("\\"))
      throw new Error("UI capture name must be a filename")
    const owner = typeof target.page === "function" ? target.page() : target
    if (bringToFront) await owner.bringToFront()
    let written = filename
    const options = {
      animations: "disabled",
      mask,
      ...(timeoutMs === undefined ? {} : { timeout: timeoutMs }),
    }
    try {
      await target.screenshot({
        ...options,
        path: path.join(directory, filename),
      })
    } catch (error) {
      if (!fallbackToPage || target === owner) throw error
      written = `${filename.slice(0, -4)}-page.png`
      await owner.screenshot({
        ...options,
        path: path.join(directory, written),
      })
    }
    screenshots?.push(written)
  }
}
