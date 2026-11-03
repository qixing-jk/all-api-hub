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

test("NanoGPT preserves independent XNO with zero USD after reload", async ({
  page,
  context,
  extensionId,
}, testInfo) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, { themeMode: "light" })
  await seedStoredAccounts(worker, [
    ...(["active", "grace", "inactive", "expired", "unavailable"] as const).map(
      (status) =>
        createStoredAccount({
          id: `nano-${status}`,
          site_type: SITE_TYPES.NANOGPT,
          site_name: `NanoGPT ${status}`,
          site_url: "https://nano-gpt.com",
          account_info: { subscription: { status, remainingTokens: 123 } },
        }),
    ),
    createStoredAccount({
      id: "nano-balance",
      site_type: SITE_TYPES.NANOGPT,
      site_name: "NanoGPT",
      site_url: "https://nano-gpt.com",
      account_info: {
        quota: 0,
        nativeBalance: { unit: "USD_XNO", total: 0, nanoBalance: 26.71801147 },
      },
    }),
  ])
  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  const row = page.getByTestId(
    getAccountManagementListItemTestId("nano-balance"),
  )
  await expect(row).toContainText("26.71801147 XNO")
  await expect(row).toContainText("$0.00")
  await page.reload()
  await expect(row).toContainText("26.71801147 XNO")
  for (const [status, label] of Object.entries({
    active: "Subscription active",
    grace: "Subscription grace period",
    inactive: "No active subscription",
    expired: "Subscription expired",
    unavailable: "Subscription status unavailable",
  })) {
    const statusRow = page.getByTestId(
      getAccountManagementListItemTestId(`nano-${status}`),
    )
    await expect(statusRow).toContainText(label)
    if (["inactive", "expired", "unavailable"].includes(status))
      await expect(statusRow).not.toContainText("123")
  }
  for (const width of [1280, 380]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(row.getByText("26.71801147 XNO")).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath(`balance-${width}.png`),
      animations: "disabled",
    })
  }
})
