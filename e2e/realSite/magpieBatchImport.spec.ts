import { createHash, randomUUID } from "node:crypto"

import { SITE_TYPES } from "~/constants/siteType"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { runScenarioWithCleanup } from "~~/e2e/utils/scenarioErrors"
import { createMagpieNativeClient } from "~~/scripts/suites/magpie/native.mjs"

// Management writes/readback use a real backend; source key inventory is a fixture.
test.use({ trace: "off", video: "off", screenshot: "off" })

test("Magpie batch import creates one provider with selected keys and remembers organization", async ({
  context,
  page,
  extensionId,
  request,
}, testInfo) => {
  const baseUrl = process.env.AAH_E2E_MAGPIE_BASE_URL
  const webKey = process.env.AAH_E2E_MAGPIE_WEB_KEY
  test.skip(!baseUrl || !webKey, "Requires a disposable Magpie backend")
  const config = { baseUrl: baseUrl!, webKey: webKey! }
  const prefix = `AAH batch ${randomUUID()}`
  const native = await createMagpieNativeClient(request, config)
  const baseline = await native.inventory()
  const keys = [
    `sk-first-${randomUUID()}`,
    `sk-second-${randomUUID()}`,
    `sk-third-${randomUUID()}`,
  ]
  await runScenarioWithCleanup({
    run: async () => {
      await forceExtensionLanguage(page, "en")
      await stubLlmMetadataIndex(context)
      const worker = await getServiceWorker(context)
      await seedStoredAccounts(worker, [
        createStoredAccount({
          site_name: prefix,
          account_info: { username: prefix },
        }),
      ])
      await seedUserPreferences(worker, {
        managedSiteType: SITE_TYPES.MAGPIE,
        magpie: config,
        openChangelogOnUpdate: false,
        autoCheckin: { globalEnabled: false },
        managedSiteModelSync: { enabled: false },
      })
      await stubNewApiSiteRoutes(context, {
        models: ["aah-batch-model"],
        initialTokens: keys.map((key, index) => ({
          id: index + 1,
          user_id: 1,
          name: `Batch key ${index + 1}`,
          key,
          status: 1,
          created_time: 0,
          accessed_time: 0,
          expired_time: -1,
          remain_quota: -1,
          unlimited_quota: true,
          used_quota: 0,
          model_limits_enabled: false,
          model_limits: "",
          allow_ips: "",
          group: "default",
        })),
      })
      await page.goto(
        `chrome-extension://${extensionId}/options.html#keys?accountId=e2e-account-1`,
      )
      await waitForExtensionRoot(page)
      for (const index of [1, 2])
        await page
          .getByRole("checkbox", { name: new RegExp(`Batch key ${index}`) })
          .check()
      await page
        .getByRole("button", { name: /Batch import to Magpie/i })
        .click()
      const mode = page.getByRole("combobox", {
        name: "Key import method",
        exact: true,
      })
      await expect(mode).toHaveText("Create one new channel per key")
      await mode.click()
      await page
        .getByRole("option", {
          name: "Combine same-site keys into one new channel",
          exact: true,
        })
        .click()
      const group = page.getByTestId("managed-site-import-group")
      await expect(group).toHaveCount(1)
      await expect(group).toContainText("2 keys")
      const resourceName = `${prefix} shared provider`
      await group
        .getByRole("textbox", { name: "New channel name", exact: true })
        .fill(resourceName)
      const secondKey = page
        .getByRole("dialog")
        .getByRole("checkbox", { name: /Batch key 2/ })
      await secondKey.uncheck()
      await expect(group).toContainText("1 key")
      await secondKey.check()
      await expect(group).toContainText("2 keys")
      await mode.scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath("magpie-grouped-preview.png"),
        fullPage: true,
      })
      await page
        .getByRole("button", { name: "Start import", exact: true })
        .click()
      await page
        .getByRole("dialog", { name: "Import selected keys", exact: true })
        .getByRole("button", { name: "Start import", exact: true })
        .click()
      await expect
        .poll(
          async () =>
            (await native.inventory())
              .filter((provider: { name: string }) =>
                provider.name.includes(prefix),
              )
              .map((provider) =>
                Array.isArray(provider.keyList) ? provider.keyList.length : 0,
              ),
          { timeout: 45_000 },
        )
        .toEqual([2])
      const created = (await native.inventory()).find(
        (provider: { name: string }) => provider.name.includes(prefix),
      )
      if (!created) throw new Error("Grouped provider was not persisted")
      expect(created.name).toBe(resourceName)
      if (!Array.isArray(created.keyList))
        throw new Error("Native key pool is missing")
      expect(created.keyList.map((key) => key.id).sort()).toEqual(
        keys
          .slice(0, 2)
          .map((key) =>
            createHash("sha256").update(key).digest("hex").slice(0, 10),
          )
          .sort(),
      )
      expect(created.chat).toBe("https://example.com/v1")
      expect(created.chosen).toContain("aah-batch-model")
      await expect(page.getByText("Imported", { exact: true })).toHaveCount(2)
      await page.screenshot({
        path: testInfo.outputPath("magpie-grouped-batch.png"),
        fullPage: true,
      })
      await page
        .getByRole("button", { name: "Close", exact: true })
        .last()
        .click()
      // Reimport includes existing pool members and one missing key. Native key
      // actions must preserve the provider instead of submitting another save.
      const beforeAppend = (await native.inventory()).find(
        (provider) => provider.id === created.id,
      )
      if (!beforeAppend || !Array.isArray(beforeAppend.keyList))
        throw new Error("Existing provider pool is missing")
      let saves = 0
      let additions = 0
      const countWrites = (request: import("@playwright/test").Request) => {
        if (request.url().endsWith("/api/provider/save")) saves++
        if (request.url().endsWith("/api/keys/add")) additions++
      }
      context.on("request", countWrites)
      for (const index of [1, 2, 3])
        await page
          .getByRole("checkbox", { name: new RegExp(`Batch key ${index}`) })
          .check()
      await page
        .getByRole("button", { name: /Batch import to Magpie/i })
        .click()
      await mode.click()
      await page
        .getByRole("option", {
          name: "Prefer adding to an existing channel",
          exact: true,
        })
        .click()
      await page
        .getByRole("dialog")
        .getByRole("checkbox", { name: /Batch key 3/ })
        .check()
      await page.screenshot({
        path: testInfo.outputPath("magpie-reuse-preview.png"),
        fullPage: true,
      })
      await expect(group).toHaveCount(1)
      await expect(group).toContainText(
        `Add to existing channel: ${resourceName}`,
      )
      await page
        .getByRole("button", { name: "Start import", exact: true })
        .click()
      await page
        .getByRole("dialog", { name: "Import selected keys", exact: true })
        .getByRole("button", { name: "Start import", exact: true })
        .click()
      await expect(page.getByText("Imported", { exact: true })).toHaveCount(1)
      const afterAppend = (await native.inventory()).find(
        (provider) => provider.id === created.id,
      )
      if (!afterAppend || !Array.isArray(afterAppend.keyList))
        throw new Error("Appended provider pool is missing")
      expect(afterAppend?.keyList).toHaveLength(3)
      expect(afterAppend).toMatchObject({
        name: beforeAppend.name,
        chat: beforeAppend.chat,
        chosen: beforeAppend.chosen,
        off: beforeAppend.off,
      })
      for (const original of beforeAppend.keyList)
        expect(
          afterAppend.keyList.find((key) => key.id === original.id),
        ).toEqual(original)
      expect(
        (await native.inventory()).filter((provider) =>
          provider.name.includes(prefix),
        ),
      ).toHaveLength(1)
      expect(saves).toBe(0)
      expect(additions).toBe(1)
      context.off("request", countWrites)
      await page
        .getByRole("button", { name: "Close", exact: true })
        .last()
        .click()
      await native.remove(created.id)
      await page.reload()
      for (const index of [1, 2])
        await page
          .getByRole("checkbox", { name: new RegExp(`Batch key ${index}`) })
          .check()
      await page
        .getByRole("button", { name: /Batch import to Magpie/i })
        .click()
      await expect(mode).toHaveText("Prefer adding to an existing channel")
      await mode.click()
      await page
        .getByRole("option", {
          name: "Create one new channel per key",
          exact: true,
        })
        .click()
      await expect(group).toHaveCount(0)
      await page
        .getByRole("button", { name: "Start import", exact: true })
        .click()
      await page
        .getByRole("dialog", { name: "Import selected keys", exact: true })
        .getByRole("button", { name: "Start import", exact: true })
        .click()
      await expect
        .poll(
          async () =>
            (await native.inventory())
              .filter((provider) => provider.name.includes(prefix))
              .map((provider) =>
                Array.isArray(provider.keyList) ? provider.keyList.length : 0,
              ),
          { timeout: 45_000 },
        )
        .toEqual([1, 1])
    },
    finalizers: [
      async () => {
        for (const provider of await native.inventory()) {
          if (
            provider.name.includes(prefix) &&
            !baseline.some(
              (original: { id: string }) => original.id === provider.id,
            )
          )
            await native.remove(provider.id)
        }
        expect(await native.inventory()).toEqual(baseline)
      },
    ],
    cleanupMessage: "Magpie batch import cleanup failed",
    failureMessage: "Magpie batch import failed",
  })
})
