import type { Page } from "@playwright/test"

import { expect, test } from "./fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedDailyBalanceHistoryStore,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "./utils/commonUserFlows"
import { getServiceWorker } from "./utils/extensionState"
import { waitForExtensionRoot } from "./utils/lazyLoading"

/**
 * Wait for each serialized load through the always-mounted account summary badges.
 * These buttons are separate from the virtualized key-account groups below them.
 */
async function waitForKeyAccountSummaries(page: Page, count: number) {
  // Match the complete visible set in one browser query instead of scanning the
  // accessibility tree separately for every account on every inventory reload.
  await expect(
    page
      .getByRole("button", { name: /^Performance Account \d+\s*1 key$/ })
      .filter({ visible: true }),
  ).toHaveText(
    Array.from(
      { length: count },
      (_, index) => new RegExp(`^Performance Account ${index}\\s*1 key$`),
    ),
    { timeout: 30_000 },
  )
  await expect(
    page.getByText(`Total ${count} keys`, { exact: true }),
  ).toBeVisible()
}

for (const count of [10, 100]) {
  test(`major pages with ${count} accounts`, async ({
    context,
    extensionId,
  }, testInfo) => {
    testInfo.setTimeout(120_000)
    const worker = await getServiceWorker(context)
    await seedUserPreferences(worker, {
      refreshOnOpen: false,
      autoCheckin: { globalEnabled: false, pretriggerDailyOnUiOpen: false },
      balanceHistory: { estimatedTodayIncome: { enabled: false } },
    })
    await seedStoredAccounts(
      worker,
      Array.from({ length: count }, (_, index) =>
        createStoredAccount({
          id: `perf-${index}`,
          site_name: `Performance Account ${index}`,
          site_url: "https://performance.example.com",
          account_info: { id: String(index + 1), username: `perf-${index}` },
        }),
      ),
    )
    await seedDailyBalanceHistoryStore(
      worker,
      Object.fromEntries(
        Array.from({ length: count }, (_, index) => [
          `perf-${index}`,
          Object.fromEntries(
            Array.from({ length: 365 }, (_, day) => [
              new Date(Date.UTC(2025, 0, day + 1)).toISOString().slice(0, 10),
              {
                quota: 1000,
                today_income: 0,
                today_quota_consumption: 0,
                capturedAt: 1735689600000,
                source: "refresh" as const,
              },
            ]),
          ),
        ]),
      ),
    )
    await stubLlmMetadataIndex(context)
    await stubNewApiSiteRoutes(context, {
      baseUrl: "https://performance.example.com",
      models: Array.from({ length: 20 }, (_, index) => `perf-model-${index}`),
      initialTokens: [
        {
          id: 1,
          user_id: 1,
          key: "perf-secret",
          name: "Performance Key",
          status: 1,
          created_time: 0,
          accessed_time: 0,
          expired_time: -1,
          remain_quota: 0,
          unlimited_quota: true,
          model_limits_enabled: false,
          model_limits: "",
          allow_ips: "",
          used_quota: 0,
          group: "default",
        },
      ],
    })
    const measurements = []
    for (const route of [
      "popup.html",
      "options.html#account",
      "options.html#models?accountId=all",
      "options.html#keys?accountId=all",
    ]) {
      const page = await context.newPage()
      await forceExtensionLanguage(page, "en")
      installExtensionPageGuards(page)
      const cdp = await context.newCDPSession(page)
      await cdp.send("Performance.enable")
      const started = Date.now()
      let expandAllMs: number | undefined
      await page.goto(`chrome-extension://${extensionId}/${route}`)
      await waitForExtensionRoot(page)
      if (route.includes("#models")) {
        await expect(
          page.getByText("perf-model-0", { exact: true }).first(),
        ).toBeVisible({ timeout: 30_000 })
      } else if (route.includes("#keys")) {
        await waitForKeyAccountSummaries(page, count)
        const expandStarted = Date.now()
        await page
          .getByRole("button", { name: "Expand all", exact: true })
          .click()
        await expect(
          page.getByText("Performance Key", { exact: true }).first(),
        ).toBeVisible({ timeout: 30_000 })
        expandAllMs = Date.now() - expandStarted
        if (count === 100) {
          expect(
            await page
              .getByRole("group", { name: /^Performance Account / })
              .count(),
          ).toBeLessThan(20)
        }
      } else {
        await expect(page.locator("body")).toContainText("Performance Account")
      }
      const readyMs = Date.now() - started
      const { metrics } = await cdp.send("Performance.getMetrics")
      const domElements = await page.locator("*").count()
      measurements.push({
        route,
        count,
        readyMs,
        expandAllMs,
        domElements,
        metrics: Object.fromEntries(
          metrics
            .filter(({ name }) =>
              [
                "TaskDuration",
                "ScriptDuration",
                "LayoutDuration",
                "JSHeapUsedSize",
                "Nodes",
              ].includes(name),
            )
            .map(({ name, value }) => [name, value]),
        ),
      })
      if (route.includes("#keys") && count === 100) {
        await page
          .getByRole("checkbox", {
            name: "Select visible keys for account Performance Account 0",
            exact: true,
          })
          .check()
        await expect(
          page.getByText("1/100 visible selected", { exact: true }),
        ).toBeVisible()
        const lastGroup = page.getByRole("group", {
          name: "Performance Account 99",
          exact: true,
        })
        await expect(async () => {
          await page.evaluate(() =>
            window.scrollTo(0, document.documentElement.scrollHeight),
          )
          await expect(
            lastGroup.getByText("Performance Key", { exact: true }),
          ).toBeInViewport({ timeout: 500 })
        }).toPass({ timeout: 10_000 })
        await expect(
          lastGroup.getByText("Performance Key", { exact: true }),
        ).toBeVisible()
        await page.evaluate(() => window.scrollTo(0, 0))
        await expect(
          page.getByText("1/100 visible selected", { exact: true }),
        ).toBeVisible()
        const search = page.getByPlaceholder("Search key name...")
        await search.fill("does-not-exist")
        await expect(
          page.getByRole("group", { name: /^Performance Account / }),
        ).toHaveCount(0)
        await search.fill("")
        await waitForKeyAccountSummaries(page, count)
        // Native search reloads inventory; selection is pruned while its key is absent.
        await expect(
          page.getByText("0/100 visible selected", { exact: true }),
        ).toBeVisible()
        await page
          .getByRole("button", { name: "Collapse all", exact: true })
          .click()
        await expect(
          page.getByText("Performance Key", { exact: true }),
        ).toHaveCount(0)
        await page.screenshot({
          path: testInfo.outputPath("keys-collapsed.png"),
        })
        for (const width of [390, 320]) {
          await page.setViewportSize({ width, height: 720 })
          await page
            .getByRole("button", { name: "Expand all", exact: true })
            .click()
          await expect(
            page.getByText("Performance Key", { exact: true }).first(),
          ).toBeVisible()
          await page.screenshot({
            path: testInfo.outputPath(`keys-${width}.png`),
          })
        }
      }
      await page.close()
    }
    console.log(JSON.stringify(measurements))
    await testInfo.attach("performance", {
      body: JSON.stringify(measurements, null, 2),
      contentType: "application/json",
    })
  })
}
