import { SITE_TYPES } from "~/constants/siteType"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  OCTOPUS_IMPORT_ORIGIN,
  stubOctopusChannelImport,
} from "~~/e2e/fixtures/octopusChannelImport"
import {
  runManagedSiteCredentialImportScenario,
  runManagedSiteTokenChannelStatusScenario,
} from "~~/e2e/scenarios/managedSiteChannels"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { seedMockAccountFixture } from "~~/e2e/utils/mockedSite/accountFixtures"
import { parallelizeShardableSpec } from "~~/e2e/utils/parallelizeShardableSpec"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

parallelizeShardableSpec()

test("imports standalone credentials without any source account or management requests", async ({
  context,
  page,
  extensionId,
}) => {
  test.setTimeout(120_000)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  const upstream = {
    baseUrl: "https://independent-upstream.example.invalid/proxy/v1",
    apiKey: "sk-independent-upstream",
  }
  const sourceRequests: string[] = []
  await context.route(
    "https://independent-upstream.example.invalid/**",
    async (route) => {
      sourceRequests.push(new URL(route.request().url()).pathname)
      expect(route.request().headers().authorization).toBe(
        `Bearer ${upstream.apiKey}`,
      )
      await route.fulfill({ json: { data: [{ id: "gpt-4o-mini" }] } })
    },
  )
  const fixture = await stubOctopusChannelImport({
    context,
    version: "v0.13",
    upstream,
  })
  await seedUserPreferences(await getServiceWorker(context), {
    managedSiteType: SITE_TYPES.OCTOPUS,
    octopus: {
      baseUrl: OCTOPUS_IMPORT_ORIGIN,
      username: "admin",
      password: "fixture-password",
    },
    autoCheckin: { globalEnabled: false, pretriggerDailyOnUiOpen: false },
    openChangelogOnUpdate: false,
  })
  await runManagedSiteCredentialImportScenario({
    page,
    extensionId,
    siteType: SITE_TYPES.OCTOPUS,
    label: "Octopus",
    runPrefix: "AAH E2E standalone",
    upstream,
  })
  expect(sourceRequests.length).toBeGreaterThan(0)
  expect(new Set(sourceRequests)).toEqual(new Set(["/proxy/v1/models"]))
  expect(fixture.createPayloads).toHaveLength(1)
  expect(fixture.createPayloads[0]).toMatchObject({
    base_url: "https://independent-upstream.example.invalid/proxy",
  })
  expect(fixture.getModelProbes()).toBe(2)
  expect(fixture.getRemainingChannelCount()).toBe(0)
})

for (const version of ["jwt", "v0.12", "v0.13"] as const) {
  for (const models of [["gpt-4o-mini", "gpt-4.1-mini"], []]) {
    test(`Octopus ${version} imports a key with ${models.length ? "available" : "no upstream"} models and recognizes it after reload`, async ({
      context,
      page,
      extensionId,
    }) => {
      test.setTimeout(120_000)
      await forceExtensionLanguage(page, "en")
      await stubLlmMetadataIndex(context)
      await stubNewApiSiteRoutes(context, { models })
      const fixture = await stubOctopusChannelImport({
        context,
        version,
        models,
      })
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
          verifyExactModelMatch: models.length > 0,
        })
        expect(result.skipped).toBe(false)
        expect(fixture.createPayloads).toHaveLength(1)
        const created = atIndex(fixture.createPayloads, 0)
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
}
