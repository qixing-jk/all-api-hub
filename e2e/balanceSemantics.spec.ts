import {
  POPUP_PAGE_PATH,
  SIDEPANEL_PAGE_PATH,
} from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
import { POPUP_TEST_IDS } from "~/entrypoints/popup/testIds"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { SHARE_SNAPSHOT_TEST_IDS } from "~/features/ShareSnapshots/testIds"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import {
  balancePosition,
  observeAmount,
  staleObservation,
} from "~/services/amounts/balance"
import type { FinancialConsumptionFact } from "~/services/amounts/usage"
import { parseKimiFinancialData } from "~/services/apiService/kimiOpenPlatform/balance"
import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { LogType } from "~/services/history/usageHistory/usageLogModel"
import { AuthTypeEnum, type AccountStorageConfig } from "~/types"
import { DEFAULT_BALANCE_HISTORY_PREFERENCES } from "~/types/dailyBalanceHistory"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageJsonValue,
  getServiceWorker,
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

const capturedAt = 1765000000000

for (const lastKnown of [false, true]) {
  test(`exports identifiable purchased and granted wallet components with retained values ${lastKnown}`, async ({
    page,
    context,
    extensionId,
  }, testInfo) => {
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    const worker = await getServiceWorker(context)
    const scope = accountBalanceScope({
      baseUrl: "https://freemodel.dev",
      accountId: "credit-share",
    })
    const common = {
      nature: "prepaid" as const,
      scope,
      asset: { kind: "currency" as const, code: "USD" },
      observedAt: Date.now(),
      source: {
        adapter: "freemodel",
        operation: "/api/billing",
        contractVersion: "credit-cents/v1",
        kind: "reported" as const,
      },
    }
    const balance = accountBalanceSnapshot(
      scope,
      [
        balancePosition({ ...common, id: "available", value: "3" }),
        balancePosition({
          ...common,
          id: "purchased",
          value: "2",
          funding: "purchased",
          parentId: "available",
          relation: "component",
        }),
        balancePosition({
          ...common,
          id: "signup-credit",
          value: "1",
          funding: "granted",
          parentId: "available",
          relation: "component",
        }),
      ],
      Date.now(),
      "complete",
    )
    await seedStoredAccounts(worker, [
      createStoredAccount({
        id: "credit-share",
        site_type: SITE_TYPES.FREEMODEL,
        site_name: "FreeModel credits",
        site_url: scope.authority,
        account_info: {
          balance: lastKnown
            ? {
                ...balance,
                positions: balance.positions.map((position) => ({
                  ...position,
                  amount: staleObservation(position.amount),
                })),
              }
            : balance,
          quota: undefined,
        },
      }),
    ])
    await seedUserPreferences(worker, {
      currencyType: "USD",
      showTodayCashflow: false,
    })
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: undefined,
      }),
    )
    await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
    await waitForExtensionRoot(page)
    const row = page.getByTestId(
      getAccountManagementListItemTestId("credit-share"),
    )
    await row.hover()
    await row
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton)
      .click()
    await page
      .getByRole("menuitem", { name: "Share", exact: true })
      .press("ArrowRight")
    const download = page.waitForEvent("download")
    await page
      .getByRole("menuitem", { name: "Share account snapshot", exact: true })
      .click()
    await (
      await download
    ).saveAs(
      testInfo.outputPath(
        lastKnown
          ? "wallet-components-share-stale.png"
          : "wallet-components-share.png",
      ),
    )
    await expect(
      page.getByTestId(SHARE_SNAPSHOT_TEST_IDS.captionTextarea),
    ).toHaveValue(/Purchased/)
    await expect(
      page.getByTestId(SHARE_SNAPSHOT_TEST_IDS.captionTextarea),
    ).toHaveValue(/Granted/)
    if (lastKnown)
      await expect(
        page.getByTestId(SHARE_SNAPSHOT_TEST_IDS.captionTextarea),
      ).toHaveValue(/Last known value/)
  })
}

for (const [surface, path, width, themeMode] of [
  ["popup", POPUP_PAGE_PATH, 380, "light"],
  ["sidepanel", SIDEPANEL_PAGE_PATH, 320, "dark"],
] as const) {
  test(`keeps current Kimi components visible after a partial refresh in ${surface}`, async ({
    page,
    context,
    extensionId,
  }, testInfo) => {
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    const worker = await getServiceWorker(context)
    const id = "kimi-partial-refresh"
    const scope = accountBalanceScope({
      baseUrl: "https://platform.moonshot.ai",
      accountId: id,
    })
    const balance = parseKimiFinancialData(
      { status: true, code: 0, data: {} },
      scope,
      "USD",
      "inference",
    ).balance
    let partial = false
    await context.route(
      "https://api.moonshot.ai/v1/users/me/balance",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: true,
            code: 0,
            data: partial
              ? { cash_balance: 1 }
              : { available_balance: 12, cash_balance: 2, voucher_balance: 10 },
          }),
        }),
    )
    await seedStoredAccounts(worker, [
      createStoredAccount({
        id,
        site_type: SITE_TYPES.KIMI_GLOBAL,
        site_name: "Kimi partial refresh",
        site_url: scope.authority,
        account_info: { balance, quota: undefined, access_token: "sk-fixture" },
      }),
    ])
    await seedUserPreferences(worker, { themeMode, showTodayCashflow: false })
    await page.setViewportSize({ width, height: 800 })
    await page.goto(`chrome-extension://${extensionId}/${path}`)
    await waitForExtensionRoot(page)
    const row = page.getByTestId(getAccountManagementListItemTestId(id))
    await expect(row).toBeVisible()
    await row.hover()
    await row
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton)
      .click()
    await page
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowRefreshMenuItem)
      .click()
    await expect(row.getByRole("group", { name: /\$12\.00/ })).toBeVisible()
    partial = true
    await row.hover()
    await row
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton)
      .click()
    await page
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowRefreshMenuItem)
      .click()
    await expect(
      row.getByRole("group", { name: /Cash balance.*\$1\.00/ }),
    ).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath(`${surface}-partial-refresh.png`),
      animations: "disabled",
    })
    const stored = (await getPlasmoStorageJsonValue<AccountStorageConfig>(
      worker,
      STORAGE_KEYS.ACCOUNTS,
    ))!.accounts.find((account) => account.id === id)!
    expect(
      stored.account_info.balance?.positions.map(({ id, role, amount }) => [
        id,
        role,
        amount.status,
        "value" in amount ? amount.value : undefined,
      ]),
    ).toEqual([
      ["available", "available", "stale", "12"],
      ["cash", "ledger", "known", "1"],
      ["voucher", "ledger", "stale", "10"],
    ])
    await page.reload()
    await expect(
      row.getByRole("group", { name: /Cash balance.*\$1\.00/ }),
    ).toBeVisible()
    await row
      .getByRole("button", { name: "Balance details", exact: true })
      .click()
    const details = page.getByRole("dialog", {
      name: "Balance details",
      exact: true,
    })
    await expect(details).toContainText(/USD\s*12/)
    await expect(details).toContainText("Last known value")
    await details.screenshot({
      path: testInfo.outputPath(`${surface}-partial-refresh-details.png`),
      animations: "disabled",
    })
  })
}

test("presents Kimi balance totals and components without internal classifications", async ({
  page,
  context,
  extensionId,
}, testInfo) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const worker = await getServiceWorker(context)
  const now = Date.now()
  const scope = accountBalanceScope({
    baseUrl: "https://platform.kimi.com",
    accountId: "kimi-details",
  })
  const data = parseKimiFinancialData(
    { code: 0, data: { cur: -200000, voucher_cur: 1000000 } },
    scope,
    "CNY",
    "console",
    now - 4 * 60 * 60 * 1000,
  )
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "kimi-details",
      site_type: SITE_TYPES.KIMI,
      site_name: "Kimi balance fixture",
      site_url: "https://platform.kimi.com",
      last_sync_time: now,
      account_info: {
        balance: {
          ...data.balance,
          positions: data.balance.positions.map((position) => ({
            ...position,
            amount:
              position.amount.status === "known"
                ? {
                    ...position.amount,
                    status: "stale",
                    reason: "request-failed",
                  }
                : position.amount,
          })),
        },
      },
    }),
  ])
  for (const [name, path, width, themeMode] of [
    ["popup", POPUP_PAGE_PATH, 380, "light"],
    ["sidepanel", SIDEPANEL_PAGE_PATH, 320, "dark"],
  ] as const) {
    await seedUserPreferences(worker, { themeMode, showTodayCashflow: false })
    await page.setViewportSize({ width, height: 800 })
    await page.goto(`chrome-extension://${extensionId}/${path}`)
    await waitForExtensionRoot(page)
    const row = page.getByTestId(
      getAccountManagementListItemTestId("kimi-details"),
    )
    await row
      .getByRole("button", { name: "Balance details", exact: true })
      .click()
    const details = page.getByRole("dialog", {
      name: "Balance details",
      exact: true,
    })
    await expect(details).toContainText("CNY 8")
    await expect(details).toContainText("-CNY 2")
    await expect(details).toContainText("CNY 10")
    await expect(details).toContainText("Last known value")
    await page.mouse.move(0, 0)
    await expect(page.getByRole("tooltip")).toHaveCount(0)
    await details.screenshot({
      path: testInfo.outputPath(`${name}-balance-details.png`),
      animations: "disabled",
    })
    await expect(details).not.toContainText("Mixed credit types")
    await expect(details).not.toContainText("Component")
    await expect(details.locator("summary")).toHaveCount(0)
    const amount = details.getByText("CNY 8", { exact: true })
    const lastKnown = details
      .getByText("Last known value", { exact: true })
      .first()
    const time = details.locator("time").first()
    const statusBox = (await lastKnown.boundingBox())!
    const timeBox = (await time.boundingBox())!
    expect(Math.abs(statusBox.y - timeBox.y)).toBeLessThan(4)
    expect(timeBox.x).toBeGreaterThan(statusBox.x + statusBox.width)
    const componentLabel = details.getByText("Voucher credit", { exact: true })
    const totalLabel = details
      .getByText("Available credit", { exact: true })
      .first()
    expect((await componentLabel.boundingBox())!.x).toBeGreaterThan(
      (await totalLabel.boundingBox())!.x,
    )
    expect(
      parseFloat(await amount.evaluate((el) => getComputedStyle(el).fontSize)),
    ).toBeGreaterThan(
      parseFloat(
        await details
          .getByText("CNY 10", { exact: true })
          .evaluate((el) => getComputedStyle(el).fontSize),
      ),
    )
    expect(
      await details.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true)
    await page.evaluate(() => {
      localStorage.setItem("aah_dev_features_unlocked", "true")
      window.dispatchEvent(new CustomEvent("aah_dev_features_changed"))
    })
    const diagnostics = details
      .locator("summary")
      .filter({ hasText: "Technical details (debug)" })
    await expect(diagnostics).toHaveCount(3)
    await expect(
      details.getByText("Mixed credit types", { exact: false }),
    ).not.toBeVisible()
    await expect(page.getByRole("tooltip")).toHaveCount(0)
    await details.screenshot({
      path: testInfo.outputPath(`${name}-balance-details-dev.png`),
      animations: "disabled",
    })
    await diagnostics.first().click()
    await expect(
      details.getByText("Mixed credit types", { exact: false }),
    ).toBeVisible()
    await expect(details).toContainText("kimi/console/account@2")
    await page.evaluate(() => {
      localStorage.removeItem("aah_dev_features_unlocked")
      window.dispatchEvent(new CustomEvent("aah_dev_features_changed"))
    })
  }
})

test("shows New API income recorded only in log text after refresh", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  const baseUrl = "https://income-log.example.com"
  const accountId = "income-log-account"
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await stubNewApiSiteRoutes(context, { baseUrl })
  await context.route(`${baseUrl}/api/log/self?**`, (route) => {
    const type = new URL(route.request().url()).searchParams.get("type")
    const content = type === String(LogType.Topup) ? "充值 ¥7.00 额度" : null
    return route.fulfill({
      json: {
        success: true,
        data: {
          total: content ? 1 : 0,
          items: content ? [{ quota: 0, content }] : [],
        },
      },
    })
  })
  const worker = await getServiceWorker(context)
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: accountId,
      site_name: "New API income logs",
      site_url: baseUrl,
    }),
  ])
  await seedUserPreferences(worker, {
    currencyType: "USD",
    showTodayCashflow: true,
  })
  await page.setViewportSize({ width: 390, height: 780 })
  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)
  const row = page.getByTestId(getAccountManagementListItemTestId(accountId))
  const income = row.getByRole("button", { name: /refresh today's income/ })
  await income.click()
  await expect(income).toHaveText("+$1.00")
  const summary = page.getByRole("region", {
    name: "Financial totals",
    exact: true,
  })
  await expect(summary).toContainText(/USD\s*1(?:\.00)?/)
  await captureVisualViews({
    page,
    extensionDir,
    id: "new-api-income-log",
    ready: income,
  })
})

test("keeps saved balance references and switches the displayed currency after a failed refresh", async ({
  page,
  context,
  extensionId,
}, testInfo) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const worker = await getServiceWorker(context)
  const now = Date.now()
  const scope = accountBalanceScope({
    accountId: "current-usd",
    baseUrl: "https://current-balance.invalid",
  })
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  const spending: FinancialConsumptionFact = {
    asset: { kind: "currency", code: "USD" },
    scope: {
      ...scope,
      projects: { kind: "all" },
      groups: { kind: "all" },
      models: { kind: "all" },
      keys: { kind: "all" },
    },
    amount: observeAmount(
      "3",
      {
        adapter: "fixture",
        operation: "spending",
        contractVersion: "1",
        kind: "reported",
      },
      now,
    ),
    window: {
      start: start.getTime(),
      end: end.getTime(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    settlement: "settled",
    coverage: "complete",
  }
  const wallet = balancePosition({
    id: "wallet",
    asset: { kind: "currency", code: "USD" },
    value: "10",
    scope,
    observedAt: now,
    source: {
      adapter: "fixture",
      operation: "wallet",
      contractVersion: "1",
      kind: "reported",
    },
  })
  wallet.amount = staleObservation(wallet.amount, "refresh-failed")
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "current-usd",
      site_url: scope.authority,
      exchange_rate: 6.5,
      account_info: {
        settledConsumption: [spending],
        balance: accountBalanceSnapshot(scope, [wallet], now, "complete"),
      },
    }),
    createStoredAccount({
      id: "saved-usd",
      configVersion: 8,
      site_url: "https://saved-balance.invalid",
      exchange_rate: 6.5,
      account_info: { quota: 1_000_000 },
    }),
  ])
  await seedUserPreferences(worker, {
    currencyType: "USD",
    showTodayCashflow: true,
  })
  await page.setViewportSize({ width: 320, height: 780 })
  for (const [name, path] of [
    ["popup", POPUP_PAGE_PATH],
    ["sidepanel", SIDEPANEL_PAGE_PATH],
  ] as const) {
    await page.goto(`chrome-extension://${extensionId}/${path}`)
    await waitForExtensionRoot(page)
    const summary = page.getByRole("region", {
      name: "Financial totals",
      exact: true,
    })
    const toCny = summary.getByRole("button", {
      name: "Display Currency · CNY",
    })
    await expect(toCny).toHaveText("$10.00")
    const row = page.getByTestId(
      getAccountManagementListItemTestId("current-usd"),
    )
    const consumption = row.getByRole("button", {
      name: /refresh today's consumption/,
    })
    await expect(consumption).toHaveText("-$3.00")
    await toCny.press("Enter")
    const toOriginal = summary.getByRole("button", {
      name: "Display Currency · Original currency",
    })
    await expect(toOriginal).toHaveText("¥65.00")
    await expect(consumption).toHaveText("-¥19.50")
    await expect(summary).toContainText("Last known value · ¥13.00")
    await expect(
      summary.getByText("Last known value", { exact: true }),
    ).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath(`${name}-compatible-balances.png`),
      animations: "disabled",
    })
    await toOriginal.click()
    await summary
      .getByRole("button", { name: "Display Currency · USD" })
      .click()
    await expect(toCny).toHaveText("$10.00")
  }
})

test("keeps multi-asset net inflow separate from confirmed income across account entrypoints", async ({
  page,
  context,
  extensionId,
}, testInfo) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const clock = await page.evaluate(() => {
    const day = new Date(),
      end = day.getTime()
    day.setHours(0, 0, 0, 0)
    return {
      start: day.getTime(),
      end,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
  })
  await page.clock.setFixedTime(clock.end)
  const worker = await getServiceWorker(context)
  const scope = accountBalanceScope(
    {
      baseUrl: "https://net-inflow.invalid",
      accountId: "multi-ledger",
      auth: { authType: AuthTypeEnum.AccessToken },
    },
    { walletId: "wallet" },
  )
  scope.keys = scope.models = scope.groups = scope.projects = { kind: "all" }
  const source = {
    adapter: "fixture",
    operation: "wallet",
    contractVersion: "2",
    kind: "reported",
  } as const
  const ledger = (
    id: string,
    value: string,
    at: number,
    asset: FinancialConsumptionFact["asset"],
  ) =>
    balancePosition({
      id,
      value,
      observedAt: at,
      asset,
      scope,
      source,
      role: "ledger",
      nature: "prepaid",
      validity: { kind: "no-expiry" },
    })
  const cny = { kind: "currency", code: "CNY" } as const
  const xno = { kind: "crypto", id: "XNO" } as const
  const start = accountBalanceSnapshot(
    scope,
    [
      ledger("cny", "50", clock.start, cny),
      ledger("xno", "2", clock.start, xno),
    ],
    clock.start,
    "complete",
  )
  const end = accountBalanceSnapshot(
    scope,
    [
      ledger("cny", "40", clock.end, cny),
      ledger("xno", "3", clock.end, xno),
      { ...ledger("available", "40", clock.end, cny), role: "available" },
    ],
    clock.end,
    "complete",
  )
  const consumption = (
    asset: FinancialConsumptionFact["asset"],
    value: string,
  ): FinancialConsumptionFact => ({
    asset,
    amount: {
      status: "known",
      value,
      observedAt: clock.end,
      source: { ...source, operation: "settled-usage" },
    },
    scope,
    window: clock,
    settlement: "settled",
    coverage: "complete",
  })
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "multi-ledger",
      site_name: "Multi-asset net flow",
      site_url: scope.authority,
      last_sync_time: clock.end,
      account_info: {
        balance: end,
        today_prompt_tokens: 1200,
        today_completion_tokens: 300,
        todayStatsAvailability: {
          consumption: { status: "complete" },
          income: { status: "unavailable", reason: "legacy_unclassified" },
          requests: { status: "complete" },
          tokens: { status: "complete" },
        },
        settledConsumption: [consumption(cny, "5"), consumption(xno, "1")],
      },
    }),
    createStoredAccount({
      id: "missing-daily-data",
      site_name: "Offline wallet",
      site_url: "https://offline.invalid",
      excludeFromTodayIncome: true,
      account_info: {
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        todayStatsAvailability: {
          consumption: { status: "unavailable", reason: "request_failed" },
          income: { status: "unavailable", reason: "not_collected" },
          requests: { status: "unavailable", reason: "request_failed" },
          tokens: { status: "complete" },
        },
      },
    }),
  ])
  await seedUserPreferences(worker, {
    showTodayCashflow: true,
    currencyDisplay: "original",
    balanceHistory: {
      ...DEFAULT_BALANCE_HISTORY_PREFERENCES,
      enabled: true,
      estimatedTodayIncome: { enabled: true },
    },
  })
  await setPlasmoStorageValue(
    worker,
    STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE,
    {
      schemaVersion: 2,
      snapshotsByAccountId: {},
      financialSnapshotsByAccountId: {
        "multi-ledger": [
          { balance: start, source: "refresh", generation: 1 },
          {
            balance: end,
            source: "refresh",
            generation: 2,
            settledConsumption: [consumption(cny, "5"), consumption(xno, "1")],
          },
        ],
      },
    },
    { lock: STORAGE_LOCKS.DAILY_BALANCE_HISTORY },
  )
  for (const [name, path, width] of [
    ["options", "options.html#account", 1280],
    ["popup", POPUP_PAGE_PATH, 380],
    ["sidepanel", SIDEPANEL_PAGE_PATH, 320],
  ] as const) {
    await page.setViewportSize({ width, height: 850 })
    await page.goto(`chrome-extension://${extensionId}/${path}`)
    await waitForExtensionRoot(page)
    const row = page.getByTestId(
      getAccountManagementListItemTestId("multi-ledger"),
    )
    await expect(row).toContainText(/CNY\s*-5|-[^0-9]*CNY\s*5/)
    await expect(
      row.getByRole("button", {
        name: /Estimated net inflow.*Ledger balance · 2 XNO(?:\.|$)/u,
      }),
    ).toBeVisible()
    await row.screenshot({
      path: testInfo.outputPath(`${name}-net-inflow-row.png`),
      animations: "disabled",
    })
    if (name !== "options") {
      const net = page.getByRole("region", {
        name: "Estimated net inflow",
        exact: true,
      })
      await expect(net).toContainText(/CNY\s*-5|-[^0-9]*CNY\s*5/)
      await expect(net.getByText("2 XNO", { exact: true })).toBeVisible()
      await net.screenshot({
        path: testInfo.outputPath(`${name}-net-inflow-summary.png`),
        animations: "disabled",
      })
      const overview = page.getByRole("region", {
        name: "Financial totals",
        exact: true,
      })
      await expect(overview).not.toContainText("Partial coverage")
      const consumptionSummary = overview.getByRole("region", {
        name: "Today's Consumption",
        exact: true,
      })
      await expect(consumptionSummary).toContainText(/CNY\s*5/)
      await expect(consumptionSummary.locator("..")).toHaveCSS(
        "border-top-width",
        "0px",
      )
      await expect(
        overview.getByRole("region", { name: "Tokens today" }),
      ).toContainText("1.5K")
      await overview.locator("xpath=ancestor::section[1]").screenshot({
        path: testInfo.outputPath(`${name}-daily-account-overview.png`),
        animations: "disabled",
      })
      await overview
        .getByRole("button", { name: "Financial totals", exact: true })
        .click()
      const details = page.getByRole("dialog", {
        name: "Financial totals",
        exact: true,
      })
      await expect(details).toContainText("Partial coverage")
      const consumptionDetails = details.getByRole("group", {
        name: "Today's Consumption",
        exact: true,
      })
      const incomeDetails = details.getByRole("group", {
        name: "Today's income",
        exact: true,
      })
      const reportingWindow = consumptionDetails.getByRole("button", {
        name: /^Observation window/,
      })
      await expect(reportingWindow).toHaveCount(1)
      await expect(reportingWindow).toHaveText(/^Through \d{2}:\d{2}$/)
      await expect(reportingWindow).not.toContainText(clock.timeZone)
      const amountBox = (await consumptionDetails
        .getByText("1 XNO", {
          exact: true,
        })
        .boundingBox())!
      const windowBox = (await reportingWindow.boundingBox())!
      expect(Math.abs(amountBox.y - windowBox.y)).toBeLessThan(8)
      expect(windowBox.x).toBeGreaterThan(amountBox.x + amountBox.width)
      const tokenDetails = details.getByRole("region", { name: "Tokens today" })
      await expect(tokenDetails).toContainText("1,500")
      await expect(tokenDetails).toContainText(/Prompt\s*1,200/)
      await expect(tokenDetails).toContainText(/Completion\s*300/)
      const tokenTitle = (await tokenDetails
        .getByRole("heading")
        .boundingBox())!
      const tokenTotal = (await tokenDetails
        .getByText("1,500", { exact: true })
        .boundingBox())!
      expect(Math.abs(tokenTitle.y - tokenTotal.y)).toBeLessThan(8)
      expect(tokenTotal.x).toBeGreaterThan(tokenTitle.x + tokenTitle.width)
      const consumptionExclusions = consumptionDetails.getByRole("button", {
        name: "Accounts not included (1)",
        exact: true,
      })
      const incomeExclusions = incomeDetails.getByRole("button", {
        name: "Accounts not included (2)",
        exact: true,
      })
      await expect(consumptionExclusions).toHaveAttribute(
        "aria-expanded",
        "false",
      )
      await expect(incomeExclusions).toHaveAttribute("aria-expanded", "false")
      await details.screenshot({
        path: testInfo.outputPath(`${name}-daily-coverage-details.png`),
        animations: "disabled",
      })
      await reportingWindow.click()
      const timeHint = page
        .getByRole("tooltip")
        .filter({ hasText: clock.timeZone })
      await expect(timeHint).toContainText("00:00:00")
      await timeHint.screenshot({
        path: testInfo.outputPath(`${name}-observation-window-hint.png`),
        animations: "disabled",
      })
      await consumptionExclusions.click()
      await expect(
        consumptionDetails
          .getByRole("listitem")
          .filter({ hasText: "Offline wallet" })
          .filter({ hasText: "The data request failed" }),
      ).toBeVisible()
      await incomeExclusions.click()
      const incomeExclusion = incomeDetails
        .getByRole("listitem")
        .filter({ hasText: "Offline wallet" })
        .filter({ hasText: "Excluded in account settings" })
      await expect(incomeExclusion).toBeVisible()
      await incomeExclusion.scrollIntoViewIfNeeded()
      await details.screenshot({
        path: testInfo.outputPath(`${name}-daily-coverage-income.png`),
        animations: "disabled",
      })
      await tokenDetails.scrollIntoViewIfNeeded()
      await details.screenshot({
        path: testInfo.outputPath(`${name}-token-details.png`),
        animations: "disabled",
      })
    }
  }
})

test("shows Kimi current and last-known sources with vouchers in a narrow dark account view", async ({
  page,
  context,
  extensionId,
}, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem("aah_dev_features_unlocked", "true")
  })
  await forceExtensionLanguage(page, "zh-CN")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 380, height: 800 })
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    themeMode: "dark",
    showTodayCashflow: false,
    currencyDisplay: "original",
  })
  const scope = accountBalanceScope(
    {
      baseUrl: "https://platform.kimi.com",
      accountId: "kimi-sources",
      auth: { authType: AuthTypeEnum.AccessToken },
    },
    { organizationId: "fixture-org" },
  )
  const consoleData = parseKimiFinancialData(
    {
      code: 0,
      data: { cur: -200000, voucher_cur: 1000000, today_consume: 2298 },
    },
    scope,
    "CNY",
    "console",
  )
  const inferenceData = parseKimiFinancialData(
    {
      code: 0,
      status: true,
      data: { available_balance: 10, cash_balance: -2, voucher_balance: 10 },
    },
    scope,
    "CNY",
    "inference",
  )
  const oldPositions = consoleData.balance.positions.map((position) => ({
    ...position,
    amount:
      position.amount.status === "known"
        ? {
            ...position.amount,
            status: "stale" as const,
            reason: "source-changed",
          }
        : position.amount,
  }))
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "kimi-sources",
      site_type: SITE_TYPES.KIMI,
      site_name: "Kimi source fixture",
      site_url: "https://platform.kimi.com",
      account_info: {
        balance: accountBalanceSnapshot(
          scope,
          [...oldPositions, ...inferenceData.balance.positions],
          Date.now(),
          "partial",
        ),
      },
    }),
  ])
  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)
  const row = page.getByTestId(
    getAccountManagementListItemTestId("kimi-sources"),
  )
  await expect(row).toContainText("¥10.00")
  await expect(row).toContainText("最后已知值")
  await row.screenshot({
    path: testInfo.outputPath("kimi-source-row-dark.png"),
    animations: "disabled",
  })
  await row.getByRole("button", { name: "余额明细", exact: true }).click()
  const details = page.getByRole("dialog", { name: "余额明细", exact: true })
  await expect(details).toContainText("代金券额度")
  await expect(details).toContainText(/现金余额.*-CNY\s*2(?![\d.])/s)
  const diagnostics = details
    .locator("summary")
    .filter({ hasText: "技术信息（调试）" })
  await expect(diagnostics.first()).toBeVisible()
  for (const disclosure of await diagnostics.all()) await disclosure.click()
  await expect(details).toContainText("console/account")
  await expect(details).toContainText("inference/balance")
  await details.screenshot({
    path: testInfo.outputPath("kimi-source-details-dark.png"),
    animations: "disabled",
  })
  await details.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await details.screenshot({
    path: testInfo.outputPath("kimi-source-details-inference-dark.png"),
    animations: "disabled",
  })
})

test("keeps spendable native amounts, unknown coverage and sharing consistent across account entrypoints", async ({
  page,
  context,
  extensionId,
}, testInfo) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    themeMode: "light",
    showTodayCashflow: false,
    currencyDisplay: "original",
  })
  const scope = accountBalanceScope(
    {
      baseUrl: "https://fixture.invalid",
      accountId: "native-wallet",
      auth: { authType: AuthTypeEnum.AccessToken },
    },
    { walletId: "wallet" },
  )
  scope.models = scope.projects = scope.groups = scope.keys = { kind: "all" }
  const source = {
    adapter: "fixture",
    operation: "wallet",
    contractVersion: "2",
    kind: "reported",
  } as const
  const cash = balancePosition({
    id: "prepaid",
    value: "8",
    asset: { kind: "currency", code: "CNY" },
    scope,
    source,
    observedAt: capturedAt,
    nature: "prepaid",
    validity: { kind: "no-expiry" },
  })
  const tokens = balancePosition({
    id: "subscription",
    value: "2000",
    asset: {
      kind: "quota",
      id: "fixture:tokens",
      label: "Tokens",
      displayScale: 1,
      displayLabel: "Tokens",
    },
    scope,
    source,
    observedAt: capturedAt,
    nature: "subscription",
    validity: { kind: "no-expiry" },
  })
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "native-wallet",
      site_name: "Native wallet",
      site_url: "https://fixture.invalid",
      last_sync_time: capturedAt,
      account_info: {
        quota: 999000000,
        balance: accountBalanceSnapshot(
          scope,
          [
            cash,
            tokens,
            balancePosition({
              id: "nano",
              value: "3",
              asset: { kind: "crypto", id: "XNO" },
              scope,
              source,
              observedAt: capturedAt,
              nature: "prepaid",
              validity: { kind: "no-expiry" },
            }),
          ],
          capturedAt,
          "complete",
        ),
      },
    }),
    createStoredAccount({
      id: "legacy",
      site_name: "Legacy wallet",
      last_sync_time: capturedAt,
    }),
  ])
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  await waitForExtensionRoot(page)
  const row = page.getByTestId(
    getAccountManagementListItemTestId("native-wallet"),
  )
  await expect(row).toContainText("¥8.00")
  await expect(row).toContainText(/2,?000\s*Tokens/)
  await expect(row).not.toContainText("XNO")
  await expect(
    row.getByRole("button", { name: "Balance details", exact: true }),
  ).toContainText("+1")
  await row.screenshot({
    path: testInfo.outputPath("options-native-row.png"),
    animations: "disabled",
  })
  await row
    .getByRole("button", { name: "Balance details", exact: true })
    .click()
  const details = page.getByRole("dialog", {
    name: "Balance details",
    exact: true,
  })
  await expect(details).toContainText("Subscription allowance")
  await expect(details).toContainText("3 XNO")
  await details.screenshot({
    path: testInfo.outputPath("options-native-details.png"),
    animations: "disabled",
  })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("fixture clipboard unavailable")
        },
      },
    })
  })
  for (const [name, path, width] of [
    ["popup", POPUP_PAGE_PATH, 380],
    ["sidepanel", SIDEPANEL_PAGE_PATH, 320],
  ] as const) {
    await page.setViewportSize({ width, height: 780 })
    await page.goto(`chrome-extension://${extensionId}/${path}`)
    await waitForExtensionRoot(page)
    const summary = page.getByRole("region", {
      name: "Financial totals",
      exact: true,
    })
    const tabList = page.getByRole("tablist").filter({
      has: page.getByTestId(POPUP_TEST_IDS.accountsTab),
    })
    const tabLayout = () =>
      tabList.getByRole("tab").evaluateAll((tabs) =>
        tabs.map((tab) => {
          const rect = tab.getBoundingClientRect()
          return {
            top: rect.top,
            left: rect.left,
            height: rect.height,
            width: rect.width,
          }
        }),
      )
    const accountsLayout = await tabLayout()
    expect(accountsLayout).toHaveLength(3)
    expect(accountsLayout[0]?.width).toBeCloseTo(accountsLayout[2]!.width, 0)
    expect(
      await tabList.getByRole("tab").evaluateAll((tabs) =>
        tabs.every((tab) => {
          const label = tab.querySelector("span")!
          return label.scrollWidth <= label.clientWidth + 1
        }),
      ),
    ).toBe(true)
    for (const testId of [
      POPUP_TEST_IDS.apiCredentialProfilesTab,
      POPUP_TEST_IDS.bookmarksTab,
      POPUP_TEST_IDS.accountsTab,
    ]) {
      const tab = page.getByTestId(testId)
      await tab.click()
      await expect(tab).toHaveAttribute("aria-selected", "true")
      expect(await tabLayout()).toEqual(accountsLayout)
      await tabList.locator("xpath=ancestor::section[1]").screenshot({
        path: testInfo.outputPath(`${name}-${testId}.png`),
        animations: "disabled",
      })
    }
    await expect(
      summary.getByRole("button", { name: "Share overview snapshot" }),
    ).toBeVisible()
    await expect(
      summary.getByLabel("Included 1 of 2 accounts", { exact: false }),
    ).toBeVisible()
    await expect(summary).not.toContainText("Partial coverage")
    await summary.locator("xpath=ancestor::section[1]").screenshot({
      path: testInfo.outputPath(`${name}-account-overview.png`),
      animations: "disabled",
    })
    await summary
      .getByRole("button", { name: "Financial totals", exact: true })
      .click()
    const totals = page.getByRole("dialog", {
      name: "Financial totals",
      exact: true,
    })
    await expect(totals.getByRole("combobox")).toHaveCount(0)
    await expect(summary).toContainText("¥8.00")
    await expect(summary).not.toContainText("Tokens")
    await expect(totals).toContainText("Included 1 of 2 accounts")
    await totals
      .getByRole("button", { name: /Accounts not included \(1\)/ })
      .click()
    await expect(
      totals.getByRole("listitem").filter({ hasText: "Legacy wallet" }),
    ).toContainText("Legacy")
    await totals.screenshot({
      path: testInfo.outputPath(`${name}-coverage-details.png`),
      animations: "disabled",
    })
    const assets = totals.getByRole("button", {
      name: "Assets · 3",
      exact: true,
      expanded: false,
    })
    await expect(assets).toHaveText("Assets · 3")
    await expect(assets).toHaveCSS("border-top-width", "0px")
    const balanceHeading = (await totals
      .getByRole("heading", { name: "Balance", exact: true })
      .boundingBox())!
    const assetsBox = (await assets.boundingBox())!
    expect(Math.abs(assetsBox.y - balanceHeading.y)).toBeLessThan(6)
    expect(assetsBox.x).toBeGreaterThan(balanceHeading.x + balanceHeading.width)
    await assets.click()
    const portfolioDetails = totals.getByRole("group", {
      name: "Balance details",
      exact: true,
    })
    await expect(portfolioDetails).toContainText(/2,?000\s*Tokens/)
    await expect(portfolioDetails).toContainText("3 XNO")
    await totals.screenshot({
      path: testInfo.outputPath(`${name}-inline-assets.png`),
      animations: "disabled",
    })
    await totals.getByRole("button", { name: "Close", exact: true }).click()
    await expect(row).not.toContainText("XNO")
    const tokenAmount = row
      .getByRole("group", { name: /Tokens/ })
      .locator("span")
      .first()
    expect(
      await tokenAmount.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true)
    await row.screenshot({
      path: testInfo.outputPath(`${name}-multi-balance-row.png`),
      animations: "disabled",
    })
    await summary.screenshot({
      path: testInfo.outputPath(`${name}-available.png`),
      animations: "disabled",
    })
    if (name === "popup") {
      const downloadPromise = page.waitForEvent("download")
      await page
        .getByRole("button", { name: "Share overview snapshot" })
        .click()
      const download = await downloadPromise
      await download.saveAs(testInfo.outputPath("share-available.png"))
      const caption = page.getByTestId(SHARE_SNAPSHOT_TEST_IDS.captionTextarea)
      await expect(caption).toHaveValue(/Balance/)
      await expect(caption).toHaveValue(/Tokens/)
      await caption.locator("..").screenshot({
        path: testInfo.outputPath("share-caption.png"),
        animations: "disabled",
      })
    }
  }
})
