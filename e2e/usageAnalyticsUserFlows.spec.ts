import fs from "node:fs/promises"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { USAGE_ANALYTICS_TEST_IDS } from "~/features/UsageAnalytics/testIds"
import {
  getDayKeyFromUnixSeconds,
  subtractDaysFromDayKey,
} from "~/services/history/usageHistory/core"
import type {
  UsageHistoryAggregate,
  UsageHistoryExport,
  UsageHistoryLatencyAggregate,
} from "~/types/usageHistory"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  createUsageHistoryAccountStore,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedUsageHistoryStore,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const USAGE_ANALYTICS_URL = (extensionId: string) =>
  `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.USAGE_ANALYTICS}`

const aggregate = (
  requests: number,
  promptTokens: number,
  completionTokens: number,
  quotaConsumed: number,
): UsageHistoryAggregate => ({
  requests,
  promptTokens,
  completionTokens,
  totalTokens: promptTokens + completionTokens,
  quotaConsumed,
})

const latency = (
  count: number,
  slowCount = 0,
): UsageHistoryLatencyAggregate => ({
  count,
  sum: count * 1.2,
  max: slowCount > 0 ? 6 : 2,
  slowCount,
  unknownCount: 0,
  buckets: [0, count, 0, 0, 0, slowCount, 0, 0, 0, 0, 0],
})

async function seedUsageAnalyticsJourneyData(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
) {
  const todayKey = getDayKeyFromUnixSeconds(Math.floor(Date.now() / 1000))
  const yesterdayKey = subtractDaysFromDayKey(todayKey, 1)

  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "usage-account-a",
      site_name: "Usage Hub A",
      site_url: "https://usage-a.example.com",
      account_info: {
        id: "21",
        username: "usage-user-a",
        access_token: "usage-token-a",
      },
    }),
    createStoredAccount({
      id: "usage-account-b",
      site_name: "Usage Hub B",
      site_url: "https://usage-b.example.com",
      account_info: {
        id: "22",
        username: "usage-user-b",
        access_token: "usage-token-b",
      },
    }),
  ])
  await seedUsageHistoryStore(serviceWorker, {
    "usage-account-a": createUsageHistoryAccountStore({
      daily: {
        [yesterdayKey]: aggregate(3, 1_000, 2_000, 300_000),
        [todayKey]: aggregate(5, 2_000, 4_000, 600_000),
      },
      hourly: {
        [todayKey]: {
          "09": aggregate(2, 500, 900, 100_000),
          "10": aggregate(3, 1_500, 3_100, 500_000),
        },
      },
      dailyByModel: {
        "gpt-4o-mini": {
          [todayKey]: aggregate(4, 1_700, 3_200, 450_000),
        },
        "claude-sonnet-4.5": {
          [todayKey]: aggregate(1, 300, 800, 150_000),
        },
      },
      tokenNamesById: {
        "101": "Production key",
        "102": "Batch key",
      },
      dailyByToken: {
        "101": {
          [todayKey]: aggregate(4, 1_700, 3_200, 450_000),
        },
        "102": {
          [todayKey]: aggregate(1, 300, 800, 150_000),
        },
      },
      hourlyByToken: {
        "101": {
          [todayKey]: {
            "09": aggregate(2, 500, 900, 100_000),
            "10": aggregate(2, 1_200, 2_300, 350_000),
          },
        },
      },
      dailyByTokenByModel: {
        "101": {
          "gpt-4o-mini": {
            [todayKey]: aggregate(4, 1_700, 3_200, 450_000),
          },
        },
        "102": {
          "claude-sonnet-4.5": {
            [todayKey]: aggregate(1, 300, 800, 150_000),
          },
        },
      },
      latencyDaily: {
        [todayKey]: latency(5, 1),
      },
      latencyDailyByModel: {
        "gpt-4o-mini": {
          [todayKey]: latency(4, 0),
        },
        "claude-sonnet-4.5": {
          [todayKey]: latency(1, 1),
        },
      },
      latencyDailyByToken: {
        "101": {
          [todayKey]: latency(4, 0),
        },
        "102": {
          [todayKey]: latency(1, 1),
        },
      },
      latencyDailyByTokenByModel: {
        "101": {
          "gpt-4o-mini": {
            [todayKey]: latency(4, 0),
          },
        },
        "102": {
          "claude-sonnet-4.5": {
            [todayKey]: latency(1, 1),
          },
        },
      },
    }),
    "usage-account-b": createUsageHistoryAccountStore({
      daily: {
        [todayKey]: aggregate(2, 400, 700, 120_000),
      },
      dailyByModel: {
        "gpt-3.5-turbo": {
          [todayKey]: aggregate(2, 400, 700, 120_000),
        },
      },
      tokenNamesById: {
        "201": "Sandbox key",
      },
      dailyByToken: {
        "201": {
          [todayKey]: aggregate(2, 400, 700, 120_000),
        },
      },
      latencyDaily: {
        [todayKey]: latency(2, 0),
      },
    }),
  })

  return { todayKey, yesterdayKey }
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("filters usage analytics by site, account, token, and opens usage settings", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedUsageAnalyticsJourneyData(serviceWorker)

  await page.goto(USAGE_ANALYTICS_URL(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(
    page.getByRole("heading", { name: "Usage Analytics" }),
  ).toBeVisible()
  await expect(page.getByText("Daily overview")).toBeVisible()
  await expect(page.getByText("Model distribution")).toBeVisible()
  await expect(page.getByText("Latency trend")).toBeVisible()

  await page.getByRole("button", { name: "Usage Hub A" }).first().click()

  await expect(
    page.getByRole("button", { name: "Production key (#101)" }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Batch key (#102)" }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Sandbox key (#201)" }),
  ).toHaveCount(0)

  await page.getByRole("button", { name: "Production key (#101)" }).click()
  await expect(page.getByText("Output tokens")).toBeVisible()

  await page.getByRole("button", { name: "Usage settings" }).click()

  await waitForExtensionRoot(page)
  const url = new URL(page.url())
  expect(url.hash).toBe("#basic")
  expect(url.searchParams.get("tab")).toBe("accountUsage")
  expect(url.searchParams.get("anchor")).toBe("usage-history-sync")
})

test("exports the selected usage analytics account range as JSON", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const { todayKey, yesterdayKey } =
    await seedUsageAnalyticsJourneyData(serviceWorker)

  await page.goto(USAGE_ANALYTICS_URL(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(
    page.getByRole("heading", { name: "Usage Analytics" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Usage Hub A" }).first().click()
  await expect(
    page.getByRole("button", { name: "Production key (#101)" }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Sandbox key (#201)" }),
  ).toHaveCount(0)

  const downloadPromise = page.waitForEvent("download")
  await page
    .getByTestId(USAGE_ANALYTICS_TEST_IDS.page)
    .getByRole("button", { name: "Export" })
    .click()

  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(
    /^all-api-hub-usage-history-\d{4}-\d{2}-\d{2}\.json$/,
  )

  const downloadPath = await download.path()
  if (!downloadPath) {
    throw new Error("Usage analytics export did not produce a readable file")
  }

  const exported = JSON.parse(
    await fs.readFile(downloadPath, "utf8"),
  ) as UsageHistoryExport

  expect(exported.schemaVersion).toBe(1)
  expect(exported.selection).toEqual({
    accountIds: ["usage-account-a"],
    startDay: yesterdayKey,
    endDay: todayKey,
  })
  expect(Object.keys(exported.accounts)).toEqual(["usage-account-a"])
  expect(exported.accounts["usage-account-a"].daily).toMatchObject({
    [yesterdayKey]: {
      requests: 3,
      promptTokens: 1_000,
      completionTokens: 2_000,
      totalTokens: 3_000,
      quotaConsumed: 300_000,
    },
    [todayKey]: {
      requests: 5,
      promptTokens: 2_000,
      completionTokens: 4_000,
      totalTokens: 6_000,
      quotaConsumed: 600_000,
    },
  })
  expect(exported.accounts["usage-account-a"].tokenNamesById).toEqual({
    "101": "Production key",
    "102": "Batch key",
  })
  expect(exported.fused.daily[todayKey]).toMatchObject({
    requests: 5,
    totalTokens: 6_000,
  })
  expect(exported.fused.byModel).toMatchObject({
    "gpt-4o-mini": expect.objectContaining({
      requests: 4,
      totalTokens: 4_900,
    }),
    "claude-sonnet-4.5": expect.objectContaining({
      requests: 1,
      totalTokens: 1_100,
    }),
  })
  expect(exported.fused.tokenNamesById).toEqual({
    "101": "Production key",
    "102": "Batch key",
  })
  expect(exported.fused.byModel).not.toHaveProperty("gpt-3.5-turbo")
})
