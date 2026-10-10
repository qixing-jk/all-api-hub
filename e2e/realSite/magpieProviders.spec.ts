import { expect, request } from "@playwright/test"

import { test } from "~~/e2e/fixtures/extensionTest"
import {
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import {
  getManagedSiteRealSiteSkipReason,
  resolveMagpieManagedSiteConfig,
} from "~~/e2e/utils/realSite/managedSiteConfig"
import { runScenarioWithCleanup } from "~~/e2e/utils/scenarioErrors"
import { createMagpieNativeClient } from "~~/scripts/suites/magpie/native.mjs"
import { runMagpieUiScenario } from "~~/scripts/suites/magpie/ui.mjs"
import { resolveMagpieUpstream } from "~~/scripts/suites/magpie/upstream.mjs"

const resolved = resolveMagpieManagedSiteConfig()
test.use({
  trace: "off",
  screenshot: "off",
  video: "off",
  actionTimeout: 15_000,
})
test.describe.configure({ mode: "parallel", retries: 0 })

for (const scenario of [
  "management",
  "imports",
  "model-sync",
  "key-pool",
] as const) {
  test(`Magpie ${scenario}: extension UI with independent native readback and cleanup`, async ({
    page,
    context,
    extensionId,
  }, testInfo) => {
    test.setTimeout(240_000)
    test.skip(
      !resolved.config,
      getManagedSiteRealSiteSkipReason({
        label: "Magpie",
        missingEnvKeys: resolved.missingEnvKeys,
      }),
    )
    const config = resolved.config!
    const upstream =
      scenario === "model-sync"
        ? await resolveMagpieUpstream(config.baseUrl)
        : undefined
    // Separate Cookie jar: native preflight must not authenticate the extension.
    const nativeRequest = await request.newContext()
    await runScenarioWithCleanup({
      run: async () => {
        test.skip(
          scenario === "model-sync" && !upstream?.config,
          "Model sync needs AAH_E2E_UPSTREAM_BASE_URL and AAH_E2E_UPSTREAM_API_KEY reachable from browser and backend",
        )
        const native = await createMagpieNativeClient(nativeRequest, config)
        await seedUserPreferences(await getServiceWorker(context), {
          openChangelogOnUpdate: false,
        })
        await stubLlmMetadataIndex(context)
        await runMagpieUiScenario({
          page,
          extensionId,
          native,
          config,
          upstream: upstream?.config ?? null,
          scenario,
          onCheck: (description: string) =>
            testInfo.annotations.push({ type: "verified", description }),
          onCapture: async (name, target) => {
            // Only this run's synthetic provider form is captured, never real credentials.
            if (scenario === "key-pool") {
              // The shared scenario owns the viewport and expanded key row.
              const path = testInfo.outputPath(`${name}.png`)
              await target.screenshot({ path, animations: "disabled" })
              await testInfo.attach(name, { path, contentType: "image/png" })
              return
            }
            if (scenario !== "management") return
            const originalViewport = page.viewportSize()
            for (const width of [1100, 640]) {
              await page.setViewportSize({ width, height: 900 })
              await target.locator("#channel-name").scrollIntoViewIfNeeded()
              await expect(
                target.getByRole("radiogroup", { name: "API type" }),
              ).toBeVisible()
              expect(
                await target.evaluate(
                  (element) => element.scrollWidth <= element.clientWidth,
                ),
              ).toBe(true)
              const path = testInfo.outputPath(`${name}-${width}.png`)
              await target.screenshot({ path })
              await testInfo.attach(`${name}-${width}`, {
                path,
                contentType: "image/png",
              })
            }
            if (originalViewport) await page.setViewportSize(originalViewport)
          },
        })
      },
      finalizers: [
        () => nativeRequest.dispose(),
        async () => upstream?.close(),
      ],
      cleanupMessage: "Magpie test infrastructure cleanup failed",
      failureMessage: "Magpie real-site test failed",
    })
  })
}
