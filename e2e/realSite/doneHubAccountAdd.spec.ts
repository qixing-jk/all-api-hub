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
import { runCompatibleRealSiteAccountSaveFlow } from "~~/e2e/utils/realSite/compatibleAccountSaveFlow"
import {
  getDoneHubRealSiteSkipReason,
  loginToRealDoneHubSite,
  resolveDoneHubRealSiteConfig,
} from "~~/e2e/utils/realSite/doneHub"

test.describe("real-site E2E: DoneHub account add flow", () => {
  test.setTimeout(180_000)

  test.beforeEach(async ({ context, page }) => {
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
  })

  test("logs into a real DoneHub site, saves the account, then verifies account usage workflows", async ({
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
      await test.step("save account from real site auto-detect", async () => {
        const sitePage = await context.newPage()
        try {
          return await runCompatibleRealSiteAccountSaveFlow({
            page,
            extensionId,
            serviceWorker,
            sitePage,
            config,
            siteType: SITE_TYPES.DONE_HUB,
            expectedDetectedSiteType: SITE_TYPES.DONE_HUB,
            login: loginToRealDoneHubSite,
          })
        } finally {
          if (!sitePage.isClosed()) {
            await sitePage.close()
          }
        }
      })
    await runRealSiteAccountFixtureUsageChecks(
      {
        testInfo,
        page,
        extensionId,
        serviceWorker,
        account: accountFixture,
        label: "DoneHub",
      },
      [
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
      ],
    )
  })
})
