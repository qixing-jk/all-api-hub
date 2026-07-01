import type { BrowserContext, Page } from "@playwright/test"

import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import { test } from "~~/e2e/fixtures/extensionTest"
import {
  buildManagedSiteE2ePrefix,
  runManagedSiteChannelsCrudScenario,
  runManagedSiteTokenChannelStatusScenario,
} from "~~/e2e/scenarios/managedSiteChannels"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { runCompatibleRealSiteAccountSaveFlow } from "~~/e2e/utils/realSite/compatibleAccountSaveFlow"
import {
  buildRealSiteRunId,
  buildRealSiteTestTokenName,
} from "~~/e2e/utils/realSite/keyManagement"
import {
  getManagedSiteRealSiteSkipReason,
  resolveAxonHubManagedSiteConfig,
  resolveClaudeCodeHubManagedSiteConfig,
  resolveDoneHubManagedSiteConfig,
  resolveNewApiManagedSiteConfig,
  resolveOctopusManagedSiteConfig,
  resolveVeloeraManagedSiteConfig,
} from "~~/e2e/utils/realSite/managedSiteConfig"
import {
  loginToRealNewApiSite,
  resolveNewApiRealSiteConfig,
} from "~~/e2e/utils/realSite/newApi"
import { readEnv } from "~~/e2e/utils/realSite/shared"

type ServiceWorker = Awaited<ReturnType<typeof getServiceWorker>>

const managedSiteTargets = [
  {
    label: "New API",
    siteType: SITE_TYPES.NEW_API,
    preferenceKey: "newApi",
    resolveConfig: resolveNewApiManagedSiteConfig,
  },
  {
    label: "Veloera",
    siteType: SITE_TYPES.VELOERA,
    preferenceKey: "veloera",
    resolveConfig: resolveVeloeraManagedSiteConfig,
  },
  {
    label: "DoneHub",
    siteType: SITE_TYPES.DONE_HUB,
    preferenceKey: "doneHub",
    resolveConfig: resolveDoneHubManagedSiteConfig,
  },
  {
    label: "Octopus",
    siteType: SITE_TYPES.OCTOPUS,
    preferenceKey: "octopus",
    resolveConfig: resolveOctopusManagedSiteConfig,
  },
  {
    label: "AxonHub",
    siteType: SITE_TYPES.AXON_HUB,
    preferenceKey: "axonHub",
    resolveConfig: resolveAxonHubManagedSiteConfig,
  },
  {
    label: "Claude Code Hub",
    siteType: SITE_TYPES.CLAUDE_CODE_HUB,
    preferenceKey: "claudeCodeHub",
    resolveConfig: resolveClaudeCodeHubManagedSiteConfig,
  },
] as const

const selectedManagedSiteTarget = readEnv("AAH_E2E_MANAGED_SITE_TARGET")
const selectedManagedSiteTargets = managedSiteTargets.filter(
  (candidate) =>
    !selectedManagedSiteTarget ||
    selectedManagedSiteTarget === candidate.siteType,
)

if (selectedManagedSiteTarget && selectedManagedSiteTargets.length === 0) {
  throw new Error(
    `AAH_E2E_MANAGED_SITE_TARGET=${selectedManagedSiteTarget} does not match any managed-site E2E target. Expected one of: ${managedSiteTargets
      .map((target) => target.siteType)
      .join(", ")}`,
  )
}

test.describe.configure({
  mode: selectedManagedSiteTarget ? "parallel" : "serial",
})

test.describe("real-site E2E: managed-site channel management", () => {
  test.setTimeout(600_000)

  test.beforeEach(async ({ context, page }) => {
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
  })

  for (const target of selectedManagedSiteTargets) {
    const managedSite = target.resolveConfig()

    if (!managedSite.config) {
      test.skip(`${target.label} covers channel CRUD/search and token channel status when supported`, async () => {
        getManagedSiteRealSiteSkipReason({
          label: target.label,
          missingEnvKeys: managedSite.missingEnvKeys,
        })
      })
      continue
    }

    test(`${target.label} covers channel CRUD/search and token channel status when supported`, async ({
      context,
      extensionId,
      page,
    }, testInfo) => {
      const serviceWorker = await getServiceWorker(context)
      const config = managedSite.config
      const runId = buildRealSiteRunId()
      const runPrefix = buildManagedSiteE2ePrefix({
        label: target.label.replace(/\s+/g, ""),
        runId,
      })
      const cleanupPrefix = buildManagedSiteE2ePrefix({
        label: target.label.replace(/\s+/g, ""),
      })
      const sourceAccountResult =
        await test.step(`${target.label}: prepare source account`, async () =>
          await maybePrepareStatusSourceAccount({
            context,
            extensionId,
            page,
            serviceWorker,
            managedSiteType: target.siteType,
            managedSiteLabel: target.label,
            managedPreferenceKey: target.preferenceKey,
            managedConfig: config,
          }))

      await seedUserPreferences(serviceWorker, {
        managedSiteType: target.siteType,
        [target.preferenceKey]: config,
        autoFillCurrentSiteUrlOnAccountAdd: false,
        autoProvisionKeyOnAccountAdd: false,
        openChangelogOnUpdate: false,
      })

      try {
        await test.step(`${target.label}: channel CRUD/search`, async () => {
          await runManagedSiteChannelsCrudScenario({
            page,
            extensionId,
            siteType: target.siteType,
            label: target.label,
            runPrefix,
            cleanupPrefix,
          })
        })

        const statusResult =
          await test.step(`${target.label}: token channel status`, async () =>
            await runManagedSiteTokenChannelStatusScenario({
              page,
              extensionId,
              siteType: target.siteType,
              label: target.label,
              runPrefix,
              cleanupPrefix,
              sourceAccount: sourceAccountResult.sourceAccount ?? undefined,
              tokenName: buildRealSiteTestTokenName({
                label: "channel",
                runId,
              }),
              sourceAccountSkipReason: sourceAccountResult.skipReason,
              tokenCleanupPrefix: "AAH E2E channel",
            }))

        if (statusResult.skipped) {
          testInfo.annotations.push({
            type: "skip",
            description: statusResult.reason,
          })
        }
      } finally {
        await sourceAccountResult.sourceAccount?.cleanup()
      }
    })
  }
})

async function maybePrepareStatusSourceAccount(params: {
  context: BrowserContext
  extensionId: string
  page: Page
  serviceWorker: ServiceWorker
  managedSiteType: ManagedSiteType
  managedSiteLabel: string
  managedPreferenceKey: string
  managedConfig: unknown
}): Promise<{
  sourceAccount: Awaited<
    ReturnType<typeof runCompatibleRealSiteAccountSaveFlow>
  > | null
  skipReason?: string
}> {
  if (params.managedSiteType !== SITE_TYPES.NEW_API) {
    return {
      sourceAccount: null,
      skipReason: `${params.managedSiteLabel} token channel status is not covered by this real-site E2E`,
    }
  }

  const realSite = {
    ...resolveNewApiRealSiteConfig(),
    siteType: SITE_TYPES.NEW_API,
    expectedDetectedSiteType: undefined,
    login: loginToRealNewApiSite,
    label: "New API",
  }

  if (!realSite.config) {
    return {
      sourceAccount: null,
      skipReason: `${realSite.label} source account E2E env is missing`,
    }
  }

  await seedUserPreferences(params.serviceWorker, {
    managedSiteType: params.managedSiteType,
    [params.managedPreferenceKey]: params.managedConfig,
    autoFillCurrentSiteUrlOnAccountAdd: false,
    autoProvisionKeyOnAccountAdd: false,
    openChangelogOnUpdate: false,
  })

  const sitePage = await params.context.newPage()
  try {
    const sourceAccount = await runCompatibleRealSiteAccountSaveFlow({
      page: params.page,
      extensionId: params.extensionId,
      serviceWorker: params.serviceWorker,
      sitePage,
      config: realSite.config,
      siteType: realSite.siteType,
      expectedDetectedSiteType: realSite.expectedDetectedSiteType,
      extensionPageGuardOptions: {
        ignoreConsoleErrorPatterns: [
          /Failed to load resource: .*status of (401|429|500)/u,
        ],
      },
      login: realSite.login,
    })

    return { sourceAccount }
  } catch (error) {
    return {
      sourceAccount: null,
      skipReason: `Failed to prepare ${realSite.label} source account for ${params.managedSiteLabel} managed-site status checks: ${
        error instanceof Error ? error.message : String(error)
      }`,
    }
  } finally {
    if (!sitePage.isClosed()) {
      await sitePage.close()
    }
  }
}
