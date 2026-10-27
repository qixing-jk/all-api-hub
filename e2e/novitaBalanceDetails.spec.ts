import { SITE_TYPES } from "~/constants/siteType"
import { getAccountManagementListItemTestId } from "~/features/AccountManagement/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"

test("Novita balance details distinguish zero top-up funds from available balance", async ({
  page,
  context,
  extensionId,
}, testInfo) => {
  await forceExtensionLanguage(page, "zh-CN")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 1280, height: 900 })
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, { themeMode: "light" })
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "novita-balance",
      site_type: SITE_TYPES.NOVITA,
      site_name: "Novita",
      site_url: "https://novita.ai",
      account_info: {
        nativeBalance: {
          unit: "USD",
          total: 93,
          permanent: 0,
          daily: 0,
          components: [
            { kind: "permanent", amount: 0 },
            { kind: "permanent", name: "Credit limit", amount: 20 },
          ],
        },
      },
    }),
  ])
  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  const row = page.getByTestId(
    getAccountManagementListItemTestId("novita-balance"),
  )
  await row.getByRole("button", { name: /额度明细|余额明细/ }).click()
  const details = page.getByRole("dialog", { name: /额度明细|余额明细/ })
  await expect(details).toBeVisible()
  await details.screenshot({
    path: testInfo.outputPath("balance-details.png"),
    animations: "disabled",
  })
  await expect(details).toHaveAccessibleName("余额明细")
  await expect(details).toContainText("可用余额$93")
  await expect(details).toContainText("充值余额$0")
  await expect(details).toContainText("信用额度（可欠款上限）$20")
  await expect(details).not.toContainText("永久额度")
  await expect(details).not.toContainText("分组和套餐")
  await page.setViewportSize({ width: 380, height: 800 })
  await expect(details).toBeVisible()
  const bounds = (await details.boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(380)
  await details.screenshot({
    path: testInfo.outputPath("balance-details-narrow.png"),
    animations: "disabled",
  })
})
