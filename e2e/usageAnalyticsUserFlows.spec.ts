import fs from "node:fs/promises"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { USAGE_ANALYTICS_TEST_IDS } from "~/features/UsageAnalytics/testIds"
import { accountBalanceScope } from "~/services/accounts/balanceSnapshot"
import { STORAGE_LOCKS } from "~/services/core/storageKeys"
import { USAGE_HISTORY_STORAGE_KEYS } from "~/services/history/usageHistory/constants"
import { ingestConsumeLogItems } from "~/services/history/usageHistory/core"
import {
  LogType,
  type LogItem,
} from "~/services/history/usageHistory/usageLogModel"
import { AuthTypeEnum } from "~/types"
import type {
  UsageHistoryAggregate,
  UsageHistoryExport,
  UsageHistoryLatencyAggregate,
  UsageHistoryStore,
} from "~/types/usageHistory"
import {
  getDayKeyFromUnixSeconds,
  subtractDaysFromDayKey,
} from "~/utils/core/dayKey"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  createUsageHistoryAccountStore,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedUsageHistoryStore,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getPlasmoStorageJsonValue,
  getServiceWorker,
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

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
  ...(quotaConsumed > 0 ? { referenceCostUsd: quotaConsumed / 500_000 } : {}),
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

test("shows native settled charges and migrated reference costs", async ({
  context,
  extensionId,
  extensionDir,
  page,
}, testInfo) => {
  const worker = await getServiceWorker(context)
  const now = Date.now()
  const dayKey = getDayKeyFromUnixSeconds(now / 1000)
  const scope = accountBalanceScope({
    baseUrl: "https://native-usage.example",
    accountId: "native",
    auth: { authType: AuthTypeEnum.AccessToken },
  })
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "native",
      site_name: "Native usage",
      site_url: scope.authority,
    }),
  ])
  await seedUserPreferences(worker, { currencyType: "USD" })
  const account = createUsageHistoryAccountStore()
  const day = {
    ...aggregate(2, 100, 200, 0),
    quotaConsumed: 500_000,
    consumption: [
      {
        asset: { kind: "currency", code: "CNY" },
        amount: {
          status: "known",
          value: "3.25",
          observedAt: now,
          source: {
            adapter: "fixture",
            operation: "settled-log",
            contractVersion: "2",
            kind: "reported",
          },
        },
        scope,
        window: { start: now - 3600000, end: now, timeZone: "UTC" },
        settlement: "settled",
        coverage: "partial",
      },
    ],
  }
  await setPlasmoStorageValue(
    worker,
    USAGE_HISTORY_STORAGE_KEYS.STORE,
    {
      schemaVersion: 2,
      accounts: {
        native: {
          ...account,
          daily: { [dayKey]: day },
          dailyByModel: { "example-model": { [dayKey]: day } },
        },
      },
    },
    { lock: STORAGE_LOCKS.USAGE_HISTORY },
  )
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(USAGE_ANALYTICS_URL(extensionId))
  await waitForExtensionRoot(page)
  await expect(page.getByText("CNY 3.25", { exact: true })).toBeVisible()
  await expect(page.getByText("Reference costs", { exact: true })).toBeVisible()
  await expect(page.getByText("$1.00", { exact: true })).toBeVisible()
  const migrated = await getPlasmoStorageJsonValue<UsageHistoryStore>(
    worker,
    USAGE_HISTORY_STORAGE_KEYS.STORE,
  )
  expect(migrated?.schemaVersion).toBe(3)
  expect(migrated?.accounts.native?.daily[dayKey]).toMatchObject({
    referenceCostUsd: 1,
  })
  expect(migrated?.accounts.native?.daily[dayKey]).not.toHaveProperty(
    "quotaConsumed",
  )
  await expect(
    page.getByText("Some charges may be missing.", { exact: true }),
  ).toBeVisible()
  const summary = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText("Recorded costs", { exact: true }) })
  await summary.screenshot({
    path: testInfo.outputPath("native-usage-summary.png"),
    animations: "disabled",
  })
  await captureVisualViews({
    page,
    extensionDir,
    id: "native-usage-summary",
    ready: summary,
    captureTarget: summary,
  })
  for (const [id, name] of [
    ["usage-reference-trend", "Daily overview"],
    ["usage-model-costs", "Model consumption"],
  ] as const) {
    const chart = page.locator('[data-slot="card"]').filter({
      has: page.getByText(name, { exact: true }),
    })
    await expect(chart.locator("canvas").first()).toBeVisible()
    await captureVisualViews({
      page,
      extensionDir,
      id,
      ready: chart,
      captureTarget: chart,
    })
  }
  await seedUsageHistoryStore(worker, {
    native: createUsageHistoryAccountStore({
      daily: { [dayKey]: aggregate(2, 100, 200, 500000) },
    }),
  })
  await page.reload()
  await waitForExtensionRoot(page)
  await expect(
    page.getByText("Reference costs", {
      exact: true,
    }),
  ).toBeVisible()
  await expect(page.getByText("$1.00", { exact: true })).toBeVisible()
  await expect(page.getByText("CNY 3.25", { exact: true })).toHaveCount(0)
  const referenceSummary = page.locator('[data-slot="card"]').filter({
    has: page.getByText("Reference costs", { exact: true }),
  })
  await captureVisualViews({
    page,
    extensionDir,
    id: "usage-reference-only",
    ready: referenceSummary,
    captureTarget: referenceSummary,
    views: [{ id: "mobile", theme: "light", width: 390, height: 900 }],
  })

  const zeroDay = { ...aggregate(1, 20, 30, 0), quotaConsumed: 0 }
  await setPlasmoStorageValue(
    worker,
    USAGE_HISTORY_STORAGE_KEYS.STORE,
    {
      schemaVersion: 1,
      accounts: {
        native: {
          ...account,
          daily: { [dayKey]: zeroDay },
          dailyByModel: { "free-model": { [dayKey]: zeroDay } },
        },
      },
    },
    { lock: STORAGE_LOCKS.USAGE_HISTORY },
  )
  await page.reload()
  await waitForExtensionRoot(page)
  await expect(referenceSummary.getByText("$0", { exact: true })).toBeVisible()
  const zeroCostModelChart = page.locator('[data-slot="card"]').filter({
    has: page.getByText("Model consumption", { exact: true }),
  })
  await expect(zeroCostModelChart.locator("canvas")).toBeVisible()
  await expect(
    zeroCostModelChart.getByRole("button", { name: "Pie" }),
  ).toBeDisabled()
  await expect(
    zeroCostModelChart.getByRole("button", { name: "Histogram" }),
  ).toHaveAttribute("aria-pressed", "true")
  await captureVisualViews({
    page,
    extensionDir,
    id: "usage-zero-reference",
    ready: zeroCostModelChart,
    captureTarget: zeroCostModelChart,
  })
  const recordedDay = (value: string, requests = 1): UsageHistoryAggregate => ({
    requests,
    promptTokens: 20,
    completionTokens: 30,
    totalTokens: 50,
    consumption: [
      {
        asset: { kind: "currency", code: "USD" },
        scope,
        amount: {
          status: "known",
          value,
          observedAt: now,
          source: {
            adapter: "fixture",
            operation: "settled-log",
            contractVersion: "2",
            kind: "reported",
          },
        },
        window: { start: now - 3600000, end: now, timeZone: "UTC" },
        settlement: "settled",
        coverage: "partial",
      },
    ],
  })
  const nativeZero = recordedDay("0")
  await seedUsageHistoryStore(worker, {
    native: createUsageHistoryAccountStore({
      daily: { [dayKey]: nativeZero },
      dailyByModel: { "free-native-model": { [dayKey]: nativeZero } },
    }),
  })
  await page.reload()
  await waitForExtensionRoot(page)
  await expect(
    zeroCostModelChart.getByRole("button", { name: "Pie" }),
  ).toBeDisabled()
  await expect(
    zeroCostModelChart.getByRole("button", { name: "Histogram" }),
  ).toHaveAttribute("aria-pressed", "true")
  await captureVisualViews({
    page,
    extensionDir,
    id: "usage-zero-native",
    ready: zeroCostModelChart,
    captureTarget: zeroCostModelChart,
  })
  const signedModels = Object.fromEntries([
    ...Array.from({ length: 12 }, (_, index) => [
      `paid-${index}`,
      { [dayKey]: recordedDay("1") },
    ]),
    ["refund-model", { [dayKey]: recordedDay("-1") }],
  ])
  await seedUsageHistoryStore(worker, {
    native: createUsageHistoryAccountStore({
      daily: { [dayKey]: recordedDay("11", 13) },
      dailyByModel: signedModels,
    }),
  })
  await page.reload()
  await waitForExtensionRoot(page)
  await expect(
    page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByText("Recorded costs", { exact: true }) }),
  ).toContainText("11")
  await expect(
    zeroCostModelChart.getByRole("button", { name: "Pie" }),
  ).toBeDisabled()
  await expect(
    zeroCostModelChart.getByRole("button", { name: "Histogram" }),
  ).toHaveAttribute("aria-pressed", "true")
  await captureVisualViews({
    page,
    extensionDir,
    id: "usage-signed-model-tail",
    ready: zeroCostModelChart,
    captureTarget: zeroCostModelChart,
  })

  const freshAccount = createUsageHistoryAccountStore()
  ingestConsumeLogItems({
    accountStore: freshAccount,
    items: [
      {
        id: 1,
        type: LogType.Consume,
        model_name: "fresh-free-model",
        created_at: Date.parse(`${dayKey}T12:00:00Z`) / 1000,
        prompt_tokens: 20,
        completion_tokens: 30,
        quota: 0,
      } as LogItem,
    ],
    startCursor: freshAccount.cursor,
    cursorCandidate: freshAccount.cursor,
    timeZone: "UTC",
  })
  await seedUsageHistoryStore(worker, { native: freshAccount })
  await page.reload()
  await waitForExtensionRoot(page)
  await expect(referenceSummary.getByText("$0", { exact: true })).toBeVisible()
  await expect(zeroCostModelChart.locator("canvas")).toBeVisible()
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

  expect(exported.schemaVersion).toBe(3)
  expect(exported.selection).toEqual({
    accountIds: ["usage-account-a"],
    startDay: yesterdayKey,
    endDay: todayKey,
  })
  expect(Object.keys(exported.accounts)).toEqual(["usage-account-a"])
  expect(atIndex(exported.accounts, "usage-account-a").daily).toMatchObject({
    [yesterdayKey]: {
      requests: 3,
      promptTokens: 1_000,
      completionTokens: 2_000,
      totalTokens: 3_000,
      referenceCostUsd: 0.6,
    },
    [todayKey]: {
      requests: 5,
      promptTokens: 2_000,
      completionTokens: 4_000,
      totalTokens: 6_000,
      referenceCostUsd: 1.2,
    },
  })
  expect(atIndex(exported.accounts, "usage-account-a").tokenNamesById).toEqual({
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
