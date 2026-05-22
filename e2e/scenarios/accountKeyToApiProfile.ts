import type { Page } from "@playwright/test"

import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import type { AccountFixture } from "~~/e2e/scenarios/accountFixtures"
import {
  deleteApiCredentialProfileFromStorage,
  deleteTokenFromKeyManagementPage,
  expectTokenCreatedInKeyManagementPage,
  openKeyManagementForAccount,
  saveTokenToApiCredentialProfilesFromKeyManagementPage,
  submitTokenCreationFromKeyManagementPage,
  type SavedApiCredentialProfileExpectation,
} from "~~/e2e/utils/accountLifecycle"
import type { getServiceWorker } from "~~/e2e/utils/extensionState"

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

async function runFinalizers(finalizers: Array<() => Promise<void>>) {
  const errors: unknown[] = []

  for (const finalizer of finalizers) {
    try {
      await finalizer()
    } catch (error) {
      errors.push(error)
    }
  }

  if (errors.length === 1) {
    throw errors[0]
  }

  if (errors.length > 1) {
    throw new AggregateError(
      errors,
      "Account key to API profile cleanup failed",
    )
  }
}

function throwScenarioError(params: {
  primaryError: unknown
  cleanupError: unknown
  message: string
}) {
  if (params.primaryError && params.cleanupError) {
    throw new AggregateError(
      [params.primaryError, params.cleanupError],
      params.message,
    )
  }

  if (params.primaryError) {
    throw params.primaryError
  }

  if (params.cleanupError) {
    throw params.cleanupError
  }
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

  let cleanupError: unknown
  try {
    await runFinalizers([
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
    ])
  } catch (error) {
    cleanupError = error
  }

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

  let cleanupError: unknown
  try {
    await runFinalizers([
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
    ])
  } catch (error) {
    cleanupError = error
  }

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
