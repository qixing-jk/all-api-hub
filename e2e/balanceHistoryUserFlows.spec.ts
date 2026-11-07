import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { THEME_ATTRIBUTES, THEME_PRESET } from "~/constants/theme"
import { BALANCE_HISTORY_TEST_IDS } from "~/features/BalanceHistory/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import type { DailyBalanceHistoryStore } from "~/types/dailyBalanceHistory"
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
} from "~~/e2e/utils/commonUserFlows"
import { expectCornerShape } from "~~/e2e/utils/cornerShape"
import {
  expectPermissionOnboardingHidden,
  getPlasmoStorageJsonValue,
  getServiceWorker,
  getStoredUserPreferences,
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

function createBalanceSnapshots(): DailyBalanceHistoryStore["snapshotsByAccountId"] {
  const todayKey = getDayKeyFromUnixSeconds(Math.floor(Date.now() / 1000))
  const yesterdayKey = subtractDaysFromDayKey(todayKey, 1)
  const twoDaysAgoKey = subtractDaysFromDayKey(todayKey, 2)
  const eightDaysAgoKey = subtractDaysFromDayKey(todayKey, 8)

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
      [eightDaysAgoKey]: {
        quota: 8_000_000,
        today_income: 300_000,
        today_quota_consumption: 900_000,
        capturedAt: Date.now() - 8 * 86_400_000,
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
  await page.emulateMedia({ reducedMotion: "reduce" })
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
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
  const filterTrigger = page.getByRole("button", {
    name: "Filters",
    exact: true,
    includeHidden: true,
  })
  await expect(filterTrigger).toBeVisible()
  const overview = main.getByTestId(BALANCE_HISTORY_TEST_IDS.overview)
  await expect(overview.getByText("30 days · 2 accounts")).toBeVisible()
  // Library-generated tooltip surfaces need the same curve as their shadows.
  const chart = page.locator("canvas").last()
  await expect(chart).toBeVisible()
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
    await expect(tooltip.getByText("—", { exact: true })).toBeVisible()
    await expect(tooltip).not.toContainText("$0.00")
    await expect(tooltip).toHaveCSS("border-top-left-radius", "10px")
    await expectCornerShape(tooltip, "superellipse(1.5)")
    await expect(tooltip).not.toHaveCSS("box-shadow", "none")
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(`chart-shadow-${dark}.png`),
    })
    if (dark) {
      await expect(chart).toHaveAttribute("data-drew-gap-bridge", "true")
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
  const todayKey = getDayKeyFromUnixSeconds(Math.floor(Date.now() / 1000))
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
    overview.getByText("7 days · 1 account · Production"),
  ).toBeVisible()
  await overview.getByRole("button", { name: "Reset", exact: true }).click()
  await expect(overview.getByText("30 days · 2 accounts")).toBeVisible()
  await expect(
    overview.getByRole("button", { name: "Reset", exact: true }),
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
        ["Histogram", "Bar"],
      ]) {
        await page.getByRole("button", { name: breakdown, exact: true }).click()
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
