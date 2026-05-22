import type { Page } from "@playwright/test"

import type { AccountSiteType } from "~/constants/siteType"
import type { AccountFixture } from "~~/e2e/scenarios/accountFixtures"
import {
  createNoopAccountFixtureCleanup,
  toAccountFixtureFromSavedAccount,
} from "~~/e2e/scenarios/accountFixtures"
import { saveAutoDetectedAccountFromApp } from "~~/e2e/utils/accountLifecycle"
import type { getServiceWorker } from "~~/e2e/utils/extensionState"
import type { AccountAddDialog } from "~~/e2e/utils/realSite/accountAdd"

type ServiceWorker = Awaited<ReturnType<typeof getServiceWorker>>

type AccountDetectionContext = void | {
  prepareDetectedDialog?: (dialog: AccountAddDialog) => Promise<void>
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
    throw new AggregateError(errors, "Account auto-detect cleanup failed")
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

type AccountAutoDetectEnvironment = {
  extensionId: string
  extensionPage: Page
  baseUrl: string
  siteType: AccountSiteType
  expectedDetectedSiteType?: AccountSiteType
  getServiceWorker: () => Promise<ServiceWorker>
  prepareExtensionState?: (serviceWorker: ServiceWorker) => Promise<void>
  openSitePage: () => Promise<Page>
  prepareDetectableSite: (sitePage: Page) => Promise<AccountDetectionContext>
  prepareDetectedDialog?: (dialog: AccountAddDialog) => Promise<void>
  cleanup?: () => Promise<void>
  accountCleanup?: () => Promise<void>
}

export async function runAccountAutoDetectScenario(
  env: AccountAutoDetectEnvironment,
): Promise<AccountFixture> {
  const serviceWorker = await env.getServiceWorker()
  await env.prepareExtensionState?.(serviceWorker)

  const sitePage = await env.openSitePage()
  let fixture: AccountFixture | undefined
  let primaryError: unknown

  try {
    const detectionContext = await env.prepareDetectableSite(sitePage)
    const savedAccount = await saveAutoDetectedAccountFromApp({
      page: env.extensionPage,
      extensionId: env.extensionId,
      serviceWorker,
      baseUrl: env.baseUrl,
      siteType: env.siteType,
      expectedSiteType: env.expectedDetectedSiteType,
      prepareDetectedDialog:
        detectionContext?.prepareDetectedDialog ?? env.prepareDetectedDialog,
    })

    fixture = toAccountFixtureFromSavedAccount(savedAccount, {
      cleanup: env.accountCleanup ?? createNoopAccountFixtureCleanup(),
    })
  } catch (error) {
    primaryError = error
  }

  let cleanupError: unknown
  try {
    await runFinalizers([
      async () => {
        await env.cleanup?.()
      },
      async () => {
        await sitePage.close()
      },
    ])
  } catch (error) {
    cleanupError = error
  }

  throwScenarioError({
    primaryError,
    cleanupError,
    message: "Account auto-detect scenario failed",
  })

  if (!fixture) {
    throw new Error("Account auto-detect scenario did not create a fixture")
  }

  return fixture
}
