import type { Page } from "@playwright/test"

import type { AccountFixture } from "~~/e2e/scenarios/accountFixtures"
import {
  deleteTokenFromKeyManagementPage,
  deleteTokensMatchingNameFromKeyManagementPage,
  expectTokenCreatedInKeyManagementPage,
  openKeyManagementForAccount,
  submitTokenCreationFromKeyManagementPage,
} from "~~/e2e/utils/accountLifecycle"
import type { getServiceWorker } from "~~/e2e/utils/extensionState"
import {
  collectCleanupError,
  throwScenarioError,
} from "~~/e2e/utils/scenarioErrors"

type ServiceWorker = Awaited<ReturnType<typeof getServiceWorker>>

type AccountKeyLifecycleEnvironment = {
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
  cleanupAccountFixture?: boolean
  cleanup?: () => Promise<void>
}

export async function runAccountKeyLifecycleScenario(
  env: AccountKeyLifecycleEnvironment,
) {
  const serviceWorker = await env.getServiceWorker()
  await env.prepareExtensionState?.(serviceWorker)
  const account = await env.resolveAccountFixture(serviceWorker)
  const tokenName = env.buildTokenName()
  let keyManagementPage = env.extensionPage
  let submittedTokenName: string | null = null
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
  } catch (error) {
    primaryError = error
  }

  const cleanupError = await collectCleanupError(
    [
      async () => {
        if (submittedTokenName) {
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
    "Account key lifecycle cleanup failed",
  )

  throwScenarioError({
    primaryError,
    cleanupError,
    message: "Account key lifecycle scenario failed",
  })
}
