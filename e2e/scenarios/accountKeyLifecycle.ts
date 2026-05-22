import type { Page } from "@playwright/test"

import type { AccountFixture } from "~~/e2e/scenarios/accountFixtures"
import {
  deleteTokenFromKeyManagementPage,
  expectTokenCreatedInKeyManagementPage,
  openKeyManagementForAccount,
  submitTokenCreationFromKeyManagementPage,
} from "~~/e2e/utils/accountLifecycle"
import type { getServiceWorker } from "~~/e2e/utils/extensionState"

type ServiceWorker = Awaited<ReturnType<typeof getServiceWorker>>

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
    throw new AggregateError(errors, "Account key lifecycle cleanup failed")
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

  let cleanupError: unknown
  try {
    await runFinalizers([
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
    ])
  } catch (error) {
    cleanupError = error
  }

  throwScenarioError({
    primaryError,
    cleanupError,
    message: "Account key lifecycle scenario failed",
  })
}
