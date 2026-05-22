import type { Page } from "@playwright/test"

import type { AccountSiteType } from "~/constants/siteType"
import { expect } from "~~/e2e/fixtures/extensionTest"
import type { AccountFixture } from "~~/e2e/scenarios/accountFixtures"
import type { getServiceWorker } from "~~/e2e/utils/extensionState"
import { runRealSiteAccountSaveFlow } from "~~/e2e/utils/realSite/accountSaveFlow"
import type { CompatibleApiRealSiteConfig } from "~~/e2e/utils/realSite/compatibleApi"

type ServiceWorker = Awaited<ReturnType<typeof getServiceWorker>>

type CompatibleRealSiteLoginResult = {
  user: Record<string, unknown>
}

export async function runCompatibleRealSiteAccountSaveFlow(params: {
  page: Page
  extensionId: string
  serviceWorker: ServiceWorker
  sitePage: Page
  config: CompatibleApiRealSiteConfig
  siteType: AccountSiteType
  expectedDetectedSiteType?: AccountSiteType
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
    login: async (sitePage) => {
      const loginResult = await params.login(sitePage, params.config)
      expect(loginResult.user).toBeTruthy()
    },
  })
}
