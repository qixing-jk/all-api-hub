import type { Page } from "@playwright/test"

import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import type { AccountFixture } from "~~/e2e/scenarios/accountFixtures"
import { runAccountKeyLifecycleScenario } from "~~/e2e/scenarios/accountKeyLifecycle"
import { runAccountKeyToApiProfileScenario } from "~~/e2e/scenarios/accountKeyToApiProfile"
import {
  runAccountProviderDestinationsScenario,
  type ProviderDestinationValidationOptions,
} from "~~/e2e/scenarios/accountProviderDestinations"
import {
  verifyOpenApiCredentialProfileModelsProbeDialog,
  type ApiCredentialProfileModelsProbeDialogExpectation,
} from "~~/e2e/scenarios/apiCredentialProfileVerification"
import {
  verifyCcSwitchModelExportDeepLink,
  verifyCcSwitchModelPickerCancelable,
  type CcSwitchDeepLinkExpectation,
} from "~~/e2e/scenarios/ccSwitchExport"
import {
  verifyAccountModelCatalog,
  type ModelListCatalogExpectations,
} from "~~/e2e/scenarios/modelListCatalog"
import {
  deleteTokenFromKeyManagementPage,
  expectTokenCreatedInKeyManagementPage,
  openKeyManagementForAccount,
  submitTokenCreationFromKeyManagementPage,
  type SavedApiCredentialProfileExpectation,
} from "~~/e2e/utils/accountLifecycle"
import type { getServiceWorker } from "~~/e2e/utils/extensionState"

type ServiceWorker = Awaited<ReturnType<typeof getServiceWorker>>

type AccountUsageScenarioContext = {
  page: Page
  extensionId: string
  serviceWorker: ServiceWorker
  account: AccountFixture
}

type ModelsProbeExpectation = Omit<
  ApiCredentialProfileModelsProbeDialogExpectation,
  "page"
>

type CreatedTokenUiContext = {
  page: Page
  row: Awaited<ReturnType<typeof expectTokenCreatedInKeyManagementPage>>["row"]
}

type AccountTokenUiScenarioContext = AccountUsageScenarioContext & {
  buildTokenName: () => string
  openFromAccountRow?: boolean
  cleanupAccountFixture?: boolean
  cleanup?: () => Promise<void>
}

async function runAccountTokenUiScenario(
  context: AccountTokenUiScenarioContext & {
    useCreatedToken: (params: CreatedTokenUiContext) => Promise<void>
  },
) {
  const account = context.account
  const tokenName = context.buildTokenName()
  let keyManagementPage = context.page
  let submittedTokenName: string | null = null
  let primaryError: unknown

  try {
    keyManagementPage = await openKeyManagementForAccount({
      page: context.page,
      extensionId: context.extensionId,
      accountId: account.accountId,
      siteType: account.siteType,
      baseUrl: account.baseUrl,
      openFromAccountRow: context.openFromAccountRow ?? true,
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
    await context.useCreatedToken({
      page: keyManagementPage,
      row: tokenResult.row,
    })
  } catch (error) {
    primaryError = error
  }

  const cleanupErrors: unknown[] = []
  const runCleanup = async (cleanup: () => Promise<void>) => {
    try {
      await cleanup()
    } catch (error) {
      cleanupErrors.push(error)
    }
  }

  if (submittedTokenName) {
    await runCleanup(async () => {
      await deleteTokenFromKeyManagementPage({
        page: keyManagementPage,
        token: submittedTokenName,
      })
    })
  }
  if (context.cleanupAccountFixture !== false) {
    await runCleanup(async () => {
      await account.cleanup()
    })
  }
  if (context.cleanup) {
    await runCleanup(context.cleanup)
  }

  let cleanupError: unknown
  if (cleanupErrors.length === 1) {
    cleanupError = cleanupErrors[0]
  } else if (cleanupErrors.length > 1) {
    cleanupError = new AggregateError(
      cleanupErrors,
      "Account token UI scenario cleanup failed",
    )
  }

  if (primaryError && cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      "Account token UI scenario failed",
    )
  }
  if (primaryError) throw primaryError
  if (cleanupError) throw cleanupError
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

export async function verifyAccountTokenModelsProbeUsage(
  context: AccountTokenUiScenarioContext & {
    modelsProbe?: ModelsProbeExpectation
  },
) {
  await runAccountTokenUiScenario({
    ...context,
    useCreatedToken: async ({ page, row }) => {
      await row
        .getByTestId(KEY_MANAGEMENT_TEST_IDS.verifyTokenApiButton)
        .click()
      await verifyOpenApiCredentialProfileModelsProbeDialog({
        page,
        expectedStatus: "handled",
        closeDialog: true,
        ...context.modelsProbe,
      })
    },
  })
}

export async function verifyAccountTokenCcSwitchModelPickerUsage(
  context: AccountTokenUiScenarioContext & {
    modelName?: string
    expectedCcSwitchDeepLink?: CcSwitchDeepLinkExpectation
  },
) {
  await runAccountTokenUiScenario({
    ...context,
    useCreatedToken: async ({ page, row }) => {
      await row
        .getByTestId(KEY_MANAGEMENT_TEST_IDS.exportToCCSwitchButton)
        .click()
      if (context.modelName) {
        await verifyCcSwitchModelExportDeepLink({
          page,
          modelName: context.modelName,
          expected: context.expectedCcSwitchDeepLink ?? { app: "claude" },
        })
        return
      }

      await verifyCcSwitchModelPickerCancelable({ page })
    },
  })
}
