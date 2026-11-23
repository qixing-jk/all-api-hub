import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { createBalanceHistoryPreview } from "~/features/BalanceHistory/data/createBalanceHistoryPreview"
import { BALANCE_HISTORY_TEST_IDS } from "~/features/BalanceHistory/testIds"
import { createUsageAnalyticsPreview } from "~/features/UsageAnalytics/data/createUsageAnalyticsPreview"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { USAGE_HISTORY_STORAGE_KEYS } from "~/services/history/usageHistory/constants"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  seedStoredAccounts,
  seedUsageHistoryStore,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageJsonValue,
  getServiceWorker,
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

test("keeps long usage filter names and counts inside narrow panels", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const worker = await getServiceWorker(context)
  const fixture = createUsageAnalyticsPreview("mixed")
  const name = "Birch Gateway — Production team and shared projects"
  fixture.accounts[1]!.site_name = name
  await seedStoredAccounts(worker, fixture.accounts)
  await seedUserPreferences(worker, { autoRefresh: false })
  await seedUsageHistoryStore(worker, fixture.store.accounts)
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.USAGE_ANALYTICS}`,
  )
  const filters = page.locator('[data-slot="card"]').first()
  const chips = filters.getByRole("button", { name: new RegExp(name) })
  await expect(chips).toHaveCount(2)
  for (const [width, theme] of [
    [320, "light"],
    [390, "dark"],
    [1440, "light"],
  ] as const) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      theme === "dark",
    )
    const panel = (await filters.boundingBox())!
    for (const chip of await chips.all()) {
      const box = (await chip.boundingBox())!
      expect(box.x + box.width).toBeLessThanOrEqual(panel.x + panel.width)
      await expect(chip).toHaveAccessibleName(new RegExp(name))
      await expect(chip.locator("span[title]")).not.toHaveAttribute(
        "title",
        /\bType:/,
      )
    }
    const count = chips.nth(1).getByText("2", { exact: true })
    await expect(count).toBeInViewport({ ratio: 1 })
    const countBox = (await count.boundingBox())!
    expect(countBox.x).toBeGreaterThanOrEqual(panel.x)
    expect(countBox.x + countBox.width).toBeLessThanOrEqual(
      panel.x + panel.width,
    )
    await captureVisualViews({
      page,
      ready: filters,
      captureTarget: filters,
      id: `usage-long-filters-${width}-${theme}`,
      extensionDir,
    })
  }
  await chips.first().click()
  await expect(chips.first()).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByText("USD 2.45", { exact: true })).toBeVisible()
  await expect(page.getByText("CNY 50", { exact: true })).toHaveCount(0)
})

for (const fixture of [
  {
    page: MENU_ITEM_IDS.BALANCE_HISTORY,
    storage: STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE,
    heading: "Balance History",
    sample: "146 CNY",
    action: "Dev: Preview mixed balances",
    empty: "No snapshots yet",
    standardAction: "Dev: Preview USD balances",
    standardSample: "146 USD",
    writeAction: "Refresh now",
  },
  {
    page: MENU_ITEM_IDS.USAGE_ANALYTICS,
    storage: USAGE_HISTORY_STORAGE_KEYS.STORE,
    heading: "Usage Analytics",
    sample: "CNY 50",
    action: "Dev: Preview mixed usage costs",
    empty: "No usage history data yet",
    standardAction: "Dev: Preview USD usage costs",
    standardSample: "USD 42",
    writeAction: "Export",
  },
] as const) {
  test(`previews ${fixture.page} without changing stored history`, async ({
    context,
    page,
    extensionId,
    extensionDir,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await forceExtensionLanguage(page)
    await stubLlmMetadataIndex(context)
    await page.addInitScript(() =>
      localStorage.setItem("aah_dev_features_unlocked", "true"),
    )
    const worker = await getServiceWorker(context)
    const readSavedData = () =>
      Promise.all(
        [
          fixture.storage,
          STORAGE_KEYS.ACCOUNTS,
          STORAGE_KEYS.USER_PREFERENCES,
        ].map((key) => getPlasmoStorageJsonValue(worker, key)),
      )
    const savedName = "Saved report account"
    const saved =
      fixture.page === MENU_ITEM_IDS.BALANCE_HISTORY
        ? createBalanceHistoryPreview("mixed")
        : createUsageAnalyticsPreview("mixed")
    saved.accounts[0]!.site_name = savedName
    await seedStoredAccounts(worker, saved.accounts)
    await seedUserPreferences(worker, { autoRefresh: false })
    await setPlasmoStorageValue(worker, fixture.storage, saved.store)
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${fixture.page}`,
    )
    await expect(
      page.getByText(savedName, { exact: true }).first(),
    ).toBeVisible()
    const before = await readSavedData()
    await page.getByRole("button", { name: "Dev: Open dev panel" }).click()
    const action = page.getByRole("button", { name: fixture.action })
    await expect(action).toBeVisible()
    await action.click()
    await page.getByRole("button", { name: "Close dev panel" }).click()
    const preview = page.getByText("Dev preview · Sample data", { exact: true })
    await expect(preview).toBeVisible()
    await expect(
      page.getByRole("heading", { name: fixture.heading, exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText(fixture.sample, { exact: true }).first(),
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: fixture.writeAction, exact: true }),
    ).toBeDisabled()
    await page.mouse.move(3, 3)
    expect(await readSavedData()).toEqual(before)
    const notice = page.getByRole("alert").filter({ has: preview })
    await captureVisualViews({
      page,
      ready: preview,
      captureTarget: notice,
      id: `${fixture.page}-preview-notice`,
      extensionDir,
    })
    const exitPreview = notice.getByRole("button", { name: "Exit preview" })
    await expect(async () => {
      const title = await preview.boundingBox()
      const button = await exitPreview.boundingBox()
      expect(title).not.toBeNull()
      expect(button).not.toBeNull()
      if (!title || !button) return
      const titleCenter = title.y + title.height / 2
      const buttonCenter = button.y + button.height / 2
      expect(Math.abs(titleCenter - buttonCenter)).toBeLessThanOrEqual(1)
    }).toPass({ timeout: 2_000 })
    await captureVisualViews({
      page,
      ready: preview,
      id: fixture.page,
      extensionDir,
    })
    if (fixture.page === MENU_ITEM_IDS.USAGE_ANALYTICS) {
      await expect(page.getByText(/use_time/)).toHaveCount(0)
      await expect(page.getByText("USD 2.45", { exact: true })).toBeVisible()
      await expect(page.getByText("1,260 Token", { exact: true })).toBeVisible()
      // Independent currencies need room beside each other on desktop.
      const costs = ["CNY 50", "USD 2.45", "1,260 Token"].map((amount) =>
        page.getByText(amount, { exact: true }),
      )
      const costRows = await Promise.all(
        costs.map((value) => value.boundingBox()),
      )
      expect(costRows.every((box) => box !== null)).toBe(true)
      expect(
        Math.max(...costRows.map((box) => box!.y)) -
          Math.min(...costRows.map((box) => box!.y)),
      ).toBeLessThanOrEqual(1)
      const costSummary = page.locator('[data-slot="card"]').filter({
        has: page.getByRole("region", { name: "Recorded costs", exact: true }),
      })
      await captureVisualViews({
        page,
        ready: costSummary,
        captureTarget: costSummary,
        id: "usage-cost-summary",
        extensionDir,
      })
      const charts = page.locator('[data-slot="card"]').filter({
        has: page.getByText("Model consumption", { exact: true }),
      })
      const unitSelect = charts.getByRole("combobox", { name: "Cost unit" })
      for (const unit of ["CNY", "USD", "Token"]) {
        await unitSelect.click()
        await page.getByRole("option", { name: unit, exact: true }).click()
        await expect(unitSelect).toHaveText(unit)
        await expect(charts.locator("canvas")).toHaveCount(1)
      }
      await captureVisualViews({
        page,
        ready: charts.getByText("Model consumption", { exact: true }),
        captureTarget: charts,
        id: "usage-model-costs-by-unit",
        extensionDir,
      })
      await page.getByRole("button", { name: "Aster API", exact: true }).click()
      await expect(page.getByText("CNY 42", { exact: true })).toBeVisible()
      await expect(page.getByText("USD 2.45", { exact: true })).toHaveCount(0)
      await expect(charts.locator("canvas")).toHaveCount(1)
      await page.setViewportSize({ width: 390, height: 900 })
      const chartTypeControls = page.getByRole("group", {
        name: "Chart type",
        exact: true,
      })
      await expect(chartTypeControls.first()).toBeVisible()
      await expect(
        charts.getByRole("group", { name: "Chart type", exact: true }),
      ).toBeVisible()
      for (const control of await chartTypeControls.all()) {
        const pie = await control
          .getByRole("button", { name: "Pie", exact: true })
          .boundingBox()
        const histogram = await control
          .getByRole("button", { name: "Histogram", exact: true })
          .boundingBox()
        expect(pie).not.toBeNull()
        expect(histogram).not.toBeNull()
        expect(Math.abs(pie!.y - histogram!.y)).toBeLessThanOrEqual(1)
      }
      await page.setViewportSize({ width: 1280, height: 720 })
    } else {
      await expect(
        page.getByRole("heading", { name: "Balance and allowance trends" }),
      ).toHaveCount(0)
      const overview = page.getByTestId(BALANCE_HISTORY_TEST_IDS.overview)
      const summary = page.getByTestId(BALANCE_HISTORY_TEST_IDS.accountSummary)
      await expect(
        page
          .getByRole("group", { name: "Filters" })
          .getByRole("button", { name: "Filters", exact: true }),
      ).toBeVisible()
      const periodSummary = overview.getByRole("region", {
        name: "Period summary",
      })
      await expect(
        periodSummary.getByText("2.5 CNY", { exact: true }),
      ).toBeVisible()
      await expect(
        periodSummary.getByText("0.84 USD", { exact: true }),
      ).toBeVisible()
      await expect(
        periodSummary.getByText("$36.00", { exact: true }),
      ).toBeVisible()
      await expect(
        periodSummary.getByText(/Converted history.*USD/).first(),
      ).toBeVisible()
      await expect(
        summary.getByRole("columnheader", { name: "Start balance" }),
      ).toBeHidden()
      const trend = page.getByRole("region", { name: "Trend", exact: true })
      const breakdown = page.getByRole("region", {
        name: "Account breakdown",
        exact: true,
      })
      const [trendBounds, breakdownBounds] = await Promise.all([
        trend.boundingBox(),
        breakdown.boundingBox(),
      ])
      expect(trendBounds!.width).toBeGreaterThan(breakdownBounds!.width * 1.8)
      expect(trendBounds!.x).toBeLessThan(breakdownBounds!.x)
      expect(breakdownBounds!.height).toBeCloseTo(trendBounds!.height)
      await expect(
        breakdown.getByRole("button", { name: "Bars", pressed: true }),
      ).toBeVisible()
      const nativeOverview = overview.getByRole("region", {
        name: "Balances and allowances",
      })
      await expect(
        nativeOverview.getByText("134 CNY", { exact: true }),
      ).toBeVisible()
      await expect(
        nativeOverview.getByText("171 USD", { exact: true }),
      ).toBeVisible()
      await expect(
        nativeOverview.getByText("24 CNY", { exact: true }),
      ).toBeVisible()
      await captureVisualViews({
        page,
        ready: overview,
        captureTarget: overview,
        id: "balance-native-overview",
        extensionDir,
      })
      const filters = overview.getByRole("group", {
        name: "Filters",
        exact: true,
      })
      await expect(
        filters.getByText("30 days · 4 accounts", { exact: true }),
      ).toBeVisible()
      const filterButton = filters.getByRole("button", {
        name: "Filters",
        exact: true,
      })
      const balancesHeading = filters.getByRole("heading", {
        name: "Balances and allowances",
      })
      await expect(filterButton).toBeVisible()
      await expect(balancesHeading).toBeVisible()
      const overviewHeading = periodSummary.getByRole("heading", {
        name: "Period summary",
      })
      const nativeNote = periodSummary.getByText(
        "Native income and spending use the site's reporting dates.",
      )
      const convertedNote = periodSummary.getByText(
        /Old snapshots.*reference currency/,
      )
      const [
        headingBox,
        nativeNoteBox,
        convertedNoteBox,
        filterButtonBox,
        balancesHeadingBox,
      ] = await Promise.all([
        overviewHeading.boundingBox(),
        nativeNote.boundingBox(),
        convertedNote.boundingBox(),
        filterButton.boundingBox(),
        balancesHeading.boundingBox(),
      ])
      expect(nativeNoteBox!.x).toBeGreaterThan(
        headingBox!.x + headingBox!.width,
      )
      expect(Math.abs(nativeNoteBox!.y - headingBox!.y)).toBeLessThan(6)
      expect(convertedNoteBox!.y).toBeGreaterThan(nativeNoteBox!.y)
      expect(filterButtonBox!.x).toBeGreaterThan(balancesHeadingBox!.x)
      expect(Math.abs(filterButtonBox!.y - balancesHeadingBox!.y)).toBeLessThan(
        8,
      )
      await expect(nativeOverview.getByRole("listitem").first()).toHaveCSS(
        "border-top-width",
        "0px",
      )
      await expect(periodSummary).toHaveCSS("border-top-width", "1px")
      const tokenTrend = nativeOverview.getByRole("button", {
        name: /View trend:.*5,200 Token/,
      })
      await expect(tokenTrend).toBeVisible()
      await tokenTrend.focus()
      await page.keyboard.press("Enter")
      await expect(
        page.getByRole("button", {
          name: /^Trend: Remaining allowance.*Token/,
        }),
      ).toBeFocused()
      const tokenChart = page.getByRole("img", {
        name: /Remaining allowance.*Cedar Tokens/,
      })
      await expect(tokenChart).toBeVisible()
      await captureVisualViews({
        page,
        ready: tokenChart,
        id: "balance-overview-token-trend",
        extensionDir,
      })
      await page
        .getByRole("button", { name: /^Trend: Remaining allowance.*Token/ })
        .click()
      await page
        .getByRole("menuitemradio", { name: /^Converted balance/ })
        .click()
      const trendMetricLabel = page.getByText(/^Trend: Converted balance/)
      await expect
        .poll(() =>
          trendMetricLabel.evaluate(
            (label) => label.scrollWidth <= label.clientWidth,
          ),
        )
        .toBe(true)
      await expect(
        summary
          .getByRole("row", { name: /Cedar Tokens/ })
          .getByRole("cell", { name: "20/30", exact: true }),
      ).toBeVisible()
      for (const amount of [
        "146 CNY",
        "24 CNY",
        "171 USD",
        "5,200 Token",
        "-12 CNY",
      ]) {
        await expect(summary.getByText(amount, { exact: true })).toBeVisible()
      }
      await expect(
        periodSummary.getByText("Income total", { exact: true }),
      ).toBeVisible()
      await expect(
        summary
          .getByRole("row", { name: /Birch Gateway/ })
          .getByText("0.84 USD", { exact: true }),
      ).toBeVisible()
      await expect(
        periodSummary.getByText(/Old snapshots.*reference currency/),
      ).toBeVisible()
      await expect(
        periodSummary.getByText(
          "Native income and spending use the site's reporting dates.",
        ),
      ).toBeVisible()
      await expect(
        periodSummary.getByText(/days with records/).first(),
      ).toBeVisible()
      await captureVisualViews({
        page,
        ready: overview,
        captureTarget: overview,
        id: "balance-period-summary-details",
        extensionDir,
      })
      await trend
        .getByRole("button", { name: /^Trend: Converted balance/ })
        .click()
      await page
        .getByRole("menuitemradio", {
          name: "Recorded spending · USD",
          exact: true,
        })
        .click()
      await expect(
        trend.getByRole("img", { name: /Recorded spending.*Birch Gateway/ }),
      ).toBeVisible()
      await trend
        .getByRole("button", {
          name: "Trend: Recorded spending · USD",
          exact: true,
        })
        .click()
      await page
        .getByRole("menuitemradio", { name: /^Converted balance/ })
        .click()

      await breakdown
        .getByRole("button", { name: /^Account breakdown:/ })
        .click()
      await page
        .getByRole("menuitemradio", {
          name: "Recorded spending · USD",
          exact: true,
        })
        .click()
      await expect(
        breakdown.getByText("0.84 USD", { exact: true }),
      ).toBeVisible()
      await expect(
        breakdown.getByLabel("Reference", { exact: true }),
      ).toHaveCount(0)
      await captureVisualViews({
        page,
        ready: trend,
        id: "balance-native-period-spending",
        extensionDir,
      })
      await breakdown
        .getByRole("button", { name: /^Account breakdown: Recorded spending/ })
        .click()
      await page
        .getByRole("menuitemradio", { name: /^Converted balance/ })
        .click()
      const referenceColumns = summary.getByRole("checkbox", {
        name: "Show converted columns",
        exact: true,
      })
      await expect(referenceColumns).not.toBeChecked()
      await referenceColumns.check()
      await expect(
        summary.getByRole("columnheader", { name: "Start balance" }),
      ).toBeVisible()
      await expect(
        summary.getByText(/Select a column heading to sort/),
      ).toBeVisible()
      await expect(referenceColumns).toBeChecked()
      await captureVisualViews({
        page,
        ready: summary,
        captureTarget: summary,
        id: "balance-layout-account-references",
        extensionDir,
      })
      await referenceColumns.uncheck()
      await expect(
        summary.getByRole("columnheader", { name: "Start balance" }),
      ).toBeHidden()
      await expect(
        page.getByText("Earlier records", { exact: true }),
      ).toHaveCount(0)
      await expect(
        page.getByText("No data to display for this breakdown."),
      ).toHaveCount(0)
      await page
        .getByRole("button", { name: /^Trend: (Balance|Converted balance)/ })
        .click()
      const metricMenu = page.getByRole("menu")
      const menuLabels = await metricMenu
        .getByRole("menuitemradio")
        .allTextContents()
      await captureVisualViews({
        page,
        ready: metricMenu,
        captureTarget: metricMenu,
        id: "balance-metric-menu",
        extensionDir,
      })
      const balances = metricMenu.getByRole("group", {
        name: "Balances",
        exact: true,
      })
      await expect(
        balances.getByRole("menuitemradio", {
          name: /^Converted balance/,
        }),
      ).toBeVisible()
      await expect(
        metricMenu
          .getByRole("group", { name: "Allowances", exact: true })
          .getByRole("menuitemradio", { name: /Remaining allowance.*Token/ }),
      ).toBeVisible()
      const spending = metricMenu.getByRole("group", {
        name: "Income and spending",
        exact: true,
      })
      await expect(
        spending
          .getByRole("menuitemradio", { name: /^Income/ })
          .locator("svg[aria-hidden=true]"),
      ).toBeVisible()
      await page
        .getByRole("menuitemradio", {
          name: "Ledger balance · CNY",
          exact: true,
        })
        .click()
      await expect(
        page.getByRole("img", { name: /Aster API.*Dawn API/ }),
      ).toBeVisible()
      const trendHelp = page.getByRole("button", { name: "Trend metric guide" })
      await trendHelp.click()
      const guide = page.getByRole("dialog", { name: "Metric guide" })
      await expect(guide.locator("dt")).toHaveText([
        "Ledger balance · CNY",
        ...menuLabels.filter((label) => label !== "Ledger balance · CNY"),
      ])
      await expect(
        guide.getByText(/Credits granted by the provider/),
      ).toBeVisible()
      await guide.press("End")
      await expect(
        guide.getByText(/Reference estimate from two archived balances/),
      ).toBeInViewport({
        ratio: 1,
      })
      await guide.press("Home")
      await captureVisualViews({
        page,
        ready: guide,
        captureTarget: guide,
        id: "balance-metric-help-desktop",
        extensionDir,
      })
      if (process.env.AAH_VISUAL_CAPTURE_DIR) {
        await guide.evaluate((panel) => {
          panel.scrollTop = panel.scrollHeight
        })
      }
      await captureVisualViews({
        page,
        ready: guide,
        captureTarget: guide,
        id: "balance-metric-help-desktop-scrolled",
        extensionDir,
      })
      await trendHelp.click()
      await expect(guide).toBeHidden()
      await expect(
        page.getByRole("button", {
          name: "Trend: Ledger balance · CNY",
          exact: true,
        }),
      ).toBeVisible()
      await captureVisualViews({
        page,
        ready: summary,
        captureTarget: summary,
        id: "balance-account-summary",
        extensionDir,
      })
      for (const account of ["Birch Gateway", "Cedar Tokens"]) {
        const lines = await summary
          .getByText(account, { exact: true })
          .evaluate((element) => {
            const range = document.createRange()
            range.selectNodeContents(element)
            return new Set([...range.getClientRects()].map((rect) => rect.top))
              .size
          })
        expect(
          lines,
          `${account} should fit on one line in the desktop summary`,
        ).toBe(1)
      }
      await page
        .getByRole("button", { name: /^Account breakdown: Converted balance/ })
        .click()
      await page
        .getByRole("menuitemradio", {
          name: "Ledger balance · CNY",
          exact: true,
        })
        .click()
      await expect(
        breakdown.getByText("-12 CNY", { exact: true }),
      ).toBeVisible()
      await expect(
        breakdown.getByRole("button", { name: "Pie", exact: true }),
      ).toBeDisabled()
      await captureVisualViews({
        page,
        ready: trend,
        id: "balance-layout-signed-breakdown",
        extensionDir,
      })
      await breakdown
        .getByRole("button", { name: /^Account breakdown: Ledger balance/ })
        .click()
      await expect(
        page.getByRole("group", { name: "Allowances", exact: true }),
      ).toBeVisible()
      await page
        .getByRole("menuitemradio", { name: /Remaining allowance.*Token/ })
        .click()
      await expect(
        page.getByRole("button", {
          name: /Account breakdown: Remaining allowance.*Token/,
        }),
      ).toBeVisible()
      await page
        .getByRole("button", { name: "Account breakdown metric guide" })
        .click()
      await expect(guide.locator("dt").first()).toHaveText(
        /Remaining allowance.*Token/,
      )
      await page.keyboard.press("Escape")
      await summary.getByRole("button", { name: /5,200 Token/ }).click()
      const report = page.getByRole("dialog")
      await expect(
        report.getByRole("columnheader", { name: "Remaining", exact: true }),
      ).toBeVisible()
      await expect(
        report.getByText("First record", { exact: true }),
      ).toBeVisible()
      await captureVisualViews({
        page,
        ready: report,
        captureTarget: report,
        id: "balance-account-records",
        extensionDir,
      })
      await page.keyboard.press("Escape")
      await page.getByRole("button", { name: "Filters", exact: true }).click()
      await page
        .getByRole("button", { name: "All accounts", exact: true })
        .click()
      await page
        .getByRole("button", { name: "Cedar Tokens", exact: true })
        .click()
      await page.keyboard.press("Escape")
      await page.keyboard.press("Escape")
      await expect(nativeOverview.getByRole("button")).toHaveCount(1)
      await expect(
        nativeOverview.getByText("5,200 Token", { exact: true }),
      ).toBeVisible()
      await expect(
        overview.getByRole("region", { name: "Period summary" }),
      ).toHaveCount(0)
      await trendHelp.click()
      await expect(guide.locator("dt").first()).toHaveText(
        /Remaining allowance.*Token/,
      )
      await expect(guide).not.toContainText(
        /Ledger balance|Bonus credits|Converted balance/,
      )
      await captureVisualViews({
        page,
        ready: guide,
        captureTarget: guide,
        id: "balance-metric-help-token-filter",
        extensionDir,
      })
      await page.keyboard.press("Escape")
      await page
        .getByRole("group", { name: "Filters" })
        .getByRole("button", { name: "Reset", exact: true })
        .click()
    }
    for (const [name, text] of [
      ["Dev: Preview empty history", fixture.empty],
      [fixture.standardAction, fixture.standardSample],
    ]) {
      await page.getByRole("button", { name: "Dev: Open dev panel" }).click()
      await page.getByRole("button", { name, exact: true }).click()
      await page.getByRole("button", { name: "Close dev panel" }).click()
      await expect(page.getByText(text!, { exact: true }).first()).toBeVisible()
    }
    if (fixture.page === MENU_ITEM_IDS.BALANCE_HISTORY) {
      await page.getByRole("button", { name: "Trend metric guide" }).click()
      const guide = page.getByRole("dialog", { name: "Metric guide" })
      await expect(guide.locator("dt")).toContainText(["Ledger balance · USD"])
      await expect(guide).not.toContainText(
        /Bonus credits|Token|Ledger balance · CNY/,
      )
      await page.keyboard.press("Escape")
    }
    await exitPreview.click()
    await expect(preview).toHaveCount(0)
    await expect(
      page.getByText(fixture.standardSample, { exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByText(savedName, { exact: true }).first(),
    ).toBeVisible()
    expect(await readSavedData()).toEqual(before)
  })
}

test("keeps the Chinese balance metric menu keyboard accessible in a narrow view", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  await forceExtensionLanguage(page, "zh-CN")
  await stubLlmMetadataIndex(context)
  await page.setViewportSize({ width: 390, height: 900 })
  await page.addInitScript(() =>
    localStorage.setItem("aah_dev_features_unlocked", "true"),
  )
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BALANCE_HISTORY}`,
  )
  await page.getByRole("button", { name: "Dev: Open dev panel" }).click()
  await page
    .getByRole("button", { name: "Dev: Preview mixed balances" })
    .click()
  await page.getByRole("button", { name: "Close dev panel" }).click()
  const overview = page.getByTestId(BALANCE_HISTORY_TEST_IDS.overview)
  await captureVisualViews({
    page,
    ready: overview,
    captureTarget: overview,
    id: "balance-overview-zh-narrow",
    extensionDir,
  })
  const filters = overview.getByRole("group", { name: "筛选", exact: true })
  await expect(
    filters.getByText("近30天 · 4 个账户", { exact: true }),
  ).toBeVisible()
  await expect(
    filters.getByRole("button", { name: "筛选", exact: true }),
  ).toBeVisible()
  const balancesHeading = filters.getByRole("heading", { name: "余额与额度" })
  const [filterButtonBox, balancesHeadingBox] = await Promise.all([
    filters.getByRole("button", { name: "筛选", exact: true }).boundingBox(),
    balancesHeading.boundingBox(),
  ])
  expect(filterButtonBox!.x).toBeGreaterThan(balancesHeadingBox!.x)
  expect(Math.abs(filterButtonBox!.y - balancesHeadingBox!.y)).toBeLessThan(8)
  const periodHeading = overview.getByRole("heading", { name: "区间统计" })
  const nativeNote = overview.getByText("原币收支按站点记录日期统计。")
  const [headingBox, noteBox] = await Promise.all([
    periodHeading.boundingBox(),
    nativeNote.boundingBox(),
  ])
  expect(noteBox!.y).toBeGreaterThanOrEqual(headingBox!.y + headingBox!.height)
  await expect
    .poll(() =>
      overview.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    )
    .toBe(true)
  const chartSwitch = page.getByRole("group", { name: "图表视图" })
  await expect(
    chartSwitch.getByRole("button", { name: "趋势", pressed: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: /^账户分布[：:]/ }),
  ).toBeHidden()
  await chartSwitch
    .getByRole("button", { name: "账户分布", exact: true })
    .click()
  const trigger = page.getByRole("button", { name: /^账户分布[：:]/ })
  await expect(trigger).not.toContainText("折算余额")
  const breakdownMetricLabel = trigger.getByText(/^账户分布/)
  await expect
    .poll(() =>
      breakdownMetricLabel.evaluate(
        (label) => label.scrollWidth <= label.clientWidth,
      ),
    )
    .toBe(true)
  await trigger.focus()
  await page.keyboard.press("Enter")
  const menu = page.getByRole("menu")
  await menu.getByRole("menuitemradio", { name: /^折算余额/ }).click()
  await trigger.focus()
  await page.keyboard.press("Enter")
  const menuLabels = await menu.getByRole("menuitemradio").allTextContents()
  await expect(
    menu.getByRole("group", { name: "余额", exact: true }),
  ).toBeVisible()
  await expect(
    menu.getByRole("group", { name: "额度", exact: true }),
  ).toBeVisible()
  await expect(
    menu.getByRole("group", { name: "收支与变化", exact: true }),
  ).toBeVisible()
  await expect(
    menu.getByRole("menuitemradio", { name: "折算余额", checked: true }),
  ).toBeVisible()
  await captureVisualViews({
    page,
    ready: menu,
    captureTarget: menu,
    id: "balance-metric-menu-zh-narrow",
    extensionDir,
  })
  await page.keyboard.press("End")
  await expect(
    menu.getByRole("menuitemradio", { name: /^估算净流入/ }),
  ).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(trigger).toBeFocused()

  const help = page.getByRole("button", {
    name: "账户分布指标说明",
    exact: true,
  })
  await help.focus()
  await page.keyboard.press("Enter")
  const guide = page.getByRole("dialog", { name: "指标说明", exact: true })
  await expect(guide).toBeVisible()
  await expect(guide).toBeInViewport({ ratio: 1 })
  await expect(guide.locator("dt")).toHaveText([
    menuLabels.find((label) => label.startsWith("折算余额"))!,
    ...menuLabels.filter((label) => !label.startsWith("折算余额")),
  ])
  await expect(guide.getByText(/CNY.*人民币/)).toBeVisible()
  await captureVisualViews({
    page,
    ready: guide,
    captureTarget: guide,
    id: "balance-metric-help-zh-narrow",
    extensionDir,
  })
  await page.keyboard.press("Escape")
  await expect(guide).toBeHidden()
  await expect(help).toBeFocused()

  const jump = overview.getByRole("button", { name: /查看趋势.*5,200 Token/ })
  await jump.focus()
  await page.keyboard.press("Enter")
  await expect(
    chartSwitch.getByRole("button", { name: "趋势", pressed: true }),
  ).toBeVisible()
  await expect(page.getByRole("button", { name: /^趋势.*Token/ })).toBeFocused()
  await expect(trigger).toBeHidden()
  const summary = page.getByTestId(BALANCE_HISTORY_TEST_IDS.accountSummary)
  const aster = summary.getByRole("listitem").filter({
    has: page.getByText("Aster API", { exact: true }),
  })
  await expect(aster.getByText("26/30", { exact: true })).toBeVisible()
  await expect(aster.getByText("146 CNY", { exact: true })).toBeVisible()
  await expect(summary.getByRole("table")).toHaveCount(0)
  const references = summary.getByRole("checkbox", {
    name: "账户折算明细",
    exact: true,
  })
  await expect(references).not.toBeChecked()
  await expect(aster.getByText("开始余额", { exact: true })).toBeHidden()
  await references.check()
  await expect(aster.getByText("开始余额", { exact: true })).toBeVisible()
  await captureVisualViews({
    page,
    ready: summary,
    captureTarget: summary,
    id: "balance-layout-mobile-account-references",
    extensionDir,
  })
  const amount = summary.getByRole("button", { name: /5,200 Token/ })
  await amount.click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(amount).toBeFocused()
})
