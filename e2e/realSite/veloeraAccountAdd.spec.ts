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
  getVeloeraRealSiteSkipReason,
  loginToRealVeloeraSite,
  resolveVeloeraRealSiteConfig,
} from "~~/e2e/utils/realSite/veloera"

test.describe("real-site E2E: Veloera account add flow", () => {
  test.beforeEach(async ({ context, page }) => {
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
  })

  const usageChecks = [
    realSiteAccountUsageChecks.keyLifecycle(),
    realSiteAccountUsageChecks.keyToApiProfileAndPopupModels(),
    realSiteAccountUsageChecks.providerDestinations({
      validateDestinationPages: {
        usage: true,
        redeem: false,
      },
    }),
    realSiteAccountUsageChecks.modelCatalog(),
    realSiteAccountUsageChecks.modelToKey({ envPrefix: "VELOERA" }),
  ] as const

  for (const usageCheck of usageChecks) {
    test(`logs into a real Veloera site, saves the account, then ${usageCheck.name}`, async ({
      context,
      extensionId,
      page,
    }, testInfo) => {
      const realSite = resolveVeloeraRealSiteConfig()
      test.skip(
        !realSite.config,
        getVeloeraRealSiteSkipReason(realSite.missingEnvKeys),
      )

      const config = realSite.config!
      const serviceWorker = await getServiceWorker(context)

      await seedUserPreferences(serviceWorker, {
        managedSiteType: SITE_TYPES.VELOERA,
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
              siteType: SITE_TYPES.VELOERA,
              expectedDetectedSiteType: SITE_TYPES.VELOERA,
              login: loginToRealVeloeraSite,
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
          label: "Veloera",
        },
        [usageCheck],
      )
    })
  }
})
