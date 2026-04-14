import { SUB2API } from "~/constants/siteType"
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
  getSub2ApiRealSiteSkipReason,
  loginToRealSub2ApiSite,
  resolveSub2ApiRealSiteConfig,
} from "~~/e2e/utils/realSite/sub2api"

test.describe("real-site E2E: Sub2API auto-detect account add flow", () => {
  test.setTimeout(180_000)

  test.beforeEach(async ({ context, page }) => {
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
  })

  test("logs into a real Sub2API site and auto-detects then saves the account", async ({
    context,
    extensionId,
    page,
  }) => {
    const realSite = resolveSub2ApiRealSiteConfig()
    test.skip(
      !realSite.config,
      getSub2ApiRealSiteSkipReason(realSite.missingEnvKeys),
    )

    const config = realSite.config!
    const serviceWorker = await getServiceWorker(context)

    await seedUserPreferences(serviceWorker, {
      autoFillCurrentSiteUrlOnAccountAdd: false,
      autoProvisionKeyOnAccountAdd: false,
      openChangelogOnUpdate: false,
      tempWindowFallback: {
        enabled: false,
      },
    })

    const sitePage = await context.newPage()
    const loginResult = await loginToRealSub2ApiSite(sitePage, config)
    expect(loginResult.authState.accessToken).not.toBe("")

    installExtensionPageGuards(page)
    await openAccountManagementPage({ page, extensionId })

    const dialog = await autoDetectAccountFromAddDialog(page, config.baseUrl)

    await expect(dialog.siteNameInput).toHaveValue(/.+/, {
      timeout: 60_000,
    })
    await expect(dialog.userIdInput).toHaveValue(/.+/, {
      timeout: 60_000,
    })
    await expect(dialog.accessTokenInput).toHaveValue(
      loginResult.authState.accessToken,
      {
        timeout: 60_000,
      },
    )
    await expect(dialog.siteTypeTrigger).toHaveAttribute(
      "data-site-type",
      SUB2API,
    )

    let importedHostedSession = false

    if (loginResult.authState.refreshToken) {
      if (
        (await dialog.sub2apiRefreshTokenSwitch.getAttribute(
          "aria-checked",
        )) !== "true"
      ) {
        await dialog.sub2apiRefreshTokenSwitch.click()
      }

      let importSessionButtonCount = 0
      for (let attempt = 0; attempt < 10; attempt += 1) {
        importSessionButtonCount = await dialog.sub2apiImportSessionButton
          .count()
          .catch(() => 0)
        if (importSessionButtonCount > 0) {
          break
        }
        await page.waitForTimeout(500)
      }

      if (importSessionButtonCount > 0) {
        await dialog.sub2apiImportSessionButton.click()
        await expect(dialog.sub2apiRefreshTokenInput).toHaveValue(
          loginResult.authState.refreshToken,
          {
            timeout: 60_000,
          },
        )
        importedHostedSession = true
      }
    }

    await expect(dialog.confirmAddButton).toBeEnabled({ timeout: 60_000 })
    await dialog.confirmAddButton.click()
    await expect(dialog.dialog).not.toBeVisible({ timeout: 60_000 })

    const savedAccount = await waitForSavedAccount({
      serviceWorker,
      siteType: SUB2API,
      baseUrl: config.baseUrl,
    })

    expect(savedAccount.site_type).toBe(SUB2API)
    expect(savedAccount.site_url).toBe(config.baseUrl)
    expect(String(savedAccount.account_info.id)).not.toBe("")
    expect(savedAccount.account_info.access_token).toBe(
      loginResult.authState.accessToken,
    )

    if (loginResult.authState.refreshToken && importedHostedSession) {
      expect(savedAccount.sub2apiAuth?.refreshToken).toBe(
        loginResult.authState.refreshToken,
      )
      if (typeof loginResult.authState.tokenExpiresAt === "number") {
        expect(savedAccount.sub2apiAuth?.tokenExpiresAt).toBe(
          loginResult.authState.tokenExpiresAt,
        )
      }
    }

    await expectAccountListItemVisible(page, savedAccount.id)

    await sitePage.close()
  })
})
