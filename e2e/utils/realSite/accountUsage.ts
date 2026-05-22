import type { Page, TestInfo } from "@playwright/test"

import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { test } from "~~/e2e/fixtures/extensionTest"
import type { AccountFixture } from "~~/e2e/scenarios/accountFixtures"
import type { ProviderDestinationValidationOptions } from "~~/e2e/scenarios/accountProviderDestinations"
import {
  verifyAccountKeyLifecycleUsage,
  verifyAccountKeyToApiProfileUsage,
  verifyAccountModelCatalogUsage,
  verifyAccountProviderDestinationUsage,
} from "~~/e2e/scenarios/accountUsage"
import {
  runAccountFixtureUsagePlan,
  type AccountUsagePlanCheck,
} from "~~/e2e/scenarios/accountUsagePlan"
import {
  openApiCredentialProfilesPopupScenario,
  verifyApiCredentialProfileModelsProbeScenario,
} from "~~/e2e/scenarios/apiCredentialProfileVerification"
import type { ModelListCatalogExpectations } from "~~/e2e/scenarios/modelListCatalog"
import type { SavedApiCredentialProfileExpectation } from "~~/e2e/utils/accountLifecycle"
import type { getServiceWorker } from "~~/e2e/utils/extensionState"
import {
  buildRealSiteRunId,
  buildRealSiteTestTokenName,
} from "~~/e2e/utils/realSite/keyManagement"
import {
  maybeRunRealSiteModelToKeyScenario,
  type RealSiteModelToKeyEnvPrefix,
} from "~~/e2e/utils/realSite/modelToKey"

type ServiceWorker = Awaited<ReturnType<typeof getServiceWorker>>

type RealSiteAccountUsageContext = {
  page: Page
  extensionId: string
  serviceWorker: ServiceWorker
  account: AccountFixture
  label: string
}

type RealSiteAccountUsagePlanContext = RealSiteAccountUsageContext & {
  testInfo: TestInfo
}

type RealSiteAccountUsageCheck =
  AccountUsagePlanCheck<RealSiteAccountUsagePlanContext>

type ApiProfilePopupModelsProbeExpectation = {
  expectedStatus?: "pass" | "fail"
  expectedSummaryText?: string
}

function buildUsageTokenName(label: string) {
  return buildRealSiteTestTokenName({
    label,
    runId: buildRealSiteRunId(),
  })
}

export async function verifyRealSiteAccountKeyLifecycleUsage(
  context: RealSiteAccountUsageContext,
) {
  await verifyAccountKeyLifecycleUsage({
    page: context.page,
    extensionId: context.extensionId,
    serviceWorker: context.serviceWorker,
    account: context.account,
    cleanupAccountFixture: false,
    buildTokenName: () => buildUsageTokenName(context.label),
  })
}

export async function verifyRealSiteAccountKeyToApiProfileUsage(
  context: RealSiteAccountUsageContext & {
    profileLabel?: string
    expectedProfile?: SavedApiCredentialProfileExpectation
    cleanupCreatedProfile?: boolean
    cleanupCreatedToken?: boolean
    afterProfileSaved?: (profile: ApiCredentialProfile) => Promise<void>
  },
) {
  return await verifyAccountKeyToApiProfileUsage({
    page: context.page,
    extensionId: context.extensionId,
    serviceWorker: context.serviceWorker,
    account: context.account,
    cleanupAccountFixture: false,
    cleanupCreatedProfile: context.cleanupCreatedProfile,
    cleanupCreatedToken: context.cleanupCreatedToken,
    afterProfileSaved: context.afterProfileSaved,
    expectedProfile: {
      baseUrl: context.account.baseUrl,
      ...context.expectedProfile,
    },
    buildTokenName: () =>
      buildUsageTokenName(context.profileLabel ?? `${context.label} Profile`),
  })
}

export async function verifyRealSiteAccountProviderDestinationUsage(
  context: Pick<
    RealSiteAccountUsageContext,
    "page" | "serviceWorker" | "account"
  > & {
    validateDestinationPages?: ProviderDestinationValidationOptions
  },
) {
  await verifyAccountProviderDestinationUsage({
    page: context.page,
    serviceWorker: context.serviceWorker,
    account: context.account,
    validateDestinationPages: context.validateDestinationPages,
  })
}

export async function verifyRealSiteAccountModelCatalogUsage(
  context: Pick<
    RealSiteAccountUsageContext,
    "page" | "extensionId" | "account"
  > & {
    expectations?: ModelListCatalogExpectations
  },
) {
  await verifyAccountModelCatalogUsage({
    page: context.page,
    extensionId: context.extensionId,
    account: context.account,
    expectations: context.expectations,
  })
}

export async function maybeVerifyRealSiteModelToKeyUsage(
  context: Pick<
    RealSiteAccountUsageContext,
    "page" | "extensionId" | "account" | "label"
  > & {
    testInfo: TestInfo
    envPrefix: RealSiteModelToKeyEnvPrefix
    hasAvailableModel?: boolean
  },
) {
  await maybeRunRealSiteModelToKeyScenario({
    testInfo: context.testInfo,
    page: context.page,
    extensionId: context.extensionId,
    accountId: context.account.accountId,
    envPrefix: context.envPrefix,
    label: context.label,
    hasAvailableModel: context.hasAvailableModel,
  })
}

async function verifyRealSiteApiProfilePopupModelsUsage(
  context: RealSiteAccountUsageContext & {
    profileLabel?: string
    expectedProfile?: SavedApiCredentialProfileExpectation
    popupModelsProbe?: ApiProfilePopupModelsProbeExpectation
  },
) {
  let verifiedProfile: ApiCredentialProfile | null = null

  await verifyRealSiteAccountKeyToApiProfileUsage({
    ...context,
    profileLabel: context.profileLabel,
    expectedProfile: context.expectedProfile,
    afterProfileSaved: async (profile) => {
      const popupPage = await openApiCredentialProfilesPopupScenario({
        page: await context.page.context().newPage(),
        extensionId: context.extensionId,
      })

      try {
        await verifyApiCredentialProfileModelsProbeScenario({
          page: popupPage,
          profileName: profile.name,
          ...context.popupModelsProbe,
        })
        verifiedProfile = profile
      } finally {
        await popupPage.close()
      }
    },
  })

  if (!verifiedProfile) {
    throw new Error("Real-site API profile popup verification did not run")
  }

  return verifiedProfile
}

export const realSiteAccountUsageChecks = {
  keyLifecycle(): RealSiteAccountUsageCheck {
    return {
      name: "create and delete an account API key",
      run: async (context) => {
        await verifyRealSiteAccountKeyLifecycleUsage(context)
      },
    }
  },

  keyToApiProfileAndPopupModels(
    options: {
      profileLabel?: string
      expectedProfile?: SavedApiCredentialProfileExpectation
      popupModelsProbe?: ApiProfilePopupModelsProbeExpectation
    } = {},
  ): RealSiteAccountUsageCheck {
    return {
      name: "create an account key, save it to API profiles, and verify it from the popup",
      run: async (context) => {
        await verifyRealSiteApiProfilePopupModelsUsage({
          ...context,
          ...options,
        })
      },
    }
  },

  providerDestinations(options: {
    validateDestinationPages?: ProviderDestinationValidationOptions
  }): RealSiteAccountUsageCheck {
    return {
      name: "open provider destination pages",
      run: async (context) => {
        await verifyRealSiteAccountProviderDestinationUsage({
          ...context,
          validateDestinationPages: options.validateDestinationPages,
        })
      },
    }
  },

  modelCatalog(
    options: {
      expectations?: ModelListCatalogExpectations
    } = {},
  ): RealSiteAccountUsageCheck {
    return {
      name: "load account model catalog",
      run: async (context) => {
        await verifyRealSiteAccountModelCatalogUsage({
          ...context,
          expectations: options.expectations,
        })
      },
    }
  },

  accountBackedModelCatalogUnavailable(options: {
    reason: string
  }): RealSiteAccountUsageCheck {
    return {
      name: "skip account model catalog because it is unavailable",
      run: async (context) => {
        context.testInfo.annotations.push({
          type: "skip",
          description: options.reason,
        })
      },
    }
  },

  modelToKey(options: {
    envPrefix: RealSiteModelToKeyEnvPrefix
    hasAvailableModel?: boolean
  }): RealSiteAccountUsageCheck {
    return {
      name: "create a key from the model catalog",
      run: async (context) => {
        await maybeVerifyRealSiteModelToKeyUsage({
          ...context,
          envPrefix: options.envPrefix,
          hasAvailableModel: options.hasAvailableModel,
        })
      },
    }
  },
} as const

export async function runRealSiteAccountFixtureUsageChecks(
  context: RealSiteAccountUsagePlanContext,
  checks: readonly RealSiteAccountUsageCheck[],
) {
  await runAccountFixtureUsagePlan(context, checks, {
    step: async (name, run) => {
      await test.step(name, run)
    },
  })
}
