import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { forceExtensionLanguage } from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

test("default notice keeps multiple actions readable below its copy", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  await forceExtensionLanguage(page, "en")
  const worker = await getServiceWorker(context)
  await worker.evaluate(async (key) => {
    await (globalThis as any).chrome.storage.local.set({
      [key]: {
        flow: "account-auto-detect",
        status: "pending",
        startedAt: Date.now() - 2000,
        interruptedAt: Date.now() - 1000,
      },
    })
  }, STORAGE_KEYS.POPUP_INTERRUPTION_HINT)
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await waitForExtensionRoot(page)
  const notice = page.getByRole("status", {
    name: "Auto-detect may have been interrupted",
  })
  await expect(notice).toBeVisible()
  await expect(notice.getByRole("button")).toHaveCount(2)
  await captureVisualViews({
    page,
    ready: notice,
    id: "shared-notice-multiple-actions",
    extensionDir,
  })
  for (const width of [410, 320]) {
    await page.setViewportSize({ width, height: 900 })
    for (const textSize of ["default", "extra-large"]) {
      for (const density of ["default", "compact", "comfortable"]) {
        await page.evaluate(
          ({ textSize, density }) => {
            document.documentElement.setAttribute(
              "data-theme-text-size",
              textSize,
            )
            document.documentElement.setAttribute("data-theme-density", density)
          },
          { textSize, density },
        )
        const metrics = await notice.evaluate((element) => {
          const title = document.getElementById(
            element.getAttribute("aria-labelledby")!,
          )!
          const description = document.getElementById(
            element.getAttribute("aria-describedby")!,
          )!
          const bounds = element.getBoundingClientRect()
          const iconBounds = element
            .querySelector("[aria-hidden=true] svg")!
            .getBoundingClientRect()
          const titleBounds = title.getBoundingClientRect()
          return {
            iconAlignmentError: Math.abs(
              iconBounds.top +
                iconBounds.height / 2 -
                (titleBounds.top +
                  parseFloat(getComputedStyle(title).lineHeight) / 2),
            ),
            titleSize: parseFloat(getComputedStyle(title).fontSize),
            bodySize: parseFloat(getComputedStyle(description).fontSize),
            descriptionBottom: description.getBoundingClientRect().bottom,
            left: bounds.left,
            right: bounds.right,
            overflows: element.scrollWidth > element.clientWidth,
            actions: Array.from(element.querySelectorAll("button")).map(
              (button) => {
                const box = button.getBoundingClientRect()
                return {
                  left: box.left,
                  right: box.right,
                  top: box.top,
                  size: parseFloat(getComputedStyle(button).fontSize),
                  clipped: button.scrollHeight > button.clientHeight,
                }
              },
            ),
          }
        })
        expect(metrics.titleSize).toBeGreaterThan(metrics.bodySize)
        expect(metrics.iconAlignmentError).toBeLessThanOrEqual(1)
        expect(metrics.overflows).toBe(false)
        for (const action of metrics.actions) {
          expect(action.size).toBeLessThan(metrics.titleSize)
          expect(action.top).toBeGreaterThan(metrics.descriptionBottom)
          expect(action.left).toBeGreaterThanOrEqual(metrics.left)
          expect(action.right).toBeLessThanOrEqual(metrics.right)
          expect(action.clipped).toBe(false)
        }
      }
    }
  }
})
