import { SITE_TYPES } from "~/constants/siteType"
import { test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { registerRealSiteAccountDetectionTests } from "~~/e2e/utils/realSite/accountDetection"
import {
  realSiteAccountUsageChecks,
  runRealSiteAccountFixtureUsageChecks,
} from "~~/e2e/utils/realSite/accountUsage"
import {
  createReusedRealSiteAccountFixturePreparer,
  createSharedRealSiteAccountFixtureCache,
  resolveSharedRealSiteAccountFixture,
} from "~~/e2e/utils/realSite/sharedAccountFixture"
import {
  getSub2ApiRealSiteSkipReason,
  loginToRealSub2ApiSite,
  resolveSub2ApiRealSiteConfig,
} from "~~/e2e/utils/realSite/sub2api"
import { runSub2ApiRealSiteAccountSaveFlow } from "~~/e2e/utils/realSite/sub2apiAccountSaveFlow"

registerRealSiteAccountDetectionTests({
  label: "Sub2API",
  siteType: SITE_TYPES.SUB2API,
  cookieBootstrap: false,
  resolve: resolveSub2ApiRealSiteConfig,
  login: async (page, config) => {
    const result = await loginToRealSub2ApiSite(page, config)
    return { userId: String(result.authState.user.id) }
  },
})

test.describe("real-site E2E: Sub2API auto-detect account add flow", () => {
  const sharedAccountCache = createSharedRealSiteAccountFixtureCache()

  test.beforeEach(async ({ context, page }) => {
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
  })

  const usageChecks = [
    realSiteAccountUsageChecks.keyLifecycle(),
    realSiteAccountUsageChecks.keyToApiProfile(),
    realSiteAccountUsageChecks.providerDestinations({
      validateDestinationPages: true,
    }),
    realSiteAccountUsageChecks.runtimeKeyModelCatalog(),
    realSiteAccountUsageChecks.modelToKey({ envPrefix: "SUB2API" }),
  ] as const

  for (const usageCheck of usageChecks) {
    test(`logs into a real Sub2API site, saves the account, then ${usageCheck.name}`, async ({
      context,
      extensionId,
      page,
    }, testInfo) => {
      const realSite = resolveSub2ApiRealSiteConfig()
      test.skip(
        !realSite.config,
        getSub2ApiRealSiteSkipReason(realSite.missingEnvKeys),
      )

      const config = realSite.config!
      const serviceWorker = await getServiceWorker(context)

      await seedUserPreferences(serviceWorker, {
        autoFillCurrentSiteUrlOnAccountAdd: false,
        autoProvisionKeyOnAccountAdd: false,
        openChangelogOnUpdate: false,
        tempWindowFallback: {
          enabled: false,
        },
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
            prepareAccountFixture: async () => {
              const sitePage = await context.newPage()
              try {
                return await runSub2ApiRealSiteAccountSaveFlow({
                  page,
                  extensionId,
                  serviceWorker,
                  sitePage,
                  config,
                })
              } finally {
                if (!sitePage.isClosed()) {
                  await sitePage.close()
                }
              }
            },
          }))
      await runRealSiteAccountFixtureUsageChecks(
        {
          testInfo,
          page,
          extensionId,
          serviceWorker,
          account: accountFixture,
          label: "Sub2API",
        },
        [usageCheck],
      )
    })
  }
})
