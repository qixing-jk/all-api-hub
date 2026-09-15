import type { Page } from "@playwright/test"

import { POPUP_PAGE_PATH } from "~/constants/extensionPages"
import { SHARE_SNAPSHOT_TEST_IDS } from "~/features/ShareSnapshots/testIds"
import { DEFAULT_APPEARANCE } from "~/types/theme"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

async function forceClipboardFailure(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("clipboard unavailable for density review")
        },
      },
    })
  })
}

test.beforeEach(async ({ context, page }) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("keeps the share-caption toast inside a narrow comfortable popup", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    themeMode: "light",
    appearance: { ...DEFAULT_APPEARANCE, density: "comfortable" },
  })
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "density-review-share-account",
      site_name: "Density review account",
      site_url: "https://density-review.example.invalid",
      last_sync_time: 1_765_000_000_000,
      account_info: {
        id: "density-review-user",
        username: "density-review-user",
        access_token: "density-review-token",
        quota: 500000,
        today_income: 200000,
        today_quota_consumption: 100000,
      },
    }),
  ])

  await page.setViewportSize({ width: 320, height: 568 })
  await forceClipboardFailure(page)
  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)

  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Share overview snapshot" }).click()
  await downloadPromise

  await expect(
    page.getByText("Caption wasn't copied automatically."),
  ).toBeVisible()
  const caption = page.getByTestId(SHARE_SNAPSHOT_TEST_IDS.captionTextarea)
  const toast = caption.locator("..")
  await expect(toast).toBeVisible()

  const bounds = await toast.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320)

  await expect(caption).toBeVisible()
  await caption.focus()
  await expect(caption).toBeFocused()

  const actionButtons = toast.getByRole("button")
  await expect(actionButtons).toHaveCount(2)
  await page.keyboard.press("Tab")
  await expect(actionButtons.first()).toBeFocused()

  for (let index = 0; index < 2; index += 1) {
    const button = actionButtons.nth(index)
    await expect(button).toBeVisible()
    await expect(button).toBeEnabled()
    const buttonBounds = await button.boundingBox()
    expect(buttonBounds).not.toBeNull()
    expect(buttonBounds!.x).toBeGreaterThanOrEqual(0)
    expect(buttonBounds!.x + buttonBounds!.width).toBeLessThanOrEqual(320)
  }
})
