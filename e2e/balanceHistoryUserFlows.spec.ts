import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { THEME_ATTRIBUTES, THEME_PRESET } from "~/constants/theme"
import { BALANCE_HISTORY_TEST_IDS } from "~/features/BalanceHistory/testIds"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import { balancePosition, observeAmount } from "~/services/amounts/balance"
import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { getFinancialSeriesKey } from "~/services/history/dailyBalanceHistory/identity"
import { AuthTypeEnum } from "~/types"
import {
  DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
  type DailyBalanceHistoryStore,
} from "~/types/dailyBalanceHistory"
import {
  getDayKeyFromUnixSeconds,
  subtractDaysFromDayKey,
} from "~/utils/core/dayKey"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedDailyBalanceHistoryStore,
  seedStoredAccounts,
  seedTagStore,
  seedUserPreferences,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
  type ArchivedBalanceHistorySeed,
} from "~~/e2e/utils/commonUserFlows"
import { expectCornerShape } from "~~/e2e/utils/cornerShape"
import {
  expectPermissionOnboardingHidden,
  getPlasmoStorageJsonValue,
  getServiceWorker,
  getStoredUserPreferences,
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"
import {
  setVisualDarkMode,
  setVisualThemeAttribute,
} from "~~/e2e/utils/visualTheme"

const BALANCE_HISTORY_URL = (extensionId: string) =>
  `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BALANCE_HISTORY}`

async function readDailyBalanceHistoryStore(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
) {
  return await getPlasmoStorageJsonValue<DailyBalanceHistoryStore>(
    serviceWorker,
    STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE,
  )
}

function createBalanceSnapshots(now = Date.now()): ArchivedBalanceHistorySeed {
  const todayKey = getDayKeyFromUnixSeconds(Math.floor(now / 1000))
  const yesterdayKey = subtractDaysFromDayKey(todayKey, 1)
  const twoDaysAgoKey = subtractDaysFromDayKey(todayKey, 2)
  const eightDaysAgoKey = subtractDaysFromDayKey(todayKey, 8)

  return {
    "balance-account-a": {
      [twoDaysAgoKey]: {
        quota: 10_000_000,
        today_income: 1_500_000,
        today_quota_consumption: 500_000,
        capturedAt: now - 2 * 86_400_000,
        source: "refresh",
      },
      [yesterdayKey]: {
        quota: 12_000_000,
        today_income: 2_000_000,
        today_quota_consumption: 700_000,
        capturedAt: now - 86_400_000,
        source: "refresh",
      },
      [todayKey]: {
        quota: 13_000_000,
        today_income: 1_000_000,
        today_quota_consumption: 600_000,
        capturedAt: now,
        source: "refresh",
      },
    },
    "balance-account-b": {
      [eightDaysAgoKey]: {
        quota: 8_000_000,
        today_income: 300_000,
        today_quota_consumption: 900_000,
        capturedAt: now - 8 * 86_400_000,
        source: "refresh",
      },
      [todayKey]: {
        quota: 7_500_000,
        today_income: 200_000,
        today_quota_consumption: 400_000,
        capturedAt: now,
        source: "refresh",
      },
    },
  }
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await page.emulateMedia({ reducedMotion: "reduce" })
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("selects recorded cashflow by native unit and keeps converted balance history visible", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  const worker = await getServiceWorker(context)
  const now = new Date().setHours(12, 0, 0, 0)
  await page.clock.setFixedTime(now)
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const todayKey = getDayKeyFromUnixSeconds(now / 1000)
  const twoDaysAgo = subtractDaysFromDayKey(todayKey, 2)
  const accounts = [
    createStoredAccount({
      id: "native-usd",
      site_name: "USD History",
      site_url: "https://usd-history.example.com",
    }),
    createStoredAccount({
      id: "native-cny",
      site_name: "CNY History",
      site_url: "https://cny-history.example.com",
    }),
    createStoredAccount({
      id: "archive-only",
      site_name: "Archived History",
      site_url: "https://archived-history.example.com",
    }),
  ]
  await seedStoredAccounts(worker, accounts)
  const financialSnapshotsByAccountId = Object.fromEntries(
    accounts.slice(0, 2).map((account, index) => {
      const scope = accountBalanceScope({
        baseUrl: account.site_url,
        accountId: account.id,
      })
      const asset = { kind: "currency", code: index ? "CNY" : "USD" } as const
      const source = {
        adapter: index ? "fixture" : "new-api",
        operation: index ? "balance" : "/api/user/self:quota",
        contractVersion: index ? "cny/v1" : "standard-usd/v1",
        kind: "reported" as const,
      }
      return [
        account.id,
        [yesterday.getTime(), now].map((at, day) => {
          const observation = {
            asset,
            scope,
            window: {
              start: new Date(at).setHours(0, 0, 0, 0),
              end: at,
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            coverage: "complete" as const,
          }
          return {
            source: "refresh" as const,
            balance: accountBalanceSnapshot(
              scope,
              [
                balancePosition({
                  id: "quota",
                  scope,
                  asset,
                  value: index ? "9" : day ? "8" : "9",
                  source,
                  observedAt: at,
                }),
              ],
              at,
              "complete",
            ),
            reportedIncome: [
              {
                ...observation,
                amount: observeAmount(
                  index ? (day ? "31" : "20") : day ? "4" : "2",
                  { ...source, operation: "fixture:income" },
                  at,
                ),
                classification: "unclassified" as const,
              },
            ],
            settledConsumption: [
              {
                ...observation,
                amount: observeAmount(
                  index ? (day ? "3" : "1") : day ? "2" : "1",
                  { ...source, operation: "fixture:consumption" },
                  at,
                ),
                settlement: "settled" as const,
              },
            ],
          }
        }),
      ]
    }),
  )
  await setPlasmoStorageValue(
    worker,
    STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE,
    {
      schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
      referenceSnapshotsByAccountId: {
        "archive-only": {
          [todayKey]: {
            balanceUsd: 123.45,
            incomeUsd: 4.5,
            consumptionUsd: 2.25,
            capturedAt: now,
            source: "refresh",
          },
        },
        "native-usd": {
          [twoDaysAgo]: {
            balanceUsd: 10,
            incomeUsd: 1.25,
            consumptionUsd: 0.75,
            capturedAt: now - 2 * 86_400_000,
            source: "refresh",
          },
        },
      },
      financialSnapshotsByAccountId,
    } satisfies DailyBalanceHistoryStore,
    { lock: STORAGE_LOCKS.DAILY_BALANCE_HISTORY },
  )
  await seedUserPreferences(worker, {
    currencyType: "USD",
    balanceHistory: { enabled: true, retentionDays: 90 },
  })
  await page.goto(BALANCE_HISTORY_URL(extensionId))
  const trend = page.getByRole("region", { name: "Trend", exact: true })
  const breakdown = page.getByRole("region", {
    name: "Account breakdown",
    exact: true,
  })
  const showBreakdownForCapture = async () => {
    const chartSwitch = page.getByRole("group", { name: "Chart view" })
    if (await chartSwitch.isVisible())
      await chartSwitch
        .getByRole("button", { name: "Account breakdown", exact: true })
        .click()
  }
  const summary = page.getByTestId(BALANCE_HISTORY_TEST_IDS.accountSummary)
  await expect(summary.getByText("$123.45", { exact: true })).toBeVisible()
  await expect(summary.getByText("$4.50", { exact: true })).toBeVisible()
  await expect(summary.getByText("$2.25", { exact: true })).toBeVisible()
  await expect(
    summary.getByText("Converted history · End balance", { exact: true }),
  ).toBeVisible()
  await captureVisualViews({
    page,
    ready: summary,
    captureTarget: summary,
    id: "history-mixed-archive-row",
    extensionDir,
  })
  const select = async (region: typeof trend, label: string) => {
    await region
      .getByRole("button", { name: /^(Trend|Account breakdown):/ })
      .click()
    await page.getByRole("menuitemradio", { name: label, exact: true }).click()
  }
  await expect(trend.locator("canvas")).toBeVisible()
  await expect(
    trend.getByText("Converted history", { exact: true }),
  ).toHaveCount(0)
  await select(trend, "Converted balance · Converted history")
  await expect(
    trend.getByRole("button", {
      name: "Trend: Converted balance · Converted history",
    }),
  ).toBeVisible()
  await captureVisualViews({
    page,
    ready: trend.locator("canvas"),
    captureTarget: trend,
    id: "history-converted-balance",
    extensionDir,
  })
  await trend.getByRole("button", { name: /^Trend:/ }).click()
  await expect(
    page.getByRole("menuitemradio", { name: "Income", exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole("menuitemradio", { name: "Consumption", exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole("menuitemradio", {
      name: "Income · Converted history",
      exact: true,
    }),
  ).toBeVisible()
  await captureVisualViews({
    page,
    ready: page.getByRole("menu"),
    captureTarget: page.getByRole("menu"),
    id: "history-native-metric-menu",
    extensionDir,
  })
  await page
    .getByRole("menuitemradio", { name: "Recorded income · USD", exact: true })
    .click()
  await select(breakdown, "Recorded income · USD")
  await expect(breakdown.getByText("6 USD", { exact: true })).toBeVisible()
  await expect(
    trend.getByRole("img", { name: /Recorded income.*USD/ }),
  ).toBeVisible()
  await select(trend, "Recorded income · CNY")
  await select(breakdown, "Recorded income · CNY")
  await expect(breakdown.getByText("51 CNY", { exact: true })).toBeVisible()
  await expect(
    trend.getByRole("img", { name: /Recorded income.*CNY/ }),
  ).toBeVisible()
  await captureVisualViews({
    page,
    ready: breakdown,
    captureTarget: breakdown,
    id: "history-native-cny-income",
    extensionDir,
    beforeCapture: showBreakdownForCapture,
  })
  await select(trend, "Recorded spending · USD")
  await select(breakdown, "Recorded spending · USD")
  await expect(breakdown.getByText("3 USD", { exact: true })).toBeVisible()
  await select(trend, "Income · Converted history")
  await select(breakdown, "Outcome · Converted history")
  await expect(breakdown.getByText("$0.75", { exact: true })).toBeVisible()
  await captureVisualViews({
    page,
    ready: breakdown,
    captureTarget: breakdown,
    id: "history-converted-spending",
    extensionDir,
    beforeCapture: showBreakdownForCapture,
  })
  await page.reload()
  await expect(trend.locator("canvas")).toBeVisible()
  await select(breakdown, "Recorded spending · CNY")
  await expect(breakdown.getByText("4 CNY", { exact: true })).toBeVisible()
})

test("uses the space for sparse native balance history", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  const worker = await getServiceWorker(context)
  const accountId = "sparse-native"
  const siteUrl = "https://sparse-balance.example.com"
  const scope = accountBalanceScope({ baseUrl: siteUrl, accountId })
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: accountId,
      site_name: "Sparse USD",
      site_url: siteUrl,
    }),
    ...Array.from({ length: 40 }, (_, index) =>
      createStoredAccount({
        id: `without-history-${index}`,
        site_name: `Account ${index + 1}`,
        site_url: `https://account-${index + 1}.example.com`,
      }),
    ),
  ])
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const intervals = [
    { value: "0.032622", observedAt: yesterday.getTime() },
    { value: "0.037252", observedAt: today.getTime() },
  ]
  await setPlasmoStorageValue(
    worker,
    STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE,
    {
      schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
      referenceSnapshotsByAccountId: {},
      financialSnapshotsByAccountId: {
        [accountId]: intervals.map(({ value, observedAt }) => ({
          source: "refresh",
          balance: accountBalanceSnapshot(
            scope,
            [
              balancePosition({
                id: "balance",
                role: "available",
                scope,
                asset: { kind: "currency", code: "USD" },
                value,
                observedAt,
                source: {
                  adapter: "fixture",
                  contractVersion: "1",
                  kind: "reported",
                  operation: "balance",
                },
              }),
            ],
            observedAt,
            "complete",
          ),
        })),
      },
    } satisfies DailyBalanceHistoryStore,
    { lock: STORAGE_LOCKS.DAILY_BALANCE_HISTORY },
  )
  await seedUserPreferences(worker, {
    balanceHistory: { enabled: true, retentionDays: 90 },
  })

  await page.goto(BALANCE_HISTORY_URL(extensionId))
  const overview = page.getByTestId(BALANCE_HISTORY_TEST_IDS.overview)
  const trend = page.getByRole("region", { name: "Trend", exact: true })
  const breakdown = page.getByRole("region", {
    name: "Account breakdown",
    exact: true,
  })
  const amount = overview.getByText("0.037252 USD", { exact: true })
  await expect(amount).toBeVisible()
  await expect(trend.locator("canvas")).toBeVisible()
  await captureVisualViews({
    page,
    ready: overview,
    id: "sparse-balance-report",
    extensionDir,
  })

  await expect(
    overview.getByText("1 of 41 accounts have records"),
  ).toBeVisible()
  const amountButton = overview.getByRole("button", {
    name: /View trend.*0\.037252 USD/,
  })
  const [overviewBounds, amountBounds, trendBounds, breakdownBounds] =
    await Promise.all([
      overview.boundingBox(),
      amountButton.boundingBox(),
      trend.boundingBox(),
      breakdown.boundingBox(),
    ])
  expect(amountBounds!.width).toBeGreaterThan(overviewBounds!.width * 0.8)
  expect(breakdownBounds!.y).toBeGreaterThanOrEqual(
    trendBounds!.y + trendBounds!.height,
  )
  await expect(trend.getByText(/^Recorded dates:/)).toBeVisible()
  await expect(
    breakdown.getByText("0.037252 USD", { exact: true }),
  ).toBeVisible()
  await expect(
    breakdown.getByRole("button", { name: "Pie", exact: true }),
  ).toHaveCount(0)

  await page.setViewportSize({ width: 390, height: 900 })
  const chartSwitch = page.getByRole("group", { name: "Chart view" })
  await expect(breakdown).toBeHidden()
  await chartSwitch
    .getByRole("button", { name: "Account breakdown", exact: true })
    .click()
  await expect(
    breakdown.getByText("0.037252 USD", { exact: true }),
  ).toBeVisible()
  await expect(trend).toBeHidden()
  await amountButton.click()
  await expect(trend.getByRole("button", { name: /^Trend:/ })).toBeFocused()

  await page.getByRole("button", { name: "Filters", exact: true }).click()
  const filterSheet = page.getByRole("dialog")
  const startDate = filterSheet.getByLabel("Start Date", { exact: true })
  const todayKey = getDayKeyFromUnixSeconds(Math.floor(today.getTime() / 1000))
  await startDate.fill(todayKey)
  await startDate.blur()
  await expect(startDate).toHaveValue(todayKey)
  await page.keyboard.press("Escape")
  await expect(filterSheet).toBeHidden()
  await expect(trend.getByText("0.037252 USD", { exact: true })).toBeVisible()
  await expect(trend.getByText(/^Recorded dates:/)).toBeVisible()
  await expect(trend.locator("canvas")).toHaveCount(0)
  await captureVisualViews({
    page,
    ready: trend,
    id: "sparse-balance-single-record",
    extensionDir,
  })
})

test("keeps native asset history independent from legacy reference currency", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  const worker = await getServiceWorker(context)
  const now = Date.now()
  const earlier = now - 2 * 86_400_000
  const today = getDayKeyFromUnixSeconds(Math.floor(now / 1000))
  const referenceHistory = createBalanceSnapshots(now)["balance-account-a"]!
  const scope = {
    ...accountBalanceScope({
      baseUrl: "https://balance-a.example.com",
      accountId: "balance-account-a",
      auth: { authType: AuthTypeEnum.AccessToken },
    }),
    walletId: "wallet-main",
  }
  const source = {
    adapter: "kimi",
    operation: "console",
    contractVersion: "2",
    kind: "reported" as const,
  }
  const cny = balancePosition({
    id: "wallet",
    role: "ledger",
    scope,
    asset: { kind: "currency", code: "CNY" },
    value: "76.583",
    observedAt: earlier,
    source,
  })
  const token = balancePosition({
    id: "tokens",
    role: "allowance",
    scope,
    asset: {
      kind: "quota",
      id: "fixture:tokens",
      label: "Token",
      displayScale: 1,
      displayLabel: "Token",
    },
    value: "4500",
    observedAt: earlier,
    source: { ...source, adapter: "token-fixture" },
    validity: { kind: "expires", at: now - 86_400_000 },
  })
  const fresh = balancePosition({
    ...cny,
    value: "-2",
    observedAt: now,
    source,
  })
  const inference = balancePosition({
    ...cny,
    value: "10",
    observedAt: now,
    source: { ...source, operation: "inference" },
  })
  const peerScope = {
    ...scope,
    authority: "https://balance-peer.example.com",
    subject: { kind: "account" as const, accountId: "balance-peer" },
  }
  const peerPosition = (value: string, observedAt: number) =>
    balancePosition({ ...cny, scope: peerScope, value, observedAt, source })
  const estimateStart = now - 3_600_000
  const cashflow = (
    accountScope: typeof scope,
    credit: string,
    charge: string,
  ) => {
    const observation = {
      asset: { kind: "currency", code: "CNY" } as const,
      scope: accountScope,
      window: { start: earlier - 1000, end: earlier, timeZone: "UTC" },
      coverage: "complete" as const,
    }
    return {
      reportedIncome: [
        {
          ...observation,
          amount: observeAmount(
            credit,
            { ...source, operation: "income" },
            earlier,
          ),
          classification: "unclassified" as const,
        },
      ],
      settledConsumption: [
        {
          ...observation,
          amount: observeAmount(
            charge,
            { ...source, operation: "spending" },
            earlier,
          ),
          settlement: "settled" as const,
        },
      ],
    }
  }
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "balance-account-a",
      site_name: "Native History",
      site_url: "https://balance-a.example.com",
    }),
    createStoredAccount({
      id: "balance-peer",
      site_name: "Peer History",
      site_url: peerScope.authority,
    }),
  ])
  await setPlasmoStorageValue(
    worker,
    STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE,
    {
      schemaVersion: 2,
      snapshotsByAccountId: {
        "balance-account-a": referenceHistory,
      },
      financialSnapshotsByAccountId: {
        "balance-peer": [
          {
            source: "refresh",
            ...cashflow(peerScope, "5", "4"),
            balance: accountBalanceSnapshot(
              peerScope,
              [peerPosition("150", earlier)],
              earlier,
              "complete",
            ),
          },
          {
            source: "refresh",
            balance: accountBalanceSnapshot(
              peerScope,
              [peerPosition("150", estimateStart)],
              estimateStart,
              "complete",
            ),
          },
          {
            source: "refresh",
            balance: accountBalanceSnapshot(
              peerScope,
              [peerPosition("125", now)],
              now,
              "complete",
            ),
            settledConsumption: [
              {
                scope: peerScope,
                asset: cny.asset,
                amount: observeAmount(
                  "30",
                  { ...source, operation: "spending" },
                  now,
                ),
                window: {
                  start: estimateStart + 60_000,
                  end: now,
                  timeZone: "UTC",
                },
                coverage: "partial",
                settlement: "settled",
              },
            ],
          },
        ],
        "balance-account-a": [
          {
            source: "refresh",
            ...cashflow(scope, "4", "7"),
            balance: accountBalanceSnapshot(
              scope,
              [cny, token],
              earlier,
              "complete",
            ),
          },
          {
            source: "refresh",
            balance: accountBalanceSnapshot(
              scope,
              [fresh, inference],
              now,
              "complete",
            ),
            endedPositionKeys: [getFinancialSeriesKey(token)],
          },
        ],
      },
    },
    { lock: STORAGE_LOCKS.DAILY_BALANCE_HISTORY },
  )
  await seedUserPreferences(worker, {
    currencyType: "USD",
    balanceHistory: {
      enabled: true,
      endOfDayCapture: { enabled: false },
      estimatedTodayIncome: { enabled: true },
      retentionDays: 365,
    },
  })
  await page.goto(BALANCE_HISTORY_URL(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)
  const summary = page.getByTestId(BALANCE_HISTORY_TEST_IDS.accountSummary)
  await expect(summary).toBeVisible()
  const migrated = await readDailyBalanceHistoryStore(worker)
  expect(migrated?.schemaVersion).toBe(
    DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
  )
  expect(
    migrated?.referenceSnapshotsByAccountId["balance-account-a"]?.[today],
  ).toMatchObject({
    balanceUsd: 26,
    incomeUsd: 2,
    consumptionUsd: 1.2,
  })
  expect(migrated).not.toHaveProperty("snapshotsByAccountId")
  expect(
    migrated?.financialSnapshotsByAccountId?.["balance-account-a"],
  ).toHaveLength(2)
  const convertedColumns = summary.getByRole("checkbox", {
    name: "Show converted columns",
  })
  await expect(convertedColumns).not.toBeChecked()
  await convertedColumns.check()
  await expect(
    summary.getByRole("columnheader", { name: "End balance" }),
  ).toBeVisible()
  await expect(
    summary.getByRole("columnheader", { name: "Estimated net inflow" }),
  ).toBeVisible()
  await expect(
    summary.getByRole("cell", { name: "$8.60", exact: true }),
  ).toBeVisible()
  await captureVisualViews({
    page,
    ready: summary,
    captureTarget: summary,
    id: "balance-mixed-columns",
    extensionDir,
  })
  const partialLines = await summary
    .getByText("Partial", { exact: true })
    .evaluateAll((elements) =>
      elements.map((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        return new Set(
          Array.from(range.getClientRects(), (rect) => Math.round(rect.top)),
        ).size
      }),
    )
  expect(partialLines.length).toBeGreaterThan(0)
  expect(
    partialLines.every((lines) => lines === 1),
    "Converted columns keep each Partial label readable on one line",
  ).toBe(true)
  const tableScroll = summary.locator('[data-slot="table-container"]')
  await tableScroll.evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  await expect(
    summary.getByRole("columnheader", { name: "Estimated net inflow" }),
  ).toBeInViewport()
  await captureVisualViews({
    page,
    ready: summary,
    captureTarget: summary,
    id: "balance-mixed-columns-scrolled",
    extensionDir,
  })
  await tableScroll.evaluate((element) => {
    element.scrollLeft = 0
  })
  await convertedColumns.uncheck()

  const viewport = page.viewportSize()!
  await page.setViewportSize({ width: 390, height: 900 })
  const convertedDetails = summary.getByRole("checkbox", {
    name: "Converted account details",
  })
  await expect(convertedDetails).not.toBeChecked()
  await convertedDetails.check()
  await expect(summary.getByText("End balance", { exact: true })).toBeVisible()
  await captureVisualViews({
    page,
    ready: summary,
    captureTarget: summary,
    id: "balance-mixed-mobile",
    extensionDir,
  })
  await convertedDetails.uncheck()
  await page.setViewportSize(viewport)

  const openRecords = async (name: RegExp) => {
    await summary.getByRole("button", { name }).click()
    return page.getByRole("dialog")
  }
  const closeRecords = async () => {
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toBeHidden()
  }
  const chart = page.getByRole("img", { name: /Ledger balance/ })
  await expect(chart).toBeVisible()
  await page.getByRole("button", { name: /^Trend: Ledger balance/ }).click()
  await page
    .getByRole("menuitemradio", {
      name: "Converted balance · Converted history",
      exact: true,
    })
    .click()
  await page
    .getByRole("button", {
      name: "Trend: Converted balance · Converted history",
      exact: true,
    })
    .click()
  await expect(
    page.getByRole("menuitemradio", { name: /Ledger balance.*Console/ }),
  ).toBeVisible()
  await expect(
    page.getByRole("menuitemradio", { name: /Ledger balance.*Inference API/ }),
  ).toBeVisible()
  await expect(page.getByRole("menuitemradio", { name: /kimi\// })).toHaveCount(
    0,
  )
  await page
    .getByRole("menuitemradio", { name: /Ledger balance.*Console/ })
    .click()
  await expect(chart).toHaveAccessibleName(/Native History/)
  await expect(chart).not.toHaveAccessibleName(/Peer History/)
  await page.getByRole("button", { name: "Bar", exact: true }).click()
  await expect(chart.locator("canvas")).toBeVisible()
  await page.getByRole("button", { name: "Line", exact: true }).click()
  await captureVisualViews({
    page,
    ready: chart,
    id: "native-history-trend",
    extensionDir,
  })

  let records = await openRecords(/Ledger balance.*Console/)
  await expect(
    records.getByRole("cell", { name: "76.583 CNY", exact: true }),
  ).toBeVisible()
  await expect(
    records.getByRole("cell", { name: "-2 CNY", exact: true }),
  ).toBeVisible()
  await expect(records.getByText("Technical details (debug)")).toHaveCount(0)
  await closeRecords()
  records = await openRecords(/Ledger balance.*Inference API/)
  await expect(
    records.getByRole("cell", { name: "10 CNY", exact: true }),
  ).toBeVisible()
  await closeRecords()
  records = await openRecords(/Remaining allowance/)
  for (const name of ["4,500 Token", "Expired", "Ended"]) {
    await expect(records.getByRole("cell", { name, exact: true })).toBeVisible()
  }
  await captureVisualViews({
    page,
    ready: records,
    captureTarget: records,
    id: "native-history-token-records",
    extensionDir,
  })
  await closeRecords()

  await page.getByRole("button", { name: "Filters", exact: true }).click()
  await page.getByRole("button", { name: "CNY (¥)", exact: true }).click()
  await page.keyboard.press("Escape")
  await page
    .getByTestId(BALANCE_HISTORY_TEST_IDS.overview)
    .getByRole("button", { name: "Reference exchange rates" })
    .click()
  await expect(
    page.getByText(/Native History · Reference.*1 USD = .* CNY/),
  ).toBeVisible()
  await page.keyboard.press("Escape")
  records = await openRecords(/Ledger balance.*Console/)
  await expect(
    records.getByRole("cell", { name: "76.583 CNY", exact: true }),
  ).toBeVisible()
  await closeRecords()
  await page.evaluate(() =>
    localStorage.setItem("aah_dev_features_unlocked", "true"),
  )
  await page.reload()
  await waitForExtensionRoot(page)
  for (const [name, source] of [
    [/Ledger balance.*Console/, /kimi\/console@2/],
    [/Ledger balance.*Inference API/, /kimi\/inference@2/],
  ] as const) {
    records = await openRecords(name)
    await expect(records.getByText(source)).not.toBeVisible()
    await records
      .getByText("Technical details (debug)", { exact: true })
      .click()
    await expect(records.getByText(source)).toBeVisible()
    await expect(
      records.getByText("Projects: Usage scope unverified", { exact: true }),
    ).toBeVisible()
    await closeRecords()
  }

  const periodSummary = page.getByRole("region", { name: "Period summary" })
  await expect(periodSummary.getByText("-2 CNY", { exact: true })).toBeVisible()
  await expect(summary.getByText("-3 CNY", { exact: true })).toBeVisible()
  for (const label of ["Trend", "Account breakdown"]) {
    await page.getByRole("button", { name: new RegExp(`^${label}:`) }).click()
    await page.getByRole("menuitemradio", { name: "Net change · CNY" }).click()
  }
  const netTrend = page.getByRole("img", { name: /Net change.*CNY/ })
  await expect(netTrend.locator("canvas")).toBeVisible()
  const breakdown = page.getByRole("region", { name: "Account breakdown" })
  await expect(breakdown.getByText("-3 CNY", { exact: true })).toBeVisible()
  await expect(breakdown.getByText("1 CNY", { exact: true })).toBeVisible()
  await expect(breakdown.getByLabel("Reference", { exact: true })).toHaveCount(
    0,
  )
  await captureVisualViews({
    page,
    extensionDir,
    id: "compatible-net-activity",
    ready: netTrend,
  })

  await page.getByRole("button", { name: /^Trend:/ }).click()
  await page
    .getByRole("menuitemradio", { name: "Estimated net inflow · CNY" })
    .click()
  const estimateTrend = page.getByRole("region", { name: "Trend", exact: true })
  await expect(estimateTrend.getByText(/5 CNY/)).toBeVisible()
  await estimateTrend
    .getByRole("button", { name: "Trend metric guide" })
    .click()
  await expect(
    page
      .getByRole("dialog", { name: "Metric guide" })
      .getByText(/Estimate net inflow from comparable balances/),
  ).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(
    summary.getByText("Estimated net inflow", { exact: true }),
  ).toBeVisible()
  await captureVisualViews({
    page,
    extensionDir,
    ready: estimateTrend,
    id: "native-estimate-trend",
  })

  await page.setViewportSize({ width: 390, height: 900 })
  await summary.getByRole("button", { name: "Sort by" }).click()
  await page.getByRole("menuitemradio", { name: "Net change · CNY" }).click()
  await expect(
    summary.getByRole("button", {
      name: "View account Peer History in manager",
    }),
  ).toBeVisible()
  await expect(
    summary
      .getByRole("list")
      .first()
      .getByRole("button", { name: /History/ })
      .first(),
  ).toHaveText("Peer History")
  await captureVisualViews({
    page,
    extensionDir,
    ready: summary,
    captureTarget: summary,
    id: "native-history-mobile-sort",
  })
})

test("filters balance history by tag/account and persists the selected currency", async ({
  context,
  extensionId,
  page,
  extensionDir,
}, testInfo) => {
  const serviceWorker = await getServiceWorker(context)

  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "balance-account-a",
      site_name: "Balance Hub A",
      site_url: "https://balance-a.example.com",
      tagIds: ["production"],
      account_info: {
        id: "11",
        username: "balance-user-a",
        access_token: "balance-token-a",
      },
    }),
    createStoredAccount({
      id: "balance-account-b",
      site_name: "Balance Hub B",
      site_url: "https://balance-b.example.com",
      tagIds: ["sandbox"],
      account_info: {
        id: "12",
        username: "balance-user-b",
        access_token: "balance-token-b",
      },
    }),
  ])
  await seedTagStore(serviceWorker, [
    { id: "production", name: "Production" },
    { id: "sandbox", name: "Sandbox" },
  ])
  await seedDailyBalanceHistoryStore(serviceWorker, createBalanceSnapshots())
  await seedUserPreferences(serviceWorker, {
    currencyType: "USD",
    showTodayCashflow: true,
    balanceHistory: {
      enabled: true,
      endOfDayCapture: { enabled: false },
      retentionDays: 365,
    },
  })

  await page.goto(BALANCE_HISTORY_URL(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(
    page.getByRole("heading", { name: "Balance History" }),
  ).toBeVisible()
  const main = page.getByRole("main", { includeHidden: true })
  await expect(
    main.getByTestId(BALANCE_HISTORY_TEST_IDS.overview),
  ).toBeVisible()
  await expect(
    main.getByTestId(BALANCE_HISTORY_TEST_IDS.accountSummary),
  ).toBeVisible()
  await captureVisualViews({
    page,
    ready: main.getByTestId(BALANCE_HISTORY_TEST_IDS.overview),
    id: "balance-overview",
    extensionDir,
  })
  const overview = main.getByTestId(BALANCE_HISTORY_TEST_IDS.overview)
  await expect(
    overview.getByText("Old snapshots use the selected reference currency."),
  ).toBeVisible()
  await expect(
    overview.getByRole("region", { name: "Period summary" }),
  ).toHaveCSS("border-top-width", "0px")
  await expect(
    overview.getByText("Summary details", { exact: true }),
  ).toHaveCount(0)
  const filterTrigger = page.getByRole("button", {
    name: "Filters",
    exact: true,
    includeHidden: true,
  })
  await expect(filterTrigger).toBeVisible()
  const filterBar = main.getByRole("group", { name: "Filters", exact: true })
  await expect(filterBar.getByText("30 days · 2 accounts")).toBeVisible()
  // Library-generated tooltip surfaces need the same curve as their shadows.
  const chart = page.locator("canvas").last()
  await expect(chart).toBeVisible()
  await expect(main.getByText("No records", { exact: true })).toHaveCount(0)
  // Observe actual Canvas draw calls: CSS assertions cannot establish chart sizing.
  await page.evaluate(() => {
    const originalSetLineDash = CanvasRenderingContext2D.prototype.setLineDash
    CanvasRenderingContext2D.prototype.setLineDash = function (segments) {
      if (Array.from(segments).length > 0 && this.lineWidth === 1.5) {
        this.canvas.dataset.drewGapBridge = "true"
      }
      originalSetLineDash.call(this, segments)
    }
    const original = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      const fonts = new Set(JSON.parse(this.canvas.dataset.drawnFonts || "[]"))
      fonts.add(this.font)
      this.canvas.dataset.drawnFonts = JSON.stringify([...fonts])
      return original.apply(this, args)
    }
  })
  for (const [size, pixels] of [
    ["extra-large", 16],
    ["default", 12],
  ] as const) {
    await page.locator("canvas").evaluateAll((canvases) => {
      for (const canvas of canvases) delete canvas.dataset.drawnFonts
    })
    await setVisualThemeAttribute(
      page.locator("html"),
      THEME_ATTRIBUTES.TEXT_SIZE,
      size,
    )
    await expect
      .poll(() =>
        page
          .locator("canvas")
          .evaluateAll(
            (canvases, pixels) =>
              canvases.some((canvas) =>
                (
                  JSON.parse(canvas.dataset.drawnFonts || "[]") as string[]
                ).some((font) => font.includes(`${pixels}px`)),
              ),
            pixels,
          ),
      )
      .toBe(true)
  }
  // Canvas must consume resolved colors and repaint without a reload.
  const countSeriesPixels = (rgb: number[]) =>
    page.locator("canvas").evaluateAll((canvases, target) => {
      let count = 0
      for (const canvas of canvases as HTMLCanvasElement[]) {
        const context = canvas.getContext("2d")
        if (!context) continue
        const pixels = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        ).data
        // The page cannot reach the test helper, and an absent byte reads as NaN,
        // which keeps both comparisons below false just as an absent value did.
        const pixelAt = (byteIndex: number) => pixels[byteIndex] ?? Number.NaN
        for (let index = 0; index < pixels.length; index += 4) {
          if (
            target.every(
              (channel, offset) =>
                Math.abs(pixelAt(index + offset) - channel) < 4,
            ) &&
            pixelAt(index + 3) > 200
          )
            count++
        }
      }
      return count
    }, rgb)
  for (const [hex, rgb] of [
    ["#ff00ff", [255, 0, 255]],
    ["#00ffff", [0, 255, 255]],
  ] as const) {
    await page.evaluate(
      (color) => document.documentElement.style.setProperty("--chart-1", color),
      hex,
    )
    await expect.poll(() => countSeriesPixels([...rgb])).toBeGreaterThan(20)
  }
  await expect.poll(() => countSeriesPixels([255, 0, 255])).toBe(0)
  await page.evaluate(() =>
    document.documentElement.style.removeProperty("--chart-1"),
  )
  await setVisualThemeAttribute(
    page.locator("html"),
    THEME_ATTRIBUTES.PRESET,
    THEME_PRESET.ANTHROPIC,
  )
  await expect.poll(() => countSeriesPixels([182, 95, 64])).toBeGreaterThan(20)
  await setVisualThemeAttribute(
    page.locator("html"),
    THEME_ATTRIBUTES.PRESET,
    THEME_PRESET.DEFAULT,
  )
  for (const dark of [false, true]) {
    if (dark)
      await chart.evaluate((canvas) => {
        delete canvas.dataset.drawnFonts
        delete canvas.dataset.drewGapBridge
      })
    await setVisualDarkMode(page, dark)
    if (dark) await expect(chart).toHaveAttribute("data-drawn-fonts", /px/)
    const bounds = await chart.boundingBox()
    expect(bounds).not.toBeNull()
    await chart.hover({
      position: { x: bounds!.width * 0.9, y: bounds!.height * 0.45 },
    })
    const tooltip = page.locator(
      'div[style*="border-radius: var(--radius-sm)"]',
    )
    await expect(tooltip).toBeVisible()
    await expect(
      tooltip.getByText("No record that day", { exact: true }).first(),
    ).toBeVisible()
    await expect(tooltip).not.toContainText("$0.00")
    await expect(tooltip).toHaveCSS("border-top-left-radius", "10px")
    await expectCornerShape(tooltip, "superellipse(1.5)")
    await expect(tooltip).not.toHaveCSS("box-shadow", "none")
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(`chart-shadow-${dark}.png`),
    })
    if (dark) {
      await expect(chart).not.toHaveAttribute("data-drew-gap-bridge", "true")
      await chart.screenshot({
        animations: "disabled",
        path: testInfo.outputPath("trend-gaps.png"),
      })
    }
    await page.mouse.move(0, 0)
  }
  const accountSummary = main.getByTestId(
    BALANCE_HISTORY_TEST_IDS.accountSummary,
  )
  await expect(
    accountSummary.getByRole("checkbox", { name: "Show converted columns" }),
  ).toBeChecked()
  await captureVisualViews({
    page,
    ready: accountSummary,
    captureTarget: accountSummary,
    id: "balance-archive-columns",
    extensionDir,
  })
  await expect(
    accountSummary
      .getByRole("row", { includeHidden: true })
      .filter({ hasText: "Balance Hub A" }),
  ).toBeVisible()
  await expect(
    accountSummary
      .getByRole("row", { includeHidden: true })
      .filter({ hasText: "Balance Hub B" }),
  ).toBeVisible()

  // The chart interactions above happen with no modal open. The sheet must
  // restore focus whether dismissed with Escape or by its backdrop.
  await filterTrigger.click()
  const filterSheet = page.getByRole("dialog")
  await expect(filterSheet).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(filterSheet).toBeHidden()
  await expect(filterTrigger).toBeFocused()

  await filterTrigger.click()
  await expect(filterSheet).toBeVisible()
  await page.locator('[data-slot="sheet-overlay"]').click({
    position: { x: 10, y: 10 },
  })
  await expect(filterSheet).toBeHidden()
  await expect(filterTrigger).toBeFocused()

  await filterTrigger.click()
  await expect(filterSheet).toBeVisible()
  const startDate = filterSheet.getByLabel("Start Date")
  const endDate = filterSheet.getByLabel("End Date")
  await filterSheet.getByRole("button", { name: "7 days", exact: true }).click()
  const referenceTime = Date.now()
  const todayKey = getDayKeyFromUnixSeconds(Math.floor(referenceTime / 1000))
  const sevenDays = filterSheet.getByRole("button", {
    name: "7 days",
    exact: true,
  })
  await expect(sevenDays).toHaveAttribute("aria-pressed", "true")
  await expect(startDate).toHaveValue(subtractDaysFromDayKey(todayKey, 6))
  await expect(endDate).toHaveValue(todayKey)

  const startCalendar = filterSheet.getByRole("group", { name: "Start Date" })
  const endCalendar = filterSheet.getByRole("group", { name: "End Date" })
  const startOfWeek = subtractDaysFromDayKey(todayKey, 6)
  const newStart = subtractDaysFromDayKey(todayKey, 5)
  const newEnd = subtractDaysFromDayKey(todayKey, 1)
  if (startOfWeek.slice(0, 7) !== newStart.slice(0, 7)) {
    await startCalendar.getByRole("button", { name: /next month/i }).click()
  }
  await startCalendar
    .locator(`[role="gridcell"][data-day="${newStart}"] button`)
    .click()
  await expect(startDate).toHaveValue(newStart)
  await expect(sevenDays).toHaveAttribute("aria-pressed", "false")

  if (todayKey.slice(0, 7) !== newEnd.slice(0, 7)) {
    await endCalendar.getByRole("button", { name: /previous month/i }).click()
  }
  await endCalendar
    .locator(`[role="gridcell"][data-day="${newEnd}"] button`)
    .click()
  await expect(endDate).toHaveValue(newEnd)
  await expect(
    endCalendar.locator(`[role="gridcell"][data-day="${newEnd}"]`),
  ).toHaveAttribute("aria-selected", "true")

  await filterSheet.getByRole("button", { name: "7 days", exact: true }).click()
  await expect(
    startCalendar.locator(`[role="gridcell"][data-day="${startOfWeek}"]`),
  ).toHaveAttribute("aria-selected", "true")
  await expect(
    endCalendar.locator(`[role="gridcell"][data-day="${todayKey}"]`),
  ).toHaveAttribute("aria-selected", "true")

  await filterSheet.getByRole("button", { name: "Production" }).click()
  await expect(
    accountSummary
      .getByRole("row", { includeHidden: true })
      .filter({ hasText: "Balance Hub A" }),
  ).toBeVisible()
  await expect(
    accountSummary
      .getByRole("row", { includeHidden: true })
      .filter({ hasText: "Balance Hub B" }),
  ).toHaveCount(0)

  await filterSheet.getByRole("button", { name: "All tags" }).click()
  await filterSheet.getByRole("button", { name: "Balance Hub B" }).click()
  await expect(
    accountSummary
      .getByRole("row", { includeHidden: true })
      .filter({ hasText: "Balance Hub B" }),
  ).toBeVisible()
  await expect(
    accountSummary
      .getByRole("row", { includeHidden: true })
      .filter({ hasText: "Balance Hub A" }),
  ).toHaveCount(0)
  await filterSheet.getByRole("button", { name: "All accounts" }).click()

  await filterSheet.getByRole("button", { name: "CNY (¥)" }).click()

  await expect
    .poll(async () => getStoredUserPreferences(serviceWorker))
    .toMatchObject({ currencyType: "CNY" })
  await filterSheet.getByRole("button", { name: "Production" }).click()
  await filterSheet.getByRole("button", { name: "Balance Hub A" }).click()
  await page.keyboard.press("Escape")
  await expect(filterSheet).toBeHidden()
  await expect(filterTrigger).toBeFocused()
  await expect(
    filterBar.getByText("7 days · 1 account · Production"),
  ).toBeVisible()
  await overview
    .getByRole("button", { name: "Reference exchange rates" })
    .click()
  const rates = page.getByRole("dialog", { name: "Reference exchange rates" })
  await expect(rates.getByText(/Balance Hub A.*1 USD = .* CNY/)).toBeVisible()
  await captureVisualViews({
    page,
    ready: rates,
    captureTarget: rates,
    id: "balance-reference-rates",
    extensionDir,
  })
  await page.keyboard.press("Escape")
  await expect(rates).toBeHidden()
  await filterBar.getByRole("button", { name: "Reset", exact: true }).click()
  await expect(filterBar.getByText("30 days · 2 accounts")).toBeVisible()
  await expect(
    filterBar.getByRole("button", { name: "Reset", exact: true }),
  ).toHaveCount(0)
  await expect(filterTrigger).toBeFocused()
  await filterTrigger.click()
  await expect(filterSheet).toBeVisible()
  await expect(
    filterSheet.getByRole("button", { name: "CNY (¥)" }),
  ).toHaveAttribute("aria-pressed", "true")

  await expect(
    filterSheet.getByRole("button", { name: "30 days", exact: true }),
  ).toHaveAttribute("aria-pressed", "true")
  await sevenDays.click()
  // A range containing no snapshots still leaves the filter entry available.
  const emptyRangeDay = subtractDaysFromDayKey(todayKey, 5)
  await startDate.fill(emptyRangeDay)
  await endDate.fill(emptyRangeDay)
  await endDate.press("Enter")
  await expect(main.getByText("No snapshots in this range")).toBeVisible()

  // Native date fields can emit an intermediate year while the user types.
  await endDate.fill("0002-01-01")
  await expect(endDate).toHaveValue("0002-01-01")
  await expect(startDate).toHaveValue(emptyRangeDay)
  await endDate.fill(todayKey)
  await endDate.blur()
  await expect(endDate).toHaveValue(todayKey)
  await expect(startDate).toHaveValue(emptyRangeDay)
  await expect(main.getByText("No snapshots in this range")).toBeHidden()

  const oldestAllowedDay = await startDate.getAttribute("min")
  expect(oldestAllowedDay).toBeTruthy()
  await endDate.fill(subtractDaysFromDayKey(oldestAllowedDay!, 1))
  await endDate.blur()
  await expect(startDate).toHaveValue(oldestAllowedDay!)
  await expect(endDate).toHaveValue(oldestAllowedDay!)
  await expect(startCalendar.getByRole("grid")).toBeVisible()
  await expect(endCalendar.getByRole("grid")).toBeVisible()
  await expect(filterTrigger).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(filterSheet).toBeHidden()

  const snapshots = createBalanceSnapshots(referenceTime)
  const archive = snapshots["balance-account-b"]!
  archive[subtractDaysFromDayKey(todayKey, 2)] = archive[todayKey]!
  await setPlasmoStorageValue(
    serviceWorker,
    STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE,
    { schemaVersion: 2, snapshotsByAccountId: snapshots },
    { lock: STORAGE_LOCKS.DAILY_BALANCE_HISTORY },
  )
  await page.reload()
  await waitForExtensionRoot(page)
  const trend = main.getByRole("region", { name: "Trend", exact: true })
  const gapLegend = trend.getByText("No records", { exact: true })
  await expect(gapLegend).toBeVisible()
  await captureVisualViews({
    page,
    ready: gapLegend,
    captureTarget: trend,
    id: "balance-short-gap",
    extensionDir,
  })
  await trend.getByRole("button", { name: "Bar", exact: true }).click()
  await expect(gapLegend).toHaveCount(0)
})

test("keeps balance history filters available before the first snapshot", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "balance-empty-account",
      site_name: "Balance Empty Hub",
    }),
  ])
  await seedDailyBalanceHistoryStore(serviceWorker, {
    "balance-empty-account": {},
  })
  await seedUserPreferences(serviceWorker, {
    balanceHistory: {
      enabled: true,
      endOfDayCapture: { enabled: false },
      retentionDays: 365,
    },
  })

  await page.goto(BALANCE_HISTORY_URL(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)
  await expect(page.getByText("No snapshots yet")).toBeVisible()
  const filterTrigger = page.getByRole("button", {
    name: "Filters",
    exact: true,
  })
  await expect(filterTrigger).toBeVisible()
  await filterTrigger.click()
  await expect(page.getByRole("dialog")).toBeVisible()
})

test("shows a scrollable Chinese filter sheet with many accounts", async ({
  context,
  extensionId,
  page,
  extensionDir,
}, testInfo) => {
  await forceExtensionLanguage(page, "zh-CN")
  const serviceWorker = await getServiceWorker(context)
  const accounts = Array.from({ length: 24 }, (_, index) => {
    const ordinal = String(index + 1).padStart(2, "0")
    const id =
      index === 0
        ? "balance-account-a"
        : index === 1
          ? "balance-account-b"
          : `balance-drawer-account-${ordinal}`
    return createStoredAccount({
      id,
      site_name:
        index < 2
          ? `Balance Hub ${index === 0 ? "A" : "B"}`
          : `Balance History Provider Account ${ordinal} with a Long Name`,
      site_url: `https://balance-drawer-${ordinal}.example.com`,
      tagIds: [`balance-drawer-tag-${ordinal}`],
    })
  })
  await seedStoredAccounts(serviceWorker, accounts)
  await seedTagStore(
    serviceWorker,
    accounts.map((_, index) => {
      const ordinal = String(index + 1).padStart(2, "0")
      return {
        id: `balance-drawer-tag-${ordinal}`,
        name: `Production Group ${ordinal} with a Long Provider Label`,
      }
    }),
  )
  await seedDailyBalanceHistoryStore(serviceWorker, createBalanceSnapshots())
  await seedUserPreferences(serviceWorker, {
    currencyType: "USD",
    balanceHistory: {
      enabled: true,
      endOfDayCapture: { enabled: false },
      retentionDays: 365,
    },
  })

  await page.goto(BALANCE_HISTORY_URL(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)
  const filterTrigger = page.getByRole("button", {
    name: "筛选",
    exact: true,
  })
  await expect(filterTrigger).toBeVisible()
  await filterTrigger.click()
  const filterSheet = page.getByRole("dialog")
  await expect(filterSheet).toBeVisible()
  await filterSheet
    .getByRole("button", { name: "更多", exact: true })
    .first()
    .click()

  const scrollRegion = filterSheet.locator(":scope > div.overflow-y-auto")
  await expect(scrollRegion).toBeVisible()
  await expect
    .poll(() =>
      scrollRegion.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    )
    .toBe(true)

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 700 })
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true)
    await expect
      .poll(() =>
        scrollRegion.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      )
      .toBe(true)
    const sheetBounds = await filterSheet.boundingBox()
    expect(sheetBounds).not.toBeNull()
    expect(sheetBounds!.x).toBeGreaterThanOrEqual(0)
    expect(sheetBounds!.x + sheetBounds!.width).toBeLessThanOrEqual(width)

    const bodyScrollY = await page.evaluate(() => window.scrollY)
    await filterSheet
      .getByRole("button", { name: "近1年", exact: true })
      .scrollIntoViewIfNeeded()
    await expect
      .poll(() => scrollRegion.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0)
    await expect(filterSheet.getByLabel("开始时间")).toBeVisible()
    await expect(filterSheet.getByLabel("结束时间")).toBeVisible()
    await expect(
      filterSheet.getByRole("button", { name: "近1年", exact: true }),
    ).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBe(bodyScrollY)
    await scrollRegion.evaluate((element) => {
      element.scrollTop = 0
    })
  }

  await page.keyboard.press("Escape")
  await expect(filterSheet).toBeHidden()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await setVisualDarkMode(page, true)
  await filterTrigger.click()
  await expect(filterSheet).toBeVisible()
  const tagSearch = filterSheet.getByRole("searchbox", { name: "搜索标签" })
  const accountSearch = filterSheet.getByRole("searchbox", { name: "搜索账户" })
  await expect(tagSearch).toBeVisible()
  await expect(accountSearch).toBeVisible()
  const accountSearchWidth = async () =>
    (await accountSearch.boundingBox())!.width
  await expect.poll(accountSearchWidth).toBeLessThan(40)
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await accountSearch.hover()
  await expect.poll(accountSearchWidth).toBeGreaterThan(100)
  await page.mouse.move(0, 0)
  await expect.poll(accountSearchWidth).toBeLessThan(40)
  await accountSearch.click()
  await page.mouse.move(0, 0)
  await expect(accountSearch).toBeFocused()
  await expect.poll(accountSearchWidth).toBeGreaterThan(100)
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.keyboard.press("Shift+Tab")
  // Focus travels from account search to the preceding filter controls.
  await expect.poll(accountSearchWidth).toBeLessThan(40)

  const accountTitle = await filterSheet
    .getByText("账户", { exact: true })
    .boundingBox()
  const accountSearchBounds = await accountSearch.boundingBox()
  expect(
    Math.abs(
      accountTitle!.y +
        accountTitle!.height / 2 -
        (accountSearchBounds!.y + accountSearchBounds!.height / 2),
    ),
  ).toBeLessThan(1)

  await tagSearch.fill("  PRODUCTION GROUP 24  ")
  await expect(
    filterSheet.getByRole("button", { name: /Production Group 24/ }),
  ).toBeVisible()
  await expect(
    filterSheet.getByRole("button", { name: /Production Group 01/ }),
  ).toHaveCount(0)
  await tagSearch.fill("no-matching-tag")
  await expect(
    filterSheet
      .getByRole("region", { name: "标签", exact: true })
      .getByRole("status"),
  ).toHaveText("没有匹配的结果")
  await tagSearch
    .locator("..")
    .getByRole("button", { name: "清空", exact: true })
    .click()
  await expect(tagSearch).toHaveValue("")

  await accountSearch.fill("account 24")
  const lastAccount = filterSheet.getByRole("button", {
    name: "Balance History Provider Account 24 with a Long Name",
    exact: true,
  })
  await expect(lastAccount).toBeVisible()
  await expect(lastAccount).toBeDisabled()
  await filterSheet.getByText("账户", { exact: true }).click()
  await expect(accountSearch).not.toBeFocused()
  await expect.poll(accountSearchWidth).toBeGreaterThan(100)
  await accountSearch.fill("  HUB B  ")
  const selectedAccount = filterSheet.getByRole("button", {
    name: "Balance Hub B",
    exact: true,
  })
  await selectedAccount.click()
  await accountSearch.fill("  HUB A  ")
  await filterSheet
    .getByRole("button", { name: "Balance Hub A", exact: true })
    .click()
  await accountSearch
    .locator("..")
    .getByRole("button", { name: "清空", exact: true })
    .click()
  await expect(accountSearch).toHaveValue("")
  await expect(
    filterSheet.getByRole("button", { name: "Balance Hub A", exact: true }),
  ).toHaveAttribute("aria-pressed", "true")
  // Expand the original collapsed list to read back the selection hidden by the other query.
  await filterSheet
    .getByRole("button", { name: "更多", exact: true })
    .last()
    .click()
  await expect(selectedAccount).toHaveAttribute("aria-pressed", "true")
  await accountSearch.fill("no-matching-account")
  await expect(
    filterSheet
      .getByRole("region", { name: "账户", exact: true })
      .getByRole("status"),
  ).toHaveText("没有匹配的结果")
  await accountSearch.fill("")
  await filterSheet
    .getByRole("button", { name: "全部账户", exact: true })
    .click()
  await page.keyboard.press("Escape")
  await expect(filterSheet).toBeHidden()
  await filterTrigger.click()
  await expect(
    filterSheet.getByRole("searchbox", { name: "搜索账户" }),
  ).toHaveValue("")
  await captureVisualViews({
    page,
    ready: filterSheet.locator('[data-slot="sheet-title"]'),
    id: "balance-filter-sheet-zh",
    extensionDir,
    views: [{ id: "dark-1440x1000", width: 1440, height: 1000, theme: "dark" }],
  })
  await filterSheet.screenshot({
    animations: "disabled",
    path: testInfo.outputPath("balance-filter-sheet-zh-dark-panel.png"),
  })
})

test("refreshes balance snapshots through the background runtime", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const accountId = "balance-refresh-account"
  const siteUrl = "https://balance-refresh.example.com"

  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: accountId,
      site_name: "Balance Refresh Hub",
      site_url: siteUrl,
      account_info: {
        id: "31",
        username: "balance-refresh-user",
        access_token: "balance-refresh-token",
      },
    }),
  ])
  await seedDailyBalanceHistoryStore(serviceWorker, { [accountId]: {} })
  await seedUserPreferences(serviceWorker, {
    currencyType: "USD",
    showTodayCashflow: true,
    balanceHistory: {
      enabled: true,
      endOfDayCapture: { enabled: false },
      retentionDays: 365,
    },
  })
  await stubNewApiSiteRoutes(context, {
    baseUrl: siteUrl,
    userId: "31",
    username: "balance-refresh-user",
    accessToken: "balance-refresh-token",
    initialQuota: 12_345_678,
    todayQuotaConsumption: 234_567,
  })

  await page.goto(BALANCE_HISTORY_URL(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)
  await expect(
    page.getByRole("heading", { name: "Balance History" }),
  ).toBeVisible()

  await page.getByRole("button", { name: "Refresh now" }).click()

  await expect
    .poll(async () => {
      const store = await readDailyBalanceHistoryStore(serviceWorker)
      return store?.financialSnapshotsByAccountId?.[accountId] ?? []
    })
    .toEqual([
      expect.objectContaining({
        source: "refresh",
        generation: expect.any(Number),
        balance: expect.objectContaining({
          positions: expect.arrayContaining([
            expect.objectContaining({
              asset: expect.objectContaining({ kind: "currency", code: "USD" }),
              amount: expect.objectContaining({
                status: "known",
                value: "24.691356",
              }),
            }),
          ]),
        }),
        settledConsumption: expect.arrayContaining([
          expect.objectContaining({
            asset: expect.objectContaining({ kind: "currency", code: "USD" }),
            amount: expect.objectContaining({
              status: "known",
              value: "0.469134",
            }),
          }),
        ]),
      }),
    ])
  await expect(
    page
      .getByTestId(BALANCE_HISTORY_TEST_IDS.accountSummary)
      .getByRole("row", { name: /Balance Refresh Hub/ }),
  ).toBeVisible()
  await expect(
    page
      .getByRole("region", { name: "Period summary" })
      .getByText("0.469134 USD", { exact: true }),
  ).toBeVisible()
})

for (const width of [320, 390]) {
  test(`large balance charts remain within ${width}px layouts`, async ({
    context,
    page,
    extensionId,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    const worker = await getServiceWorker(context)
    await seedStoredAccounts(worker, [
      createStoredAccount({
        id: "balance-account-a",
        site_name: "Balance Hub A",
      }),
      createStoredAccount({
        id: "balance-account-b",
        site_name: "Balance Hub B",
      }),
    ])
    await seedDailyBalanceHistoryStore(worker, createBalanceSnapshots())
    await seedUserPreferences(worker, {
      appearance: { density: "compact", textSize: "extra-large" },
      balanceHistory: {
        enabled: true,
        endOfDayCapture: { enabled: false },
        retentionDays: 365,
      },
    })
    await page.goto(BALANCE_HISTORY_URL(extensionId))
    await expect(page.locator("html")).toHaveAttribute(
      THEME_ATTRIBUTES.TEXT_SIZE,
      "extra-large",
    )
    await expect(page.locator("canvas").last()).toBeVisible()
    const chartSwitch = page.getByRole("group", { name: "Chart view" })
    const lineButton = page.getByRole("button", { name: "Line", exact: true })
    const barButton = page.getByRole("button", { name: "Bar", exact: true })
    for (const scope of ["By account", "Total"]) {
      if (scope === "Total") {
        await page.getByRole("button", { name: /View: By account/ }).click()
        await page
          .getByRole("menuitemradio", { name: "Total", exact: true })
          .click()
      }
      for (const [breakdown, trend] of [
        ["Pie", "Line"],
        ["Bars", "Bar"],
      ]) {
        await chartSwitch
          .getByRole("button", { name: "Account breakdown", exact: true })
          .click()
        await page.getByRole("button", { name: breakdown, exact: true }).click()
        if (breakdown === "Pie") {
          const pie = page
            .getByRole("region", { name: "Account breakdown" })
            .locator("canvas")
          await expect(pie).toBeVisible()
          const bounds = (await pie.boundingBox())!
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
        }
        await chartSwitch
          .getByRole("button", { name: "Trend", exact: true })
          .click()
        await page.getByRole("button", { name: trend, exact: true }).click()
        const lineBounds = (await lineButton.boundingBox())!
        const barBounds = (await barButton.boundingBox())!
        expect(lineBounds.y).toBeCloseTo(barBounds.y)
        expect(lineBounds.x + lineBounds.width).toBeLessThanOrEqual(barBounds.x)
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          )
          .toBe(true)
        for (const chart of await page.locator("canvas").all()) {
          await chart.scrollIntoViewIfNeeded()
          const bounds = (await chart.boundingBox())!
          expect(bounds.x).toBeGreaterThanOrEqual(0)
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
        }
        await page.screenshot({
          fullPage: true,
          animations: "disabled",
          path: testInfo.outputPath(
            `${scope}-${breakdown}-${trend}-${width}.png`,
          ),
        })
      }
    }
  })
}
