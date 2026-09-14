import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { THEME_ATTRIBUTES, THEME_PRESET } from "~/constants/theme"
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
import { expectCornerShape } from "~~/e2e/utils/cornerShape"
import {
  expectPermissionOnboardingHidden,
  getPlasmoStorageJsonValue,
  getServiceWorker,
  getStoredUserPreferences,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
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
  const main = page.getByRole("main")
  await expect(
    main.getByTestId(BALANCE_HISTORY_TEST_IDS.overview),
  ).toBeVisible()
  await expect(
    main.getByTestId(BALANCE_HISTORY_TEST_IDS.accountSummary),
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Production" })).toBeVisible()
  // Library-generated tooltip surfaces need the same curve as their shadows.
  const chart = page.locator("canvas").last()
  await expect(chart).toBeVisible()
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
        for (let index = 0; index < pixels.length; index += 4) {
          if (
            target.every(
              (channel, offset) =>
                Math.abs(pixels[index + offset] - channel) < 4,
            ) &&
            pixels[index + 3] > 200
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
    await setVisualDarkMode(page, dark)
    const bounds = await chart.boundingBox()
    expect(bounds).not.toBeNull()
    await chart.hover({
      position: { x: bounds!.width * 0.9, y: bounds!.height * 0.45 },
    })
    const tooltip = page.locator(
      'div[style*="border-radius: var(--radius-sm)"]',
    )
    await expect(tooltip).toBeVisible()
    await expect(tooltip).toHaveCSS("border-top-left-radius", "10px")
    await expectCornerShape(tooltip, "superellipse(1.5)")
    await expect(tooltip).not.toHaveCSS("box-shadow", "none")
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(`chart-shadow-${dark}.png`),
    })
    await page.mouse.move(0, 0)
  }
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
    .poll(async () => getStoredUserPreferences(serviceWorker))
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
    page
      .getByTestId(BALANCE_HISTORY_TEST_IDS.accountSummary)
      .getByText("Balance Refresh Hub", { exact: true }),
  ).toBeVisible()
})
