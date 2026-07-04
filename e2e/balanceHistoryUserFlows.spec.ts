import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { BALANCE_HISTORY_TEST_IDS } from "~/features/BalanceHistory/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  getDayKeyFromUnixSeconds,
  subtractDaysFromDayKey,
} from "~/services/history/dailyBalanceHistory/dayKeys"
import type { DailyBalanceHistoryStore } from "~/types/dailyBalanceHistory"
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
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getPlasmoStorageRawValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const BALANCE_HISTORY_URL = (extensionId: string) =>
  `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BALANCE_HISTORY}`

async function readStoredPreferences(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
) {
  const raw = await getPlasmoStorageRawValue<unknown>(
    serviceWorker,
    STORAGE_KEYS.USER_PREFERENCES,
  )

  if (typeof raw !== "string") return {}

  return JSON.parse(raw) as Record<string, unknown>
}

async function readDailyBalanceHistoryStore(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
) {
  const raw = await getPlasmoStorageRawValue<unknown>(
    serviceWorker,
    STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE,
  )

  if (typeof raw === "string") {
    return JSON.parse(raw) as DailyBalanceHistoryStore
  }

  if (raw && typeof raw === "object") {
    return raw as DailyBalanceHistoryStore
  }

  return null
}

function createBalanceSnapshots(): DailyBalanceHistoryStore["snapshotsByAccountId"] {
  const todayKey = getDayKeyFromUnixSeconds(Math.floor(Date.now() / 1000))
  const yesterdayKey = subtractDaysFromDayKey(todayKey, 1)
  const twoDaysAgoKey = subtractDaysFromDayKey(todayKey, 2)

  return {
    "balance-account-a": {
      [twoDaysAgoKey]: {
        quota: 10_000_000,
        today_income: 1_500_000,
        today_quota_consumption: 500_000,
        capturedAt: Date.now() - 2 * 86_400_000,
        source: "refresh",
      },
      [yesterdayKey]: {
        quota: 12_000_000,
        today_income: 2_000_000,
        today_quota_consumption: 700_000,
        capturedAt: Date.now() - 86_400_000,
        source: "refresh",
      },
      [todayKey]: {
        quota: 13_000_000,
        today_income: 1_000_000,
        today_quota_consumption: 600_000,
        capturedAt: Date.now(),
        source: "refresh",
      },
    },
    "balance-account-b": {
      [yesterdayKey]: {
        quota: 8_000_000,
        today_income: 300_000,
        today_quota_consumption: 900_000,
        capturedAt: Date.now() - 86_400_000,
        source: "refresh",
      },
      [todayKey]: {
        quota: 7_500_000,
        today_income: 200_000,
        today_quota_consumption: 400_000,
        capturedAt: Date.now(),
        source: "refresh",
      },
    },
  }
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("filters balance history by tag/account and persists the selected currency", async ({
  context,
  extensionId,
  page,
}) => {
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
  const main = page.getByRole("main")
  await expect(
    main.getByTestId(BALANCE_HISTORY_TEST_IDS.overview),
  ).toBeVisible()
  await expect(
    main.getByTestId(BALANCE_HISTORY_TEST_IDS.accountSummary),
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Production" })).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Balance Hub A", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Balance Hub B", exact: true }),
  ).toBeVisible()

  await page.getByRole("button", { name: "Production" }).click()

  await expect(
    page.getByRole("button", { name: "Balance Hub A", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Balance Hub B", exact: true }),
  ).toHaveCount(0)

  await page.getByRole("button", { name: "CNY (¥)" }).click()

  await expect
    .poll(async () => readStoredPreferences(serviceWorker))
    .toMatchObject({ currencyType: "CNY" })
  await expect(page.getByRole("button", { name: "CNY (¥)" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )
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
      return Object.values(store?.snapshotsByAccountId[accountId] ?? {})
    })
    .toEqual([
      expect.objectContaining({
        quota: 12_345_678,
        today_income: 0,
        today_quota_consumption: 234_567,
        source: "refresh",
        capturedAt: expect.any(Number),
      }),
    ])
  await expect(
    page.getByTestId(BALANCE_HISTORY_TEST_IDS.accountSummary),
  ).toBeVisible()
  await expect(page.getByText("Balance Refresh Hub").first()).toBeVisible()
})
