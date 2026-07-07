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
  getOneHubRealSiteSkipReason,
  loginToRealOneHubSite,
  resolveOneHubRealSiteConfig,
} from "~~/e2e/utils/realSite/oneHub"

test.describe("real-site E2E: OneHub account add flow", () => {
  test.beforeEach(async ({ context, page }) => {
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
  })

  const usageChecks = [
    realSiteAccountUsageChecks.keyLifecycle(),
    realSiteAccountUsageChecks.keyToApiProfileAndPopupModels(),
    realSiteAccountUsageChecks.providerDestinations({
      validateDestinationPages: true,
    }),
    realSiteAccountUsageChecks.modelCatalog(),
    realSiteAccountUsageChecks.modelToKey({ envPrefix: "ONE_HUB" }),
  ] as const

  for (const usageCheck of usageChecks) {
    test(`logs into a real OneHub site, saves the account, then ${usageCheck.name}`, async ({
      context,
      extensionId,
      page,
    }, testInfo) => {
      const realSite = resolveOneHubRealSiteConfig()
      test.skip(
        !realSite.config,
        getOneHubRealSiteSkipReason(realSite.missingEnvKeys),
      )

      const config = realSite.config!
      const serviceWorker = await getServiceWorker(context)

      await seedUserPreferences(serviceWorker, {
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
              siteType: SITE_TYPES.ONE_HUB,
              expectedDetectedSiteType: SITE_TYPES.ONE_HUB,
              login: loginToRealOneHubSite,
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
          label: "OneHub",
        },
        [usageCheck],
      )
    })
  }
})
