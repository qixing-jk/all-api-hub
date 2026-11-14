import { POPUP_PAGE_PATH } from "~/constants/extensionPages"
import {
  getAccountManagementListItemTestId,
  ACCOUNT_MANAGEMENT_TEST_IDS as IDS,
} from "~/features/AccountManagement/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  seedStoredAccounts,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"

test("contains a canceled Kilo export chunk failure and recovers after an explicit reload", async ({
  context,
  page,
  extensionId,
}, testInfo) => {
  const worker = await getServiceWorker(context)
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "kilo-failure",
      site_url: "https://lazy-failure.example.com",
    }),
  ])
  await stubLlmMetadataIndex(context)
  await stubNewApiSiteRoutes(context, {
    baseUrl: "https://lazy-failure.example.com",
    initialTokens: [1, 2].map((id) => ({
      id,
      user_id: 1,
      key: `sk-synthetic-failure-${id}`,
      status: 1,
      name: `Failure key ${id}`,
      created_time: 1,
      accessed_time: 1,
      expired_time: -1,
      remain_quota: -1,
      unlimited_quota: true,
      model_limits_enabled: false,
      model_limits: "",
      allow_ips: "",
      used_quota: 0,
      group: "default",
    })),
  })
  let releaseChunk!: () => void
  const gate = new Promise<void>((resolve) => {
    releaseChunk = resolve
  })
  let requested = false
  let failed = false
  const chunkPattern = /\/chunks\/KiloCodeExportDialog-[^/]+\.js$/
  await context.route(chunkPattern, async (route) => {
    requested = true
    await gate
    await route.abort("failed")
    failed = true
  })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  const row = page.getByTestId(
    getAccountManagementListItemTestId("kilo-failure"),
  )
  const openKeys = async () => {
    await row.hover()
    await row.getByTestId(IDS.rowCopyKeyButton).click()
    await page
      .getByRole("button", {
        name: "View details for Failure key 1",
        exact: true,
      })
      .click()
  }
  const openKilo = async () => {
    await page
      .getByTestId(IDS.copyKeyDialogExportMenuButton)
      .click({ timeout: 10_000 })
    await page
      .getByRole("menuitem", { name: /Kilo Code/ })
      .click({ timeout: 10_000 })
  }
  try {
    await openKeys()
    await openKilo()
    await expect.poll(() => requested).toBe(true)
    await expect(
      page.getByRole("dialog", { name: "Loading...", exact: true }),
    ).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(
      page.getByRole("dialog", { name: "Loading...", exact: true }),
    ).toBeHidden()
    await expect(
      page.getByTestId(IDS.copyKeyDialogExportMenuButton),
    ).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(
      page.getByRole("dialog", { name: "Key List", exact: true }),
    ).toBeHidden()
    await page.getByTestId(IDS.addAccountButton).click()
    const name = page.getByTestId(IDS.siteUrlInput)
    await name.fill("https://unsaved.example.com")
    releaseChunk()
    await expect.poll(() => failed).toBe(true)
    // A render turn after rejection must retain the actual editor, not just its data.
    await expect(name).toHaveValue("https://unsaved.example.com")
    await name.press("End")
    await name.press("2")
    await expect(name).toHaveValue("https://unsaved.example.com2")
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toBeHidden()
    await openKeys()
    await openKilo()
    const errorDialog = page.getByRole("dialog", { name: "Error", exact: true })
    await expect(errorDialog).toContainText(
      "Save your other work before reloading",
    )
    await errorDialog.screenshot({
      path: testInfo.outputPath("dialog-load-failure.png"),
      animations: "disabled",
    })
    await errorDialog
      .getByRole("button", { name: "Close", exact: true })
      .click()
    await expect(
      page.getByTestId(IDS.copyKeyDialogExportMenuButton),
    ).toBeFocused()
    await openKilo()
    await context.unroute(chunkPattern)
    await errorDialog
      .getByRole("button", { name: "Reload page", exact: true })
      .click()
    await openKeys()
    await openKilo()
    await expect(
      page.getByText("Export Kilo Code JSON", { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole("combobox", { name: "Selected sites", exact: true }),
    ).toBeEnabled()
    await page.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(
      page.getByTestId(IDS.copyKeyDialogExportMenuButton),
    ).toBeFocused()
  } finally {
    releaseChunk()
  }
})
