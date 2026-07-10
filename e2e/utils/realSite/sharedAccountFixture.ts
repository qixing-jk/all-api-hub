import type { Page, Worker } from "@playwright/test"

import type { SiteAccount } from "~/types"
import {
  createAccountFixture,
  createNoopAccountFixtureCleanup,
  type AccountFixture,
} from "~~/e2e/scenarios/accountFixtures"
import { readStoredAccounts } from "~~/e2e/scenarios/accountManualAdd"
import { seedStoredAccounts } from "~~/e2e/utils/commonUserFlows"
import {
  expectAccountListItemVisible,
  openAccountManagementPage,
} from "~~/e2e/utils/realSite/accountAdd"

type SharedRealSiteAccountFixtureCache = {
  storedAccount?: SiteAccount
  storedAccountPromise?: Promise<SiteAccount>
}

export function createSharedRealSiteAccountFixtureCache(): SharedRealSiteAccountFixtureCache {
  return {}
}

export function createReusedRealSiteAccountFixturePreparer(params: {
  page: Page
  extensionId: string
}) {
  return async (fixture: AccountFixture) => {
    await openAccountManagementPage(params)
    await expectAccountListItemVisible(params.page, fixture.accountId)
  }
}

function createFixtureFromStoredAccount(account: SiteAccount): AccountFixture {
  return createAccountFixture({
    accountId: account.id,
    siteType: account.site_type,
    baseUrl: account.site_url,
    cleanup: createNoopAccountFixtureCleanup(),
  })
}

async function resolvePreparedStoredAccount(params: {
  serviceWorker: Worker
  prepareAccountFixture: () => Promise<AccountFixture>
}) {
  const fixture = await params.prepareAccountFixture()
  const accounts = await readStoredAccounts(params.serviceWorker)
  const storedAccount = accounts.find(
    (account) => account.id === fixture.accountId,
  )

  if (!storedAccount) {
    throw new Error(
      `Real-site account fixture ${fixture.accountId} was not found in extension storage.`,
    )
  }

  return storedAccount
}

export async function resolveSharedRealSiteAccountFixture(params: {
  cache: SharedRealSiteAccountFixtureCache
  serviceWorker: Worker
  prepareAccountFixture: () => Promise<AccountFixture>
  prepareReusedAccountFixture?: (fixture: AccountFixture) => Promise<void>
}): Promise<AccountFixture> {
  if (params.cache.storedAccount) {
    await seedStoredAccounts(params.serviceWorker, [params.cache.storedAccount])
    const fixture = createFixtureFromStoredAccount(params.cache.storedAccount)
    await params.prepareReusedAccountFixture?.(fixture)
    return fixture
  }

  if (!params.cache.storedAccountPromise) {
    params.cache.storedAccountPromise = resolvePreparedStoredAccount(params)
  }

  const storedAccount = await params.cache.storedAccountPromise
  params.cache.storedAccount = storedAccount

  return createFixtureFromStoredAccount(storedAccount)
}
