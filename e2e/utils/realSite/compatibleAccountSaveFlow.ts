import type { BrowserContext, Page } from "@playwright/test"

import type { AccountSiteType } from "~/constants/siteType"
import { expect } from "~~/e2e/fixtures/extensionTest"
import type { AccountFixture } from "~~/e2e/scenarios/accountFixtures"
import type { ExtensionPageGuardOptions } from "~~/e2e/utils/commonUserFlows"
import type { getServiceWorker } from "~~/e2e/utils/extensionState"
import type { AccountAddDialog } from "~~/e2e/utils/realSite/accountAdd"
import { runRealSiteAccountSaveFlow } from "~~/e2e/utils/realSite/accountSaveFlow"
import type { CompatibleApiRealSiteConfig } from "~~/e2e/utils/realSite/compatibleApi"

type ServiceWorker = Awaited<ReturnType<typeof getServiceWorker>>

type CompatibleRealSiteLoginResult = {
  user: Record<string, unknown>
  cleanupOwnedSession?: () => Promise<void>
}

/**
 * Log in and save a compatible site's detected account, passing optional dialog
 * recovery and owned-session cleanup to the shared account flow.
 */
export async function runCompatibleRealSiteAccountSaveFlow(params: {
  page: Page
  extensionId: string
  serviceWorker: ServiceWorker
  sitePage: Page
  config: CompatibleApiRealSiteConfig
  siteType: AccountSiteType
  expectedDetectedSiteType?: AccountSiteType
  extensionPageGuardOptions?: ExtensionPageGuardOptions
  prepareDetectedDialog?: (dialog: AccountAddDialog) => Promise<void>
  login: (
    page: Page,
    config: CompatibleApiRealSiteConfig,
  ) => Promise<CompatibleRealSiteLoginResult>
}): Promise<AccountFixture> {
  return await runRealSiteAccountSaveFlow({
    page: params.page,
    extensionId: params.extensionId,
    serviceWorker: params.serviceWorker,
    sitePage: params.sitePage,
    baseUrl: params.config.baseUrl,
    siteType: params.siteType,
    expectedDetectedSiteType: params.expectedDetectedSiteType,
    extensionPageGuardOptions: params.extensionPageGuardOptions,
    login: async (sitePage) => {
      const loginResult = await params.login(sitePage, params.config)
      expect(loginResult.user).toBeTruthy()
      return {
        prepareDetectedDialog: params.prepareDetectedDialog,
        cleanupDetectableSite: loginResult.cleanupOwnedSession,
      }
    },
  })
}

/** Prepare an account fixture in a site tab that is closed on every exit. */
export function createCompatibleRealSiteAccountFixturePreparer(params: {
  context: BrowserContext
  page: Page
  extensionId: string
  serviceWorker: ServiceWorker
  config: CompatibleApiRealSiteConfig
  siteType: AccountSiteType
  expectedDetectedSiteType?: AccountSiteType
  extensionPageGuardOptions?: ExtensionPageGuardOptions
  prepareDetectedDialog?: (dialog: AccountAddDialog) => Promise<void>
  login: (
    page: Page,
    config: CompatibleApiRealSiteConfig,
  ) => Promise<CompatibleRealSiteLoginResult>
}) {
  return async () => {
    const sitePage = await params.context.newPage()
    try {
      return await runCompatibleRealSiteAccountSaveFlow({
        page: params.page,
        extensionId: params.extensionId,
        serviceWorker: params.serviceWorker,
        sitePage,
        config: params.config,
        siteType: params.siteType,
        expectedDetectedSiteType: params.expectedDetectedSiteType,
        extensionPageGuardOptions: params.extensionPageGuardOptions,
        prepareDetectedDialog: params.prepareDetectedDialog,
        login: params.login,
      })
    } finally {
      if (!sitePage.isClosed()) {
        await sitePage.close()
      }
    }
  }
}
