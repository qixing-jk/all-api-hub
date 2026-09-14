import { SITE_TYPES } from "~/constants/siteType"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  OCTOPUS_IMPORT_ORIGIN,
  stubOctopusChannelImport,
} from "~~/e2e/fixtures/octopusChannelImport"
import { runManagedSiteTokenChannelStatusScenario } from "~~/e2e/scenarios/managedSiteChannels"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { seedMockAccountFixture } from "~~/e2e/utils/mockedSite/accountFixtures"

for (const version of ["jwt", "v0.12", "v0.13"] as const) {
  test(`Octopus ${version} imports a key with working models and recognizes it after reload`, async ({
    context,
    page,
    extensionId,
  }) => {
    test.setTimeout(120_000)
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    await stubNewApiSiteRoutes(context)
    const fixture = await stubOctopusChannelImport({ context, version })
    const serviceWorker = await getServiceWorker(context)
    await seedUserPreferences(serviceWorker, {
      managedSiteType: SITE_TYPES.OCTOPUS,
      octopus: {
        baseUrl: OCTOPUS_IMPORT_ORIGIN,
        username: "admin",
        password: "fixture-password",
      },
      autoCheckin: { globalEnabled: false, pretriggerDailyOnUiOpen: false },
      openChangelogOnUpdate: false,
    })
    const sourceAccount = await seedMockAccountFixture({ serviceWorker })

    try {
      const result = await runManagedSiteTokenChannelStatusScenario({
        page,
        extensionId,
        siteType: SITE_TYPES.OCTOPUS,
        label: "Octopus",
        runPrefix: `AAH E2E Octopus ${version}`,
        tokenName: `AAH E2E Octopus ${version} source`,
        sourceAccount,
      })
      expect(result.skipped).toBe(false)
      expect(fixture.createPayloads).toHaveLength(1)
      const created = fixture.createPayloads[0]
      if (version === "v0.13") {
        expect(created).toMatchObject({
          base_url: "https://example.com",
          openai_chat_completion_path: "/v1/chat/completions",
        })
        expect(fixture.getDetailReads()).toBeGreaterThan(0)
      } else if (version === "v0.12") {
        expect(created.base_url).toBe("https://example.com/v1")
      } else {
        expect(created.base_urls).toEqual([{ url: "https://example.com/v1" }])
      }
      expect(fixture.getModelProbes()).toBe(2)
      expect(fixture.getRemainingChannelCount()).toBe(0)
    } finally {
      await sourceAccount.cleanup()
    }
  })
}
