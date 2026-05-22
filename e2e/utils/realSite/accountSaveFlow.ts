import type { Page } from "@playwright/test"

import type { AccountSiteType } from "~/constants/siteType"
import { runAccountAutoDetectScenario } from "~~/e2e/scenarios/accountAutoDetect"
import {
  createNoopAccountFixtureCleanup,
  type AccountFixture,
} from "~~/e2e/scenarios/accountFixtures"
import { installExtensionPageGuards } from "~~/e2e/utils/commonUserFlows"
import type { getServiceWorker } from "~~/e2e/utils/extensionState"
import type { AccountAddDialog } from "~~/e2e/utils/realSite/accountAdd"

type ServiceWorker = Awaited<ReturnType<typeof getServiceWorker>>

type RealSiteAccountSaveLoginResult = void | {
  prepareDetectedDialog?: (dialog: AccountAddDialog) => Promise<void>
}

export async function runRealSiteAccountSaveFlow(params: {
  page: Page
  extensionId: string
  serviceWorker: ServiceWorker
  sitePage: Page
  baseUrl: string
  siteType: AccountSiteType
  expectedDetectedSiteType?: AccountSiteType
  login: (sitePage: Page) => Promise<RealSiteAccountSaveLoginResult>
}): Promise<AccountFixture> {
  installExtensionPageGuards(params.page)

  return await runAccountAutoDetectScenario({
    extensionId: params.extensionId,
    extensionPage: params.page,
    baseUrl: params.baseUrl,
    siteType: params.siteType,
    expectedDetectedSiteType: params.expectedDetectedSiteType,
    getServiceWorker: async () => params.serviceWorker,
    openSitePage: async () => params.sitePage,
    prepareDetectableSite: async (sitePage) => await params.login(sitePage),
    accountCleanup: createNoopAccountFixtureCleanup(),
  })
}
