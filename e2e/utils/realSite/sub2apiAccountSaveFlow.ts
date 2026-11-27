import type { Page } from "@playwright/test"

import { SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { expect } from "~~/e2e/fixtures/extensionTest"
import type { getServiceWorker } from "~~/e2e/utils/extensionState"
import { runRealSiteAccountSaveFlow } from "~~/e2e/utils/realSite/accountSaveFlow"
import {
  loginToRealSub2ApiSite,
  type Sub2ApiRealSiteConfig,
} from "~~/e2e/utils/realSite/sub2api"

type ServiceWorker = Awaited<ReturnType<typeof getServiceWorker>>

export async function runSub2ApiRealSiteAccountSaveFlow(params: {
  page: Page
  extensionId: string
  serviceWorker: ServiceWorker
  sitePage: Page
  config: Sub2ApiRealSiteConfig
}) {
  return await runRealSiteAccountSaveFlow({
    page: params.page,
    extensionId: params.extensionId,
    serviceWorker: params.serviceWorker,
    sitePage: params.sitePage,
    baseUrl: params.config.baseUrl,
    siteType: SITE_TYPES.SUB2API,
    expectedDetectedSiteType: SITE_TYPES.SUB2API,
    login: async (realSitePage) => {
      const loginResult = await loginToRealSub2ApiSite(
        realSitePage,
        params.config,
      )
      expect(loginResult.authState.accessToken).not.toBe("")

      return {
        prepareDetectedDialog: async (dialog) => {
          await expect(dialog.siteNameInput).toHaveValue(/.+/, {
            timeout: 30_000,
          })
          await expect(dialog.userIdInput).toHaveValue(/.+/, {
            timeout: 30_000,
          })
          await expect
            .poll(
              async () =>
                (await dialog.accessTokenInput.inputValue()) ===
                loginResult.authState.accessToken,
              { timeout: 30_000 },
            )
            .toBe(true)
          await expect(
            dialog.sub2apiBrowserSessionOption.getByRole("radio"),
          ).toBeChecked()
          await expect(dialog.sub2apiImportSessionButton).toHaveCount(0)

          if (!loginResult.authState.refreshToken) return

          await dialog.sub2apiIndependentSessionOption.click()
          await expect(
            dialog.sub2apiIndependentSessionOption.getByRole("radio"),
          ).toBeChecked()

          await dialog.dialog
            .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiManualDisclosure)
            .click()
          await expect(dialog.sub2apiImportSessionButton).toBeVisible({
            timeout: 30_000,
          })

          await dialog.sub2apiImportSessionButton.click()
          await expect
            .poll(
              async () =>
                (await dialog.sub2apiRefreshTokenInput.inputValue()) ===
                loginResult.authState.refreshToken,
              { timeout: 30_000 },
            )
            .toBe(true)
        },
      }
    },
  })
}
