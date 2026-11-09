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
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

const accountId = "layout-account"

for (const width of [1280, 390, 320]) {
  for (const selectedAccount of [
    accountId,
    KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
  ]) {
    test(`keeps key batch actions above ${selectedAccount} results at ${width}px`, async ({
      context,
      extensionDir,
      extensionId,
      page,
    }, testInfo) => {
      installExtensionPageGuards(page)
      await forceExtensionLanguage(page, "en")
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ reducedMotion: "reduce" })
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
      if (isAllAccounts) {
        await expect(rows.first()).toHaveCSS("border-bottom-width", "1px")
        await expect(rows.nth(1)).toHaveCSS("border-top-width", "0px")
        await expect(rows.nth(3)).toHaveCSS("border-bottom-width", "0px")
      }
      await expect(
        page.getByRole("combobox", { name: "Select a scope" }),
      ).toHaveCount(0)
      if (width === 1280 && !isAllAccounts) {
        await rows.first().screenshot({
          path: testInfo.outputPath("runtime-action-separators.png"),
        })
        // Nested action groups use a wider gap than their enclosing header.
        const toolbar = rows.first().getByRole("toolbar")
        await expect(toolbar).toBeVisible()
        const separators = toolbar.locator(
          ":scope > div > span[aria-hidden='true']",
        )
        await expect(separators).toHaveCount(3)
        for (const separator of await separators.all()) {
          await expect(separator).toBeVisible()
          const geometry = await separator.evaluate((element) => {
            const group = element.parentElement!
            const previous =
              group.previousElementSibling!.getBoundingClientRect()
            const current = group.getBoundingClientRect()
            const divider = element.getBoundingClientRect()
            return {
              dividerCenter: divider.x + divider.width / 2,
              gapCenter: (previous.right + current.left) / 2,
            }
          })
          expect(
            Math.abs(geometry.dividerCenter - geometry.gapCenter),
          ).toBeLessThanOrEqual(1)
        }
      }

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

      await captureVisualViews({
        page,
        ready: rows.first(),
        id: `key-list-${isAllAccounts ? "grouped" : "single"}-${width}`,
        extensionDir,
        views: [
          { id: "light", width, height: 900, theme: "light" },
          { id: "dark", width, height: 900, theme: "dark" },
        ],
      })

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
