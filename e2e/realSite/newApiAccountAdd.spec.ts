import { NEW_API } from "~/constants/siteType"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import {
  autoDetectAccountFromAddDialog,
  expectAccountListItemVisible,
  openAccountManagementPage,
  waitForSavedAccount,
} from "~~/e2e/utils/realSite/accountAdd"
import {
  getNewApiRealSiteSkipReason,
  loginToRealNewApiSite,
  resolveNewApiRealSiteConfig,
} from "~~/e2e/utils/realSite/newApi"

test.describe("real-site E2E: New API account add flow", () => {
  test.setTimeout(180_000)

  test.beforeEach(async ({ context, page }) => {
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
  })

  test("logs into a real New API site and auto-detects then saves the account", async ({
    context,
    extensionId,
    page,
  }) => {
    const realSite = resolveNewApiRealSiteConfig()
    test.skip(
      !realSite.config,
      getNewApiRealSiteSkipReason(realSite.missingEnvKeys),
    )

    const config = realSite.config!
    const serviceWorker = await getServiceWorker(context)

    await seedUserPreferences(serviceWorker, {
      managedSiteType: NEW_API,
      autoFillCurrentSiteUrlOnAccountAdd: false,
      autoProvisionKeyOnAccountAdd: false,
      openChangelogOnUpdate: false,
    })

    const sitePage = await context.newPage()
    const loginResult = await loginToRealNewApiSite(sitePage, config)
    expect(loginResult.user).toBeTruthy()

    installExtensionPageGuards(page)
    await openAccountManagementPage({ page, extensionId })

    const dialog = await autoDetectAccountFromAddDialog(page, config.baseUrl)
    await expect(dialog.confirmAddButton).toBeEnabled({ timeout: 60_000 })

    await dialog.confirmAddButton.click()
    await expect(dialog.dialog).toBeHidden({ timeout: 60_000 })

    const savedAccount = await waitForSavedAccount({
      serviceWorker,
      siteType: NEW_API,
      baseUrl: config.baseUrl,
    })

    expect(savedAccount.site_type).toBe(NEW_API)
    expect(savedAccount.site_url).toBe(config.baseUrl)
    expect(String(savedAccount.account_info.id)).not.toBe("")
    expect(savedAccount.account_info.username.trim()).not.toBe("")

    await expectAccountListItemVisible(page, savedAccount.id)

    await sitePage.close()
  })
})
