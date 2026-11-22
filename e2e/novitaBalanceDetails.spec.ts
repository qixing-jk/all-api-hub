import { SITE_TYPES } from "~/constants/siteType"
import { getAccountManagementListItemTestId } from "~/features/AccountManagement/testIds"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import { balancePosition } from "~/services/amounts/balance"
import { AuthTypeEnum } from "~/types"
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
  const scope = accountBalanceScope({
    baseUrl: "https://novita.ai",
    accountId: "novita-balance",
    auth: { authType: AuthTypeEnum.AccessToken },
  })
  const position = (id: string, value: string) =>
    balancePosition({
      id,
      value,
      scope,
      observedAt: 1765000000000,
      asset: { kind: "currency", code: "USD" },
      source: {
        adapter: "novita",
        operation: "/v1/billing/balance/detail",
        contractVersion: "2",
        kind: "reported",
      },
    })
  await seedUserPreferences(worker, { themeMode: "light" })
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "novita-balance",
      site_type: SITE_TYPES.NOVITA,
      site_name: "Novita",
      site_url: "https://novita.ai",
      account_info: {
        balance: accountBalanceSnapshot(
          scope,
          [
            position("available", "93"),
            {
              ...position("cash", "0"),
              role: "ledger",
              nature: "prepaid",
              cashClassification: "reported-cash",
            },
            {
              ...position("credit-limit", "20"),
              role: "credit-limit",
              nature: "credit",
            },
          ],
          1765000000000,
          "complete",
        ),
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
  await expect(details).toContainText(/可用额度.*USD.*93/s)
  await expect(details).toContainText(/现金余额.*USD.*0/s)
  await expect(details).toContainText(/授信上限.*USD.*20/s)
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
