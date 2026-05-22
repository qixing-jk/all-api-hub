import type { Page } from "@playwright/test"

import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import type { AccountFixture } from "~~/e2e/scenarios/accountFixtures"
import { runAccountKeyLifecycleScenario } from "~~/e2e/scenarios/accountKeyLifecycle"
import { runAccountKeyToApiProfileScenario } from "~~/e2e/scenarios/accountKeyToApiProfile"
import {
  runAccountProviderDestinationsScenario,
  type ProviderDestinationValidationOptions,
} from "~~/e2e/scenarios/accountProviderDestinations"
import {
  verifyAccountModelCatalog,
  type ModelListCatalogExpectations,
} from "~~/e2e/scenarios/modelListCatalog"
import type { SavedApiCredentialProfileExpectation } from "~~/e2e/utils/accountLifecycle"
import type { getServiceWorker } from "~~/e2e/utils/extensionState"

type ServiceWorker = Awaited<ReturnType<typeof getServiceWorker>>

type AccountUsageScenarioContext = {
  page: Page
  extensionId: string
  serviceWorker: ServiceWorker
  account: AccountFixture
}

export async function verifyAccountKeyLifecycleUsage(
  context: AccountUsageScenarioContext & {
    buildTokenName: () => string
    openFromAccountRow?: boolean
    cleanupAccountFixture?: boolean
  },
) {
  await runAccountKeyLifecycleScenario({
    extensionId: context.extensionId,
    extensionPage: context.page,
    getServiceWorker: async () => context.serviceWorker,
    resolveAccountFixture: async () => context.account,
    openFromAccountRow: context.openFromAccountRow,
    buildTokenName: context.buildTokenName,
    cleanupAccountFixture: context.cleanupAccountFixture,
  })
}

export async function verifyAccountKeyToApiProfileUsage(
  context: AccountUsageScenarioContext & {
    buildTokenName: () => string
    expectedProfile?: SavedApiCredentialProfileExpectation
    openProfilesPage?: boolean
    openFromAccountRow?: boolean
    cleanupAccountFixture?: boolean
    cleanupCreatedProfile?: boolean
    cleanupCreatedToken?: boolean
    afterProfileSaved?: (profile: ApiCredentialProfile) => Promise<void>
  },
) {
  return await runAccountKeyToApiProfileScenario({
    extensionId: context.extensionId,
    extensionPage: context.page,
    getServiceWorker: async () => context.serviceWorker,
    resolveAccountFixture: async () => context.account,
    openFromAccountRow: context.openFromAccountRow,
    buildTokenName: context.buildTokenName,
    expectedProfile: context.expectedProfile,
    openProfilesPage: context.openProfilesPage,
    cleanupAccountFixture: context.cleanupAccountFixture,
    cleanupCreatedProfile: context.cleanupCreatedProfile,
    cleanupCreatedToken: context.cleanupCreatedToken,
    afterProfileSaved: context.afterProfileSaved,
  })
}

export async function verifyAccountProviderDestinationUsage(
  context: Pick<AccountUsageScenarioContext, "page" | "serviceWorker"> & {
    account: Pick<AccountFixture, "accountId" | "siteType" | "baseUrl">
    validateDestinationPages?: ProviderDestinationValidationOptions
  },
) {
  await runAccountProviderDestinationsScenario({
    page: context.page,
    serviceWorker: context.serviceWorker,
    account: context.account,
    validateDestinationPages: context.validateDestinationPages,
  })
}

export async function verifyAccountModelCatalogUsage(
  context: Pick<AccountUsageScenarioContext, "page" | "extensionId"> & {
    account: Pick<AccountFixture, "accountId">
    expectations?: ModelListCatalogExpectations
  },
) {
  await verifyAccountModelCatalog({
    page: context.page,
    extensionId: context.extensionId,
    accountId: context.account.accountId,
    expectations: context.expectations,
  })
}
