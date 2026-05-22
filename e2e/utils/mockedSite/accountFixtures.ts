import type { Worker } from "@playwright/test"

import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { SiteAccount } from "~/types"
import type { AccountFixture } from "~~/e2e/scenarios/accountFixtures"
import {
  createAccountFixture,
  createOnceAccountFixtureCleanup,
} from "~~/e2e/scenarios/accountFixtures"
import {
  createStoredAccount,
  seedStoredAccounts,
} from "~~/e2e/utils/commonUserFlows"

export async function seedMockAccountFixture(params: {
  serviceWorker: Worker
  account?: SiteAccount
  accountId?: string
  siteType?: AccountSiteType
  baseUrl?: string
}): Promise<AccountFixture> {
  const account =
    params.account ??
    createStoredAccount({
      id: params.accountId ?? `e2e-account-${Date.now().toString(36)}`,
      site_type: params.siteType ?? SITE_TYPES.NEW_API,
      site_url: params.baseUrl ?? "https://example.com",
    })

  await seedStoredAccounts(params.serviceWorker, [account])

  return createAccountFixture({
    accountId: account.id,
    siteType: account.site_type,
    baseUrl: account.site_url,
    cleanup: createOnceAccountFixtureCleanup(async () => {
      await seedStoredAccounts(params.serviceWorker, [])
    }),
  })
}
