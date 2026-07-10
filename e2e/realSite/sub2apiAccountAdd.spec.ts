import { SITE_TYPES } from "~/constants/siteType"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { runRealSiteAccountSaveFlow } from "~~/e2e/utils/realSite/accountSaveFlow"
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

const ACCOUNT_BACKED_MODEL_CATALOG_UNAVAILABLE_REASON =
  "Sub2API account model catalog skipped because this site type does not expose an account-backed model catalog."

test.describe("real-site E2E: Sub2API auto-detect account add flow", () => {
  const sharedAccountCache = createSharedRealSiteAccountFixtureCache()

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
    realSiteAccountUsageChecks.modelToKey({ envPrefix: "SUB2API" }),
  ] as const

  test.skip(
    "skips account model catalog because it is unavailable",
    {
      annotation: {
        type: "skip",
        description: ACCOUNT_BACKED_MODEL_CATALOG_UNAVAILABLE_REASON,
      },
    },
    async () => {},
  )

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
                return await runRealSiteAccountSaveFlow({
                  page,
                  extensionId,
                  serviceWorker,
                  sitePage,
                  baseUrl: config.baseUrl,
                  siteType: SITE_TYPES.SUB2API,
                  expectedDetectedSiteType: SITE_TYPES.SUB2API,
                  login: async (realSitePage) => {
                    const loginResult = await loginToRealSub2ApiSite(
                      realSitePage,
                      config,
                    )
                    expect(loginResult.authState.accessToken).not.toBe("")

                    return {
                      prepareDetectedDialog: async (dialog) => {
                        await expect(dialog.siteNameInput).toHaveValue(/.+/, {
                          timeout: 30_000,
                        })

                        await expect(dialog.userIdInput).toHaveValue(/.+/, {
                          timeout: 30_000,
                        })
                        await expect
                          .poll(
                            async () =>
                              (await dialog.accessTokenInput.inputValue()) ===
                              loginResult.authState.accessToken,
                            { timeout: 30_000 },
                          )
                          .toBe(true)
                        await expect(
                          dialog.sub2apiRefreshTokenSwitch,
                        ).toHaveAttribute("aria-checked", "false")
                        await expect(
                          dialog.sub2apiImportSessionButton,
                        ).toHaveCount(0)

                        if (!loginResult.authState.refreshToken) {
                          return
                        }

                        await dialog.sub2apiRefreshTokenSwitch.click()
                        await expect(
                          dialog.sub2apiRefreshTokenSwitch,
                        ).toHaveAttribute("aria-checked", "true")

                        const importSessionButtonVisible =
                          await dialog.sub2apiImportSessionButton
                            .waitFor({ state: "visible", timeout: 5_000 })
                            .then(() => true)
                            .catch(() => false)

                        if (!importSessionButtonVisible) {
                          return
                        }

                        await dialog.sub2apiImportSessionButton.click()
                        await expect
                          .poll(
                            async () =>
                              (await dialog.sub2apiRefreshTokenInput.inputValue()) ===
                              loginResult.authState.refreshToken,
                            { timeout: 30_000 },
                          )
                          .toBe(true)
                      },
                    }
                  },
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
