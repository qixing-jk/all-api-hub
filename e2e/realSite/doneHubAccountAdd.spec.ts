import { SITE_TYPES } from "~/constants/siteType"
import { test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import {
  realSiteAccountUsageChecks,
  runRealSiteAccountFixtureUsageChecks,
} from "~~/e2e/utils/realSite/accountUsage"
import { createCompatibleRealSiteAccountFixturePreparer } from "~~/e2e/utils/realSite/compatibleAccountSaveFlow"
import {
  getDoneHubRealSiteSkipReason,
  loginToRealDoneHubSite,
  resolveDoneHubRealSiteConfig,
} from "~~/e2e/utils/realSite/doneHub"
import {
  createReusedRealSiteAccountFixturePreparer,
  createSharedRealSiteAccountFixtureCache,
  resolveSharedRealSiteAccountFixture,
} from "~~/e2e/utils/realSite/sharedAccountFixture"

test.describe("real-site E2E: DoneHub account add flow", () => {
  const sharedAccountCache = createSharedRealSiteAccountFixtureCache()

  test.beforeEach(async ({ context, page }) => {
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
  })

  const usageChecks = [
    realSiteAccountUsageChecks.keyLifecycle(),
    realSiteAccountUsageChecks.keyToApiProfileAndPopupModels({
      popupModelsProbe: {
        expectedStatus: "fail",
        expectedSummaryText: "No models returned",
      },
    }),
    realSiteAccountUsageChecks.providerDestinations({
      validateDestinationPages: true,
    }),
    realSiteAccountUsageChecks.modelCatalog({
      expectations: {
        allowEmptyCatalog: true,
      },
    }),
    realSiteAccountUsageChecks.modelToKey({
      envPrefix: "DONE_HUB",
      hasAvailableModel: false,
    }),
  ] as const

  for (const usageCheck of usageChecks) {
    test(`logs into a real DoneHub site, saves the account, then ${usageCheck.name}`, async ({
      context,
      extensionId,
      page,
    }, testInfo) => {
      const realSite = resolveDoneHubRealSiteConfig()
      test.skip(
        !realSite.config,
        getDoneHubRealSiteSkipReason(realSite.missingEnvKeys),
      )

      const config = realSite.config!
      const serviceWorker = await getServiceWorker(context)

      await seedUserPreferences(serviceWorker, {
        managedSiteType: SITE_TYPES.DONE_HUB,
        autoFillCurrentSiteUrlOnAccountAdd: false,
        autoProvisionKeyOnAccountAdd: false,
        openChangelogOnUpdate: false,
      })

      const accountFixture =
        await test.step("save or reuse account from real site auto-detect", async () =>
          await resolveSharedRealSiteAccountFixture({
            cache: sharedAccountCache,
            serviceWorker,
            prepareReusedAccountFixture:
              createReusedRealSiteAccountFixturePreparer({
                page,
                extensionId,
              }),
            prepareAccountFixture:
              createCompatibleRealSiteAccountFixturePreparer({
                context,
                page,
                extensionId,
                serviceWorker,
                config,
                siteType: SITE_TYPES.DONE_HUB,
                expectedDetectedSiteType: SITE_TYPES.DONE_HUB,
                login: loginToRealDoneHubSite,
              }),
          }))
      await runRealSiteAccountFixtureUsageChecks(
        {
          testInfo,
          page,
          extensionId,
          serviceWorker,
          account: accountFixture,
          label: "DoneHub",
        },
        [usageCheck],
      )
    })
  }
})
