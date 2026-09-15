import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "~/features/KeyManagement/constants"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const accountId = "layout-account"

for (const width of [1280, 390, 320]) {
  for (const selectedAccount of [
    accountId,
    KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
  ]) {
    test(`keeps key batch actions above ${selectedAccount} results at ${width}px`, async ({
      context,
      extensionId,
      page,
    }, testInfo) => {
      installExtensionPageGuards(page)
      await forceExtensionLanguage(page, "en")
      await page.setViewportSize({ width, height: 900 })
      await stubLlmMetadataIndex(context)
      await stubNewApiSiteRoutes(context, {
        initialTokens: Array.from({ length: 4 }, (_, index) => ({
          id: index + 1,
          user_id: 1,
          key: `sk-layout-example-${index + 1}`,
          status: 1,
          name: `Layout key ${index + 1}`,
          created_time: 1_770_000_000,
          accessed_time: 1_770_000_000,
          expired_time: -1,
          remain_quota: 0,
          unlimited_quota: true,
          model_limits_enabled: false,
          model_limits: "",
          allow_ips: "",
          used_quota: 0,
          group: "default",
        })),
      })
      await seedStoredAccounts(await getServiceWorker(context), [
        createStoredAccount({ id: accountId, site_name: "Layout account" }),
        createStoredAccount({
          id: "second-account",
          site_name: "Second account",
        }),
      ])

      await page.goto(
        `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#keys?accountId=${selectedAccount}`,
      )
      await waitForExtensionRoot(page)
      const isAllAccounts =
        selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
      const visibleSelection = page.getByRole("checkbox", {
        name: /visible selected/,
      })
      await expect(visibleSelection).toHaveAccessibleName(
        `0/${isAllAccounts ? 8 : 4} visible selected`,
      )
      if (isAllAccounts) {
        await page.getByTestId(KEY_MANAGEMENT_TEST_IDS.expandAllButton).click()
      }

      const rows = page.getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeKeyRow)
      await expect(rows).toHaveCount(isAllAccounts ? 8 : 4)
      await expect(
        page.getByRole("combobox", { name: "Select a scope" }),
      ).toHaveCount(0)
      await expect(
        page.getByRole("heading", { name: "Scope", exact: true }),
      ).toHaveCount(0)

      const batchSave = page.getByTestId(
        KEY_MANAGEMENT_TEST_IDS.batchSaveToApiProfilesButton,
      )
      const clearSelection = page.getByRole("button", {
        name: "Clear selection",
        exact: true,
      })
      await visibleSelection.scrollIntoViewIfNeeded()

      // Check rendered positions: DOM order alone cannot catch CSS reordering or overlap.
      const firstRowBounds = await rows.first().boundingBox()
      expect(firstRowBounds).not.toBeNull()
      for (const control of [visibleSelection, batchSave, clearSelection]) {
        await expect(control).toBeVisible()
        const bounds = await control.boundingBox()
        expect(bounds).not.toBeNull()
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
          firstRowBounds!.y,
        )
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
      }

      await visibleSelection.check()
      await expect(rows.first().getByRole("checkbox")).toBeChecked()
      await expect(rows.last().getByRole("checkbox")).toBeChecked()
      await expect(batchSave).toBeEnabled()
      await clearSelection.click()
      await expect(rows.first().getByRole("checkbox")).not.toBeChecked()
      await expect(rows.last().getByRole("checkbox")).not.toBeChecked()
      await expect(batchSave).toBeDisabled()

      await visibleSelection.scrollIntoViewIfNeeded()
      const screenshotPath = testInfo.outputPath("key-management-layout.png")
      await page.screenshot({ path: screenshotPath, animations: "disabled" })
      await testInfo.attach("key-management-layout", {
        path: screenshotPath,
        contentType: "image/png",
      })
    })
  }
}
