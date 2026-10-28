import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
import { getAccountManagementListItemTestId } from "~/features/AccountManagement/testIds"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import { createUnsupportedTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"
import { openNativeKeyEditor } from "~~/scripts/flows/native-key-editor.mjs"

test("Requesty shows monetary balance and only implemented key creation options", async ({
  context,
  extensionId,
  extensionDir,
  page,
}, testInfo) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 1920, height: 1080 })
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    autoCheckin: { globalEnabled: false, pretriggerDailyOnUiOpen: false },
  })
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "requesty-semantics",
      site_name: "Requesty organization",
      site_url: "https://app.requesty.ai",
      site_type: SITE_TYPES.REQUESTY,
      account_info: {
        id: "requesty:fixture",
        access_token: "fixture-management-key",
        quota: 6_250_000,
        todayStatsAvailability: createUnsupportedTodayStatsAvailability(),
      },
    }),
  ])
  const key = {
    id: "fixture-key",
    name: "Monthly API key",
    monthly_limit: "10",
    monthly_spend: "4",
    created_at: "2026-10-01T00:00:00Z",
    permissions: { manage: "none", completions: "write" },
  }
  await context.route("https://api-v2.requesty.ai/**", async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === "/v1/manage/org") {
      await route.fulfill({
        json: { name: "Requesty organization", balance: "12.5" },
      })
    } else if (path === "/v1/manage/apikey") {
      await route.fulfill({ json: { keys: [key] } })
    } else if (path === "/v1/manage/apikey/self") {
      await route.fulfill({
        json: {
          ...key,
          id: "management-key",
          permissions: { manage: "write", completions: "none" },
        },
      })
    } else if (path === "/v1/manage/apikey/fixture-key") {
      await route.fulfill({ json: key })
    } else {
      await route.fulfill({
        status: 404,
        json: { error: { message: "Unexpected fixture route" } },
      })
    }
  })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
  )
  await waitForExtensionRoot(page)
  const account = page.getByTestId(
    getAccountManagementListItemTestId("requesty-semantics"),
  )
  await expect(account).toBeVisible()
  await expect(account.getByTitle("Click to refresh balance")).toContainText(
    "$12.50",
  )
  await expect(
    account.getByRole("button", { name: "Allowance details" }),
  ).toHaveCount(0)
  await account.screenshot({
    path: testInfo.outputPath("requesty-balance.png"),
    animations: "disabled",
  })
  await captureVisualViews({
    page,
    ready: account,
    id: "requesty-balance",
    extensionDir,
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#keys?accountId=requesty-semantics`,
  )
  await waitForExtensionRoot(page)
  const keyRow = page.getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeKeyRow)
  await expect(keyRow).toHaveCount(1)
  await expect(keyRow).toContainText("Monthly API key")
  await expect(keyRow).toContainText("Monthly limit (USD)")
  await expect(keyRow).toContainText("$10")
  await expect(keyRow).toContainText("Used Quota:")
  await expect(keyRow).toContainText("$4")
  // The monthly ceiling remains $10; subtracting $4 spent must not turn it into $6.
  await expect(keyRow).not.toContainText("$6")
  await expect(
    keyRow.getByRole("button", { name: "Edit key", exact: true }),
  ).toBeEnabled()
  const editDialog = await openNativeKeyEditor(page, {
    trigger: keyRow.getByRole("button", { name: "Edit key", exact: true }),
    readyField: "Monthly limit (USD)",
  })
  await expect(editDialog.getByLabel("Monthly limit (USD)")).toHaveValue("10")
  await expect(
    editDialog.getByLabel("Expiration Time", { exact: true }),
  ).toBeVisible()
  await expect(
    editDialog.getByLabel("Management permission", { exact: true }),
  ).toHaveCount(0)
  await expect(
    editDialog.getByRole("textbox", { name: /^Token Name/ }),
  ).toHaveCount(0)
  await editDialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(editDialog).not.toBeVisible()
  const dialog = await openNativeKeyEditor(page, {
    trigger: page.getByTestId(KEY_MANAGEMENT_TEST_IDS.addTokenButton),
    readyField: "Monthly limit (USD)",
  })
  await expect(dialog.getByLabel("Monthly limit (USD)")).toBeVisible()
  await expect(dialog.getByLabel("Monthly limit (USD)")).toBeEnabled()
  await expect(
    dialog.getByRole("textbox", { name: /^Token Name/ }),
  ).toBeEditable()
  await expect(
    dialog.getByRole("switch", { name: "Management permission", exact: true }),
  ).toBeEnabled()
  await expect(
    dialog.getByRole("switch", { name: "Management permission", exact: true }),
  ).not.toBeChecked()
  await expect(
    dialog.getByLabel("Expiration Time", { exact: true }),
  ).toHaveCount(0)
  await dialog.screenshot({
    path: testInfo.outputPath("requesty-create-key.png"),
    animations: "disabled",
  })
  await captureVisualViews({
    page,
    ready: dialog,
    id: "requesty-create-key",
    extensionDir,
  })
})
