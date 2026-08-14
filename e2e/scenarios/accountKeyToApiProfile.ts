import type { Page } from "@playwright/test"

import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import type { AccountFixture } from "~~/e2e/scenarios/accountFixtures"
import {
  deleteApiCredentialProfileFromStorage,
  deleteTokenFromKeyManagementPage,
  deleteTokensMatchingNameFromKeyManagementPage,
  expectTokenCreatedInKeyManagementPage,
  openKeyManagementForAccount,
  saveTokenToApiCredentialProfilesFromKeyManagementPage,
  submitTokenCreationFromKeyManagementPage,
  type SavedApiCredentialProfileExpectation,
} from "~~/e2e/utils/accountLifecycle"
import type { getServiceWorker } from "~~/e2e/utils/extensionState"
import {
  collectCleanupError,
  throwScenarioError,
} from "~~/e2e/utils/scenarioErrors"

type ServiceWorker = Awaited<ReturnType<typeof getServiceWorker>>

type AccountKeyToApiProfileEnvironment = {
  extensionId: string
  extensionPage: Page
  getServiceWorker: () => Promise<ServiceWorker>
  prepareExtensionState?: (serviceWorker: ServiceWorker) => Promise<void>
  resolveAccountFixture: (
    serviceWorker: ServiceWorker,
  ) => Promise<AccountFixture>
  openFromAccountRow?: boolean
  buildTokenName: () => string
  cleanupTokenNameMatcher?: (tokenName: string) => boolean
  expectedProfile?: SavedApiCredentialProfileExpectation
  openProfilesPage?: boolean
  cleanupAccountFixture?: boolean
  cleanupCreatedProfile?: boolean
  cleanupCreatedToken?: boolean
  afterProfileSaved?: (profile: ApiCredentialProfile) => Promise<void>
  cleanup?: () => Promise<void>
}

type ExistingAccountTokenToApiProfileEnvironment = {
  extensionId: string
  extensionPage: Page
  getServiceWorker: () => Promise<ServiceWorker>
  prepareExtensionState?: (serviceWorker: ServiceWorker) => Promise<void>
  resolveAccountFixture: (
    serviceWorker: ServiceWorker,
  ) => Promise<AccountFixture>
  tokenName: string
  expectedProfile?: SavedApiCredentialProfileExpectation
  openFromAccountRow?: boolean
  openProfilesPage?: boolean
  cleanupAccountFixture?: boolean
  cleanupCreatedProfile?: boolean
  afterProfileSaved?: (profile: ApiCredentialProfile) => Promise<void>
  cleanup?: () => Promise<void>
}

export async function runAccountKeyToApiProfileScenario(
  env: AccountKeyToApiProfileEnvironment,
): Promise<ApiCredentialProfile> {
  const serviceWorker = await env.getServiceWorker()
  await env.prepareExtensionState?.(serviceWorker)
  const account = await env.resolveAccountFixture(serviceWorker)
  const tokenName = env.buildTokenName()
  let keyManagementPage = env.extensionPage
  let submittedTokenName: string | null = null
  let savedProfile: ApiCredentialProfile | null = null
  let primaryError: unknown

  try {
    keyManagementPage = await openKeyManagementForAccount({
      page: env.extensionPage,
      extensionId: env.extensionId,
      accountId: account.accountId,
      siteType: account.siteType,
      baseUrl: account.baseUrl,
      openFromAccountRow: env.openFromAccountRow ?? true,
    })
    if (env.cleanupTokenNameMatcher) {
      await deleteTokensMatchingNameFromKeyManagementPage({
        page: keyManagementPage,
        nameMatcher: env.cleanupTokenNameMatcher,
      })
    }
    await submitTokenCreationFromKeyManagementPage({
      page: keyManagementPage,
      tokenName,
    })
    submittedTokenName = tokenName

    const tokenResult = await expectTokenCreatedInKeyManagementPage({
      page: keyManagementPage,
      tokenName,
    })
    keyManagementPage = tokenResult.page

    savedProfile = await saveTokenToApiCredentialProfilesFromKeyManagementPage({
      serviceWorker,
      page: keyManagementPage,
      row: tokenResult.row,
      expectedProfile: env.expectedProfile,
      openProfilesPage: env.openProfilesPage ?? false,
    })
    await env.afterProfileSaved?.(savedProfile)
  } catch (error) {
    primaryError = error
  }

  const cleanupError = await collectCleanupError(
    [
      async () => {
        if (env.cleanupCreatedProfile !== false && savedProfile) {
          await deleteApiCredentialProfileFromStorage({
            serviceWorker,
            profileId: savedProfile.id,
          })
        }
      },
      async () => {
        if (env.cleanupCreatedToken !== false && submittedTokenName) {
          await deleteTokenFromKeyManagementPage({
            page: keyManagementPage,
            token: submittedTokenName,
          })
        }
      },
      async () => {
        if (env.cleanupAccountFixture !== false) {
          await account.cleanup()
        }
      },
      async () => {
        await env.cleanup?.()
      },
    ],
    "Account key to API profile cleanup failed",
  )

  throwScenarioError({
    primaryError,
    cleanupError,
    message: "Account key to API profile scenario failed",
  })

  if (!savedProfile) {
    throw new Error(
      "Account key to API profile scenario did not save a profile",
    )
  }

  return savedProfile
}

export async function saveExistingAccountTokenToApiProfileScenario(
  env: ExistingAccountTokenToApiProfileEnvironment,
): Promise<ApiCredentialProfile> {
  const serviceWorker = await env.getServiceWorker()
  await env.prepareExtensionState?.(serviceWorker)
  const account = await env.resolveAccountFixture(serviceWorker)
  let keyManagementPage = env.extensionPage
  let savedProfile: ApiCredentialProfile | null = null
  let primaryError: unknown

  try {
    keyManagementPage = await openKeyManagementForAccount({
      page: env.extensionPage,
      extensionId: env.extensionId,
      accountId: account.accountId,
      siteType: account.siteType,
      baseUrl: account.baseUrl,
      openFromAccountRow: env.openFromAccountRow ?? true,
    })

    const tokenResult = await expectTokenCreatedInKeyManagementPage({
      page: keyManagementPage,
      tokenName: env.tokenName,
    })
    keyManagementPage = tokenResult.page

    savedProfile = await saveTokenToApiCredentialProfilesFromKeyManagementPage({
      serviceWorker,
      page: keyManagementPage,
      row: tokenResult.row,
      expectedProfile: env.expectedProfile,
      openProfilesPage: env.openProfilesPage ?? false,
    })
    await env.afterProfileSaved?.(savedProfile)
  } catch (error) {
    primaryError = error
  }

  const cleanupError = await collectCleanupError(
    [
      async () => {
        if (env.cleanupCreatedProfile !== false && savedProfile) {
          await deleteApiCredentialProfileFromStorage({
            serviceWorker,
            profileId: savedProfile.id,
          })
        }
      },
      async () => {
        if (env.cleanupAccountFixture !== false) {
          await account.cleanup()
        }
      },
      async () => {
        await env.cleanup?.()
      },
    ],
    "Account key to API profile cleanup failed",
  )

  throwScenarioError({
    primaryError,
    cleanupError,
    message: "Existing account token to API profile scenario failed",
  })

  if (!savedProfile) {
    throw new Error(
      "Existing account token to API profile scenario did not save a profile",
    )
  }

  return savedProfile
}
