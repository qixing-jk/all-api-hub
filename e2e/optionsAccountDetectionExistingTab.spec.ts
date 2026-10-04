import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { openAccountManagementPage } from "~~/e2e/utils/realSite/accountAdd"

for (const dashboardAuthMode of ["legacy", "auth-bundle"] as const) {
  test(`Options reads an existing ${dashboardAuthMode} account tab without opening another page`, async ({
    context,
    page,
    extensionId,
  }) => {
    const baseUrl = "https://options-existing-tab.example.invalid"
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    await stubNewApiSiteRoutes(context, { baseUrl, dashboardAuthMode })
    await seedUserPreferences(await getServiceWorker(context), {
      autoFillCurrentSiteUrlOnAccountAdd: false,
      autoProvisionKeyOnAccountAdd: false,
    })

    const sitePage = await context.newPage()
    await sitePage.goto(baseUrl)
    if (dashboardAuthMode === "legacy") {
      await sitePage.evaluate(() => {
        localStorage.setItem(
          "user",
          JSON.stringify({ id: 1, username: "e2e-user" }),
        )
      })
    }

    await openAccountManagementPage({ page, extensionId })
    await page.bringToFront()
    await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton).click()
    const dialog = page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog)
    await dialog
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput)
      .fill(baseUrl)

    const openedPages: string[] = []
    context.on("page", (openedPage) => openedPages.push(openedPage.url()))
    await dialog
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectButton)
      .click()
    await expect(
      dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.userIdInput),
    ).toHaveValue("1")
    await expect(
      dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.confirmAddButton),
    ).toBeEnabled()
    expect(openedPages).toEqual([])
    expect(sitePage.isClosed()).toBe(false)
    expect(page.isClosed()).toBe(false)
  })
}
