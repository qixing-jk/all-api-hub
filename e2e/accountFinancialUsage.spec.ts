import {
  POPUP_PAGE_PATH,
  SIDEPANEL_PAGE_PATH,
} from "~/constants/extensionPages"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { SHARE_SNAPSHOT_TEST_IDS } from "~/features/ShareSnapshots/testIds"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import { balancePosition } from "~/services/amounts/balance"
import { budgetConstraint } from "~/services/amounts/budgets"
import type { FinancialIncomeFact } from "~/services/amounts/income"
import type { FinancialConsumptionFact } from "~/services/amounts/usage"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import type { AccountStorageConfig } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageJsonValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

test("renders signed and sub-cent native cashflow without changing its stored amounts", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const worker = await getServiceWorker(context)
  const now = Date.now()
  const scope = accountBalanceScope({
    baseUrl: "https://signed-cashflow.invalid",
    accountId: "signed-cashflow",
  })
  scope.keys = scope.models = scope.projects = scope.groups = { kind: "all" }
  const window = {
    start: new Date(now).setHours(0, 0, 0, 0),
    end: now,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }
  const source = {
    adapter: "fixture",
    operation: "daily",
    contractVersion: "1",
    kind: "reported" as const,
  }
  const row = page.getByTestId(
    getAccountManagementListItemTestId("signed-cashflow"),
  )
  for (const [id, value] of [
    ["refund", "-0.25"],
    ["tiny", "0.001"],
  ] as const) {
    const fact = {
      scope,
      asset: { kind: "currency", code: "USD" } as const,
      amount: { status: "known", value, observedAt: now, source } as const,
      window,
      coverage: "complete" as const,
    }
    await seedStoredAccounts(worker, [
      createStoredAccount({
        id: "signed-cashflow",
        site_name: "Signed native cashflow",
        site_url: scope.authority,
        account_info: {
          settledConsumption: [{ ...fact, settlement: "settled" }],
          reportedIncome: [{ ...fact, classification: "unclassified" }],
        },
      }),
    ])
    await seedUserPreferences(worker, {
      currencyType: "USD",
      showTodayCashflow: true,
      autoRefresh: false,
    })
    await page.setViewportSize({ width: 390, height: 900 })
    await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
    await waitForExtensionRoot(page)
    const consumption = row.getByRole("button", {
      name: /refresh today's consumption/i,
    })
    const income = row.getByRole("button", { name: /refresh today's income/i })
    await expect(consumption).toHaveText(
      id === "refund" ? /\+\$0\.25/ : /-.*<.*0\.01/,
    )
    await expect(income).toHaveText(
      id === "refund" ? /-\$0\.25/ : /\+.*<.*0\.01/,
    )
    await captureVisualViews({
      page,
      ready: row,
      captureTarget: row,
      id: `native-cashflow-${id}`,
      extensionDir,
      views: [
        { id: "light", width: 390, height: 900, theme: "light" },
        { id: "dark", width: 320, height: 900, theme: "dark" },
      ],
    })
    const stored = await getPlasmoStorageJsonValue<AccountStorageConfig>(
      worker,
      STORAGE_KEYS.ACCOUNTS,
    )
    expect(
      stored?.accounts[0]?.account_info.settledConsumption?.[0]?.amount,
    ).toMatchObject({ status: "known", value })
    expect(
      stored?.accounts[0]?.account_info.reportedIncome?.[0]?.amount,
    ).toMatchObject({ status: "known", value })
  }
})

test("keeps release cashflow readable before refresh without inventing missing amounts", async ({
  page,
  context,
  extensionId,
  extensionDir,
}, testInfo) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const worker = await getServiceWorker(context)
  const now = Date.now()
  const release = createStoredAccount({
    id: "release-cashflow",
    site_name: "Saved release cashflow",
    site_url: "https://release-cashflow.invalid",
    configVersion: 8,
    exchange_rate: 7,
    last_sync_time: now,
    account_info: {
      quota: 5_000_000,
      today_quota_consumption: 1_625_000,
      today_income: 1_250_000,
    },
  })
  const missing = createStoredAccount({
    id: "release-missing-cashflow",
    site_name: "Release missing fields",
    site_url: "https://release-missing.invalid",
    configVersion: 8,
    account_info: {
      quota: 2_500_000,
      today_quota_consumption: undefined,
      today_income: undefined,
    },
  })
  await seedStoredAccounts(worker, [release, missing])
  await seedUserPreferences(worker, {
    currencyType: "USD",
    showTodayCashflow: true,
  })
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)
  const row = page.getByTestId(
    getAccountManagementListItemTestId("release-cashflow"),
  )
  const missingRow = page.getByTestId(
    getAccountManagementListItemTestId("release-missing-cashflow"),
  )
  await expect(row).toContainText("$3.25")
  await expect(row).toContainText("$2.50")
  await expect(row).toContainText("Reference")
  await expect(missingRow).toContainText("$5.00")
  await expect(missingRow).not.toContainText("$0.00")
  await captureVisualViews({
    page,
    extensionDir,
    ready: row,
    captureTarget: row,
    id: "release-cashflow-before-refresh",
  })
  await seedUserPreferences(worker, {
    currencyType: "CNY",
    showTodayCashflow: true,
  })
  await page.reload()
  await waitForExtensionRoot(page)
  await expect(row).toContainText("¥22.75")
  await expect(row).toContainText("¥17.50")
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("fixture clipboard unavailable")
        },
      },
    }),
  )
  await page.reload()
  await waitForExtensionRoot(page)
  const downloaded = page.waitForEvent("download")
  await page.getByRole("button", { name: "Share overview snapshot" }).click()
  await (
    await downloaded
  ).saveAs(testInfo.outputPath("release-cashflow-share.png"))
  const caption = page.getByTestId(SHARE_SNAPSHOT_TEST_IDS.captionTextarea)
  await expect(caption).toHaveValue(/Older record; refresh to confirm/)
  await expect(caption).toHaveValue(/CNY\s22\.75/)
  await expect(caption).toHaveValue(/CNY\s17\.5/)
  await captureVisualViews({
    page,
    extensionDir,
    ready: caption,
    captureTarget: caption.locator(".."),
    id: "release-cashflow-share",
  })
})

test("keeps expiry, archived components and provider-day figures usable through filtering and sharing", async ({
  page,
  context,
  extensionId,
  extensionDir,
}, testInfo) => {
  test.setTimeout(process.env.AAH_VISUAL_CAPTURE_DIR ? 120000 : 60000)
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  await forceExtensionLanguage(page, "en")
  const now = Date.now()
  const source = {
    adapter: "fixture",
    operation: "wallet",
    contractVersion: "1",
    kind: "reported",
  } as const
  const scope = accountBalanceScope({
    baseUrl: "https://expired.example",
    accountId: "expired-voucher",
  })
  const expired = createStoredAccount({
    id: "expired-voucher",
    site_name: "Expired voucher fixture",
    site_url: scope.authority,
    account_info: {
      quota: undefined,
      balance: accountBalanceSnapshot(
        scope,
        [
          balancePosition({
            id: "voucher",
            scope,
            source,
            asset: { kind: "currency", code: "USD" },
            value: "100",
            observedAt: now - 2000,
            validity: { kind: "expires", at: now - 1000 },
          }),
          balancePosition({
            id: "reset-credit",
            scope,
            source,
            asset: { kind: "currency", code: "USD" },
            value: "88",
            observedAt: now - 2000,
            window: {
              start: now - 10_000,
              end: now + 10_000,
              resetsAt: now - 1000,
              timeZone: "UTC",
            },
          }),
        ],
        now,
        "complete",
      ),
    },
  })
  const providerScope = accountBalanceScope({
    baseUrl: "https://providerday.example",
    accountId: "provider-day",
  })
  const provider = createStoredAccount({
    id: "provider-day",
    site_name: "Provider day fixture",
    site_url: providerScope.authority,
    account_info: {
      quota: undefined,
      balance: accountBalanceSnapshot(
        providerScope,
        [
          balancePosition({
            id: "wallet",
            scope: providerScope,
            source,
            asset: { kind: "currency", code: "USD" },
            value: "7",
            observedAt: now,
          }),
        ],
        now,
        "complete",
      ),
      usage: {
        scope: "site_today",
        totalRequests: 4,
        totalTokens: 123,
        cost: {
          asset: { kind: "currency", code: "USD" },
          scope: providerScope,
          amount: { status: "known", value: "3.5", observedAt: now, source },
        },
      },
    },
  })
  const legacy = createStoredAccount({
    id: "legacy-details",
    site_name: "Archived component fixture",
    account_info: {
      quota: undefined,
      nativeBalance: {
        unit: "USD",
        total: 35,
        permanent: 10,
        daily: 5,
        components: [
          { kind: "permanent", amount: 10 },
          { kind: "timed", amount: 5 },
          {
            kind: "subscription",
            name: "Existing Plan",
            amount: 20,
            scope: "premium",
            expiresAt: "2099-12-31T00:00:00Z",
          },
        ],
      },
    },
  })
  await seedStoredAccounts(worker, [expired, provider, legacy])
  await seedUserPreferences(worker, {
    showTodayCashflow: true,
    currencyType: "USD",
    themeMode: "light",
  })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  await waitForExtensionRoot(page)
  const expiredRow = page.getByTestId(
    getAccountManagementListItemTestId("expired-voucher"),
  )
  await expect(expiredRow).toContainText("Expired")
  await expect(expiredRow).toContainText("Reset")
  await expect(expiredRow).toContainText("88.00")
  await expect(expiredRow).toContainText("100.00")
  await captureVisualViews({
    page,
    ready: expiredRow,
    captureTarget: expiredRow,
    id: "expired-native-voucher",
    extensionDir,
  })
  await page
    .getByTestId(getAccountManagementListItemTestId("legacy-details"))
    .getByRole("button", { name: "Balance details", exact: true })
    .click()
  const details = page.getByRole("dialog", {
    name: "Balance details",
    exact: true,
  })
  await expect(details).toContainText("Existing Plan · premium")
  await expect(details).toContainText("USD 20")
  await captureVisualViews({
    page,
    ready: details,
    captureTarget: details,
    id: "archived-component-details",
    extensionDir,
  })
  await details.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(details.getByText("Existing Plan · premium")).toBeInViewport()
  await captureVisualViews({
    page,
    ready: details,
    captureTarget: details,
    id: "archived-component-details-lower",
    extensionDir,
  })
  await page.keyboard.press("Escape")
  const search = page.getByRole("textbox", {
    name: "Enter site information or account information to search",
  })
  await search.fill("Provider day fixture")
  const filtered = page.getByRole("region", {
    name: "1 account",
    exact: true,
  })
  await expect(filtered).toContainText("Usage by site day")
  await expect(filtered).toContainText("3.5")
  await captureVisualViews({
    page,
    ready: filtered,
    captureTarget: filtered,
    id: "provider-day-filtered-summary",
    extensionDir,
  })
  await search.fill("Expired voucher fixture")
  await expect(
    page.getByRole("group", { name: "Usage by site day", exact: true }),
  ).toHaveCount(0)
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("fixture download")
        },
      },
    }),
  )
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)
  const overview = page.getByRole("region", {
    name: "Financial totals",
    exact: true,
  })
  await expect(overview).toContainText("Usage by site day")
  await expect(overview.getByText("$7.00", { exact: true })).toBeVisible()
  await expect(overview).toContainText("3.5")
  await captureVisualViews({
    page,
    ready: overview,
    captureTarget: overview,
    id: "provider-day-overview",
    extensionDir,
    views: [
      { id: "compact-light", width: 320, height: 900, theme: "light" },
      { id: "narrow-dark", width: 390, height: 900, theme: "dark" },
    ],
  })
  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "Share overview snapshot" }).click()
  await (await download).saveAs(testInfo.outputPath("provider-day-share.png"))
  await expect(
    page.getByTestId(SHARE_SNAPSHOT_TEST_IDS.captionTextarea),
  ).toHaveValue(/Usage by site day.*3\.5/)
  await page.reload()
  await waitForExtensionRoot(page)
  await expect(
    page.getByRole("region", { name: "Financial totals", exact: true }),
  ).toContainText("3.5")
})

test("downloads an account share with purchased remaining allowance", async ({
  page,
  context,
  extensionId,
}, testInfo) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  const now = Date.now()
  const scope = accountBalanceScope({
    baseUrl: "https://foxcode-fixture.invalid",
    accountId: "foxcode-share",
  })
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "foxcode-share",
      site_type: "foxcode",
      site_name: "FoxCode fixture",
      site_url: scope.authority,
      account_info: {
        quota: undefined,
        balance: accountBalanceSnapshot(scope, [], now, "complete"),
        allowances: {
          schemaVersion: 1,
          capturedAt: now,
          subject: scope.subject,
          coverage: "complete",
          entries: [
            {
              id: "private-plan-id",
              collectionKey: "active-plans",
              identityKind: "upstream",
              validity: { kind: "expires", at: now + 86400_000 },
              constraint: budgetConstraint({
                scope,
                asset: { kind: "currency", code: "USD" },
                source: {
                  adapter: "foxcode",
                  operation: "plans",
                  contractVersion: "1",
                  kind: "reported",
                },
                limitState: "finite",
                limit: "10",
                remaining: "8",
                window: { kind: "lifetime" },
                enabled: true,
                observedAt: now,
              }),
            },
          ],
        },
      },
    }),
  ])
  await seedUserPreferences(worker, {
    currencyType: "USD",
    showTodayCashflow: false,
  })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    })
  })
  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)
  const row = page.getByTestId(
    getAccountManagementListItemTestId("foxcode-share"),
  )
  await expect(row.getByText("$8.00", { exact: true })).toBeVisible()
  await row.hover()
  await row
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton)
    .click()
  await page
    .getByRole("menuitem", { name: "Share", exact: true })
    .press("ArrowRight")
  const download = page.waitForEvent("download", { timeout: 10_000 })
  await page
    .getByRole("menuitem", { name: "Share account snapshot", exact: true })
    .click()
  await (
    await download
  ).saveAs(testInfo.outputPath("foxcode-allowance-share.png"))
  const caption = page.getByTestId(SHARE_SNAPSHOT_TEST_IDS.captionTextarea)
  await expect(caption).toHaveValue(/Allowance: \$8\.00/i)
  await expect(caption).not.toHaveValue(/private-plan-id/)
})

test("keeps native balance rows readable and uses available width without repeated glyphs", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  await forceExtensionLanguage(page, "zh-CN")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const worker = await getServiceWorker(context)
  const scope = accountBalanceScope({
    baseUrl: "https://financial-row.invalid",
    accountId: "balance-row",
  })
  const source = {
    adapter: "fixture",
    operation: "wallet",
    contractVersion: "1",
    kind: "reported" as const,
  }
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "balance-row",
      site_name: "两个独立钱包",
      site_url: scope.authority,
      account_info: {
        quota: undefined,
        today_quota_consumption: undefined,
        today_income: undefined,
        balance: accountBalanceSnapshot(
          scope,
          [
            balancePosition({
              id: "ordinary",
              label: "普通余额",
              value: "12.5",
              asset: { kind: "currency", code: "USD" },
              scope,
              source,
              observedAt: Date.now(),
            }),
            balancePosition({
              id: "public",
              label: "公益余额",
              value: "9",
              asset: { kind: "currency", code: "USD" },
              scope,
              source,
              observedAt: Date.now(),
            }),
          ],
          Date.now(),
          "complete",
        ),
      },
    }),
  ])
  await seedUserPreferences(worker, {
    showTodayCashflow: true,
    themeMode: "light",
    currencyType: "USD",
    autoRefresh: false,
  })
  const checks: {
    width: number
    gap: number
    wallets: number
    cashflowIcons: number
  }[] = []
  for (const [entry, width, theme] of [
    ["options.html#account", 1440, "light"],
    [SIDEPANEL_PAGE_PATH, 560, "light"],
    [POPUP_PAGE_PATH, 320, "light"],
    ["options.html#account", 390, "dark"],
  ] as const) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`chrome-extension://${extensionId}/${entry}`)
    await waitForExtensionRoot(page)
    const row = page.getByTestId(
      getAccountManagementListItemTestId("balance-row"),
    )
    const label = row.getByText("普通余额", { exact: true })
    const amount = row.getByText("$12.50", { exact: true })
    await expect(label).toBeVisible()
    await expect(amount).toBeVisible()
    await expect(row.getByText("$9.00", { exact: true })).toBeVisible()
    const labelBox = (await label.boundingBox())!
    const amountBox = (await amount.boundingBox())!
    checks.push({
      width,
      gap: Math.abs(
        labelBox.y + labelBox.height - amountBox.y - amountBox.height,
      ),
      wallets: await row.locator("svg.lucide-wallet").count(),
      cashflowIcons: await row
        .locator("svg.lucide-trending-up, svg.lucide-trending-down")
        .count(),
    })
    expect(
      await row.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true)
    await captureVisualViews({
      page,
      ready: row,
      captureTarget: row,
      id: `native-balance-row-${width}`,
      extensionDir,
      views: [{ id: theme, width, height: 900, theme }],
    })
  }
  for (const check of checks) {
    if (check.width >= 560)
      expect(
        check.gap,
        "Labels and amounts share one line when the balance column has room",
      ).toBeLessThan(5)
    expect(
      check.wallets,
      "Account rows do not repeat a wallet for every balance",
    ).toBe(0)
    expect(
      check.cashflowIcons,
      "Unavailable daily amounts do not add decorative glyphs",
    ).toBe(0)
  }
})

const testInUtc = test.extend({ timezoneId: "UTC" })

testInUtc(
  "keeps native income and consumption units and periods through reload and sharing",
  async ({ page, context, extensionId, extensionDir }, testInfo) => {
    test.setTimeout(process.env.AAH_VISUAL_CAPTURE_DIR ? 120_000 : 60_000)
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    await page.emulateMedia({ reducedMotion: "reduce" })
    const worker = await getServiceWorker(context)
    const start = Date.UTC(2026, 0, 18)
    const window = { start, end: start + 43_200_000, timeZone: "UTC" }
    await page.clock.setFixedTime(window.end)
    const scope = accountBalanceScope(
      {
        baseUrl: "https://financial-fixture.invalid",
        accountId: "native-usage",
      },
      { walletId: "wallet" },
    )
    scope.keys = scope.models = scope.projects = scope.groups = { kind: "all" }
    const source = {
      adapter: "fixture",
      operation: "usage",
      contractVersion: "1",
      kind: "reported" as const,
    }
    const usd = { kind: "currency", code: "USD" } as const
    const credit = {
      kind: "quota",
      id: "fixture:credits",
      label: "Credits",
      displayScale: 1,
      displayLabel: "Credits",
    } as const
    const amount = (value: string) => ({
      status: "known" as const,
      value,
      observedAt: window.end,
      source,
    })
    const settledConsumption: FinancialConsumptionFact[] = [
      {
        scope,
        asset: usd,
        amount: amount("0.123456789012345678"),
        window,
        settlement: "settled",
        coverage: "complete",
      },
      {
        scope,
        asset: credit,
        amount: {
          ...amount("12"),
          source: { ...source, operation: "credit-usage" },
        },
        // In January midnight in Paris starts an hour before the UTC day.
        window: {
          ...window,
          start: window.start - 3_600_000,
          timeZone: "Europe/Paris",
        },
        settlement: "settled",
        coverage: "partial",
      },
    ]
    const reportedIncome: FinancialIncomeFact[] = [
      {
        scope,
        asset: credit,
        amount: { ...amount("25"), source: { ...source, operation: "grants" } },
        window,
        coverage: "complete",
        classification: "grant",
      },
    ]
    await seedStoredAccounts(worker, [
      createStoredAccount({
        id: "native-usage",
        site_name: "Native financial facts",
        site_url: scope.authority,
        last_sync_time: window.end,
        account_info: {
          quota: undefined,
          balance: accountBalanceSnapshot(
            scope,
            [
              balancePosition({
                id: "wallet",
                scope,
                source,
                asset: usd,
                observedAt: window.end,
                value: "7",
                nature: "prepaid",
              }),
            ],
            window.end,
            "complete",
          ),
          settledConsumption,
          reportedIncome,
        },
      }),
    ])
    await seedUserPreferences(worker, {
      showTodayCashflow: true,
      themeMode: "light",
    })
    await page.setViewportSize({ width: 390, height: 850 })
    await page.goto(`chrome-extension://${extensionId}/options.html#account`)
    await waitForExtensionRoot(page)
    const row = page.getByTestId(
      getAccountManagementListItemTestId("native-usage"),
    )
    await expect(row).toContainText("$0.12")
    await expect(row).toContainText("+25 Credits")
    await expect(row).not.toContainText("0.123456789012345678")
    await expect(row.locator("details")).toHaveCount(0)
    await captureVisualViews({
      page,
      ready: row,
      captureTarget: row,
      id: "financial-row-collapsed",
      extensionDir,
    })
    await row
      .getByRole("button", { name: "Balance details", exact: true })
      .click()
    const details = page.getByRole("dialog", {
      name: "Balance details",
      exact: true,
    })
    await expect(details).toContainText("USD 0.12")
    await expect(details).not.toContainText("0.123456789012345678")
    await expect(details).toContainText("12 Credits")
    await expect(details).toContainText("25 Credits")
    await expect(details).toContainText("UTC")
    const bounds = await details.boundingBox()
    expect(bounds!.width).toBeGreaterThan(390 * 0.85)
    expect(
      await details.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true)
    await captureVisualViews({
      page,
      ready: details,
      captureTarget: details,
      id: "native-income-consumption-row",
      extensionDir,
      views: [
        { id: "compact-light", width: 320, height: 900, theme: "light" },
        { id: "narrow-dark", width: 390, height: 900, theme: "dark" },
        { id: "desktop-light", width: 1440, height: 900, theme: "light" },
      ],
    })
    const observation = details.getByRole("group", {
      name: "Period consumption · USD 0.12",
      exact: true,
    })
    const observationTime = details.locator("time").first()
    await expect(observationTime).toContainText("ago")
    await expect(observationTime).toHaveAttribute(
      "datetime",
      new Date(window.end).toISOString(),
    )
    await observationTime.focus()
    await expect(page.getByRole("tooltip")).toContainText("Observed at")
    await page.keyboard.press("Escape")
    await expect(details).toBeVisible()
    await expect(
      details.getByText("Available credit", { exact: true }),
    ).toBeVisible()
    const consumptionLabel = observation.getByText("Period consumption", {
      exact: true,
    })
    for (const label of [consumptionLabel]) {
      const labelBox = (await label.boundingBox())!
      const icons = await details
        .locator('svg[aria-hidden="true"]')
        .evaluateAll((elements) =>
          elements.map((element) => {
            const box = element.getBoundingClientRect()
            return {
              left: box.left,
              right: box.right,
              top: box.top,
              bottom: box.bottom,
              width: box.width,
            }
          }),
        )
      expect(
        icons.some(
          (icon) =>
            icon.width > 0 &&
            icon.right <= labelBox.x &&
            labelBox.x - icon.right <= 8 &&
            icon.top < labelBox.y + labelBox.height &&
            icon.bottom > labelBox.y,
        ),
        "Consumption labels have a nearby decorative metric icon",
      ).toBe(true)
    }
    const consumptionTime = observation.locator("time")
    await consumptionTime.click()
    await expect(page.getByRole("tooltip")).toContainText("Observed at")
    await captureVisualViews({
      page,
      ready: page.getByRole("tooltip"),
      captureTarget: details,
      id: "native-observation-time",
      extensionDir,
      views: [{ id: "narrow-dark", width: 390, height: 900, theme: "dark" }],
    })
    await page.keyboard.press("Escape")
    await observation
      .getByRole("button", { name: "View details", exact: true })
      .click()
    await expect(observation).toContainText("0.123456789012345678")
    await expect(observation).toContainText(window.timeZone)
    await captureVisualViews({
      page,
      ready: details,
      captureTarget: details,
      id: "native-consumption-observation",
      extensionDir,
      views: [
        { id: "light", width: 390, height: 900, theme: "light" },
        { id: "dark", width: 390, height: 900, theme: "dark" },
      ],
    })
    const incomeObservation = details.getByRole("group", {
      name: "Reported income · 25 Credits",
      exact: true,
    })
    await captureVisualViews({
      page,
      ready: incomeObservation,
      captureTarget: details,
      id: "native-consumption-lower",
      extensionDir,
      views: [{ id: "narrow-dark", width: 390, height: 900, theme: "dark" }],
    })
    await expect(incomeObservation.locator("time")).toBeVisible()
    await page.reload()
    await waitForExtensionRoot(page)
    await row
      .getByRole("button", { name: "Balance details", exact: true })
      .click()
    await observation
      .getByRole("button", { name: "View details", exact: true })
      .click()
    await expect(details).toContainText("0.123456789012345678")
    await page.keyboard.press("Escape")
    const stored = await getPlasmoStorageJsonValue<AccountStorageConfig>(
      worker,
      STORAGE_KEYS.ACCOUNTS,
    )
    expect(stored?.accounts[0]?.account_info.reportedIncome).toEqual(
      reportedIncome,
    )
    expect(stored?.accounts[0]?.account_info.settledConsumption).toEqual(
      settledConsumption,
    )
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`chrome-extension://${extensionId}/options.html#account`)
      await waitForExtensionRoot(page)
      await page
        .getByRole("textbox", {
          name: "Enter site information or account information to search",
        })
        .fill("Native financial facts")
      const summary = page.getByRole("region", {
        name: "1 account",
        exact: true,
      })
      await expect(summary).toBeVisible()
      await expect(
        summary.getByRole("group", { name: "Today's consumption" }),
      ).toContainText("USD 0.12")
      await expect(
        summary.getByRole("group", { name: "Today's income" }),
      ).toContainText("25 Credits")
      await expect(
        summary.getByRole("group", { name: "Today's consumption" }),
      ).not.toContainText("12 Credits")
      await expect(
        summary.getByRole("group", { name: "Usage by site day", exact: true }),
      ).toContainText("12 Credits")
      if (width === 1440) {
        for (const value of ["$7.00", "USD 0.12", "25 Credits"]) {
          const typography = await summary
            .getByText(value, { exact: true })
            .evaluate((element) => {
              const style = getComputedStyle(element)
              return {
                size: Number.parseFloat(style.fontSize),
                weight: Number.parseInt(style.fontWeight, 10),
              }
            })
          expect
            .soft(typography.size, "Filtered amounts use compact peer sizing")
            .toBe(14)
          expect
            .soft(typography.weight, "Filtered amounts use restrained emphasis")
            .toBe(500)
        }
        for (const label of [
          "Balance",
          "Today's consumption",
          "Today's income",
        ]) {
          const separation = await summary
            .getByRole("group", { name: label, exact: true })
            .evaluate((element) =>
              Number.parseFloat(getComputedStyle(element).borderLeftWidth),
            )
          expect
            .soft(separation, "Only the account count boundary uses a divider")
            .toBe(label === "Balance" ? 1 : 0)
        }
        const coreBoxes = await Promise.all(
          ["Balance", "Today's consumption", "Today's income"].map((name) =>
            summary.getByRole("group", { name, exact: true }).boundingBox(),
          ),
        )
        expect(
          Math.max(...coreBoxes.map((box) => box!.y + box!.height)) -
            Math.min(...coreBoxes.map((box) => box!.y)),
          "Desktop balance, consumption and income retain their compact shared row",
        ).toBeLessThan(36)
        const siteDayBox = await summary
          .getByRole("group", { name: "Usage by site day", exact: true })
          .boundingBox()
        expect(siteDayBox!.y).toBeGreaterThanOrEqual(
          Math.max(...coreBoxes.map((box) => box!.y + box!.height)),
        )
        const incomeBox = await summary
          .getByRole("group", { name: "Today's income" })
          .boundingBox()
        const actionBox = await summary
          .getByRole("button", { name: "Details", exact: true })
          .boundingBox()
        const summaryBox = (await summary.boundingBox())!
        const headerBox = (await page
          .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountListHeader)
          .boundingBox())!
        const topInset = actionBox!.y - summaryBox.y - 1
        const bottomInset = headerBox.y - (siteDayBox!.y + siteDayBox!.height)
        expect(
          Math.abs(topInset - bottomInset),
          "The entire filtered statistics band has equal space above and below its content",
        ).toBeLessThan(1)
        expect(
          actionBox!.x - incomeBox!.x - incomeBox!.width,
          "Details stays beside the last statistic",
        ).toBeLessThan(24)
        expect(actionBox!.x).toBeGreaterThanOrEqual(
          incomeBox!.x + incomeBox!.width,
        )
        const labelBottoms = await Promise.all(
          [
            summary.getByText("1 account", { exact: true }),
            summary.getByText("Balance", { exact: true }),
            summary.getByText("Today's consumption", { exact: true }),
            summary.getByText("Today's income", { exact: true }),
            summary.getByRole("button", { name: "Details", exact: true }),
          ].map((locator) =>
            locator.evaluate((element) => {
              const walker = document.createTreeWalker(
                element,
                NodeFilter.SHOW_TEXT,
              )
              let node = walker.nextNode()
              while (node && !node.textContent?.trim()) node = walker.nextNode()
              if (!node) throw new Error("Expected a visible statistic label")
              const range = document.createRange()
              range.selectNodeContents(node)
              return range.getBoundingClientRect().bottom
            }),
          ),
        )
        expect(
          Math.max(...labelBottoms) - Math.min(...labelBottoms),
          "Count, metric names and Details share a text baseline",
        ).toBeLessThan(1)
      }
      const amountBottoms = await Promise.all(
        ["$7.00", "USD 0.12", "25 Credits"].map((value) =>
          summary.getByText(value, { exact: true }).evaluate((element) => {
            const walker = document.createTreeWalker(
              element,
              NodeFilter.SHOW_TEXT,
            )
            const node = walker.nextNode()
            if (!node) throw new Error("Expected a visible statistic amount")
            const range = document.createRange()
            range.selectNodeContents(node)
            return range.getBoundingClientRect().bottom
          }),
        ),
      )
      expect(
        Math.max(...amountBottoms) - Math.min(...amountBottoms),
        "Filtered amount text shares a baseline even when its labels wrap",
      ).toBeLessThan(1)
      expect(
        await summary.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      ).toBe(true)
      await captureVisualViews({
        page,
        ready: summary,
        captureTarget: summary,
        id: `filtered-cashflow-default-${width}`,
        extensionDir,
        views: [
          { id: "light", width, height: 900, theme: "light" },
          { id: "dark", width, height: 900, theme: "dark" },
        ],
      })
      await summary
        .getByRole("button", { name: "Details", exact: true })
        .click()
      const totals = page.getByRole("dialog", {
        name: "Filtered subtotals",
        exact: true,
      })
      await expect(
        totals.getByRole("group", { name: "Today's consumption" }),
      ).toContainText("USD 0.12")
      await expect(
        totals.getByRole("group", { name: "Today's consumption" }),
      ).not.toContainText("12 Credits")
      await expect(
        totals.getByRole("group", { name: "Today's income" }),
      ).toContainText("25 Credits")
      expect(
        await totals.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      ).toBe(true)
      await captureVisualViews({
        page,
        ready: totals,
        captureTarget: totals,
        id: `filtered-cashflow-${width}`,
        extensionDir,
        views: [
          { id: "light", width, height: 900, theme: "light" },
          { id: "dark", width, height: 900, theme: "dark" },
        ],
      })
    }
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error("fixture clipboard unavailable")
          },
        },
      }),
    )
    await page.setViewportSize({ width: 390, height: 850 })
    await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
    await waitForExtensionRoot(page)
    const balanceSummary = page.getByRole("region", {
      name: "Financial totals",
      exact: true,
    })
    await expect(
      balanceSummary.getByRole("region", {
        name: "Today's Consumption",
        exact: true,
      }),
    ).toContainText("USD 0.12")
    await expect(
      balanceSummary.getByRole("region", {
        name: "Today's income",
        exact: true,
      }),
    ).toContainText("25 Credits")
    await captureVisualViews({
      page,
      ready: balanceSummary,
      captureTarget: balanceSummary,
      id: "financial-overview",
      extensionDir,
      views: [
        { id: "compact-light", width: 320, height: 900, theme: "light" },
        { id: "narrow-dark", width: 390, height: 900, theme: "dark" },
      ],
    })
    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("button", { name: "Share overview snapshot" }).click()
    await (
      await downloadPromise
    ).saveAs(testInfo.outputPath("native-cashflow-share.png"))
    const caption = page.getByTestId(SHARE_SNAPSHOT_TEST_IDS.captionTextarea)
    await expect(caption).toHaveValue(/0\.123456789012345678/)
    await expect(caption).toHaveValue(/25 Credits/)
    // The offset provider period is shared under its own site-day label, outside local-day totals.
    await expect(caption).toHaveValue(
      /Usage by site day:.*12 Credits.*Partial daily statistic/,
    )
    await captureVisualViews({
      page,
      ready: caption,
      captureTarget: caption.locator(".."),
      id: "native-income-consumption-share",
      extensionDir,
    })
  },
)

test("keeps the three core totals visible and opens precision and coverage on request", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  test.setTimeout(process.env.AAH_VISUAL_CAPTURE_DIR ? 120_000 : 60_000)
  await forceExtensionLanguage(page, "zh-CN")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const worker = await getServiceWorker(context)
  const now = Date.now()
  const scope = accountBalanceScope({
    baseUrl: "https://sparse-fixture.invalid",
    accountId: "sparse",
  })
  const source = {
    adapter: "fixture",
    operation: "wallet",
    contractVersion: "1",
    kind: "reported" as const,
  }
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "sparse",
      site_name: "Sparse totals",
      site_url: scope.authority,
      exchange_rate: 7.2,
      account_info: {
        quota: undefined,
        today_quota_consumption: undefined,
        today_income: undefined,
        balance: accountBalanceSnapshot(
          scope,
          [
            balancePosition({
              id: "wallet",
              scope,
              source,
              asset: { kind: "currency", code: "USD" },
              observedAt: now,
              value: "0.03",
              nature: "prepaid",
            }),
          ],
          now,
          "partial",
        ),
      },
    }),
  ])
  await seedUserPreferences(worker, {
    showTodayCashflow: true,
    currencyType: "USD",
    themeMode: "light",
  })
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)
  await expect(page.getByText("$0.03", { exact: true }).first()).toBeVisible()
  await captureVisualViews({
    page,
    ready: page.getByText("$0.03", { exact: true }).first(),
    captureTarget: page.locator("body"),
    id: "sparse-overview-default",
    extensionDir,
    views: [
      { id: "compact-light", width: 320, height: 900, theme: "light" },
      { id: "narrow-dark", width: 390, height: 900, theme: "dark" },
    ],
  })
  await expect(page.getByRole("button", { name: "预付余额合计" })).toHaveCount(
    0,
  )
  const overview = page.getByRole("region", { name: "财务统计", exact: true })
  expect((await overview.boundingBox())!.height).toBeLessThan(135)
  await expect(overview).not.toContainText("已纳入")
  await overview
    .getByLabel("已纳入 1 / 1 个账户 · 部分覆盖", { exact: true })
    .click()
  const coverageHint = page.getByRole("tooltip")
  await expect(coverageHint).toContainText("已纳入 1 / 1 个账户")
  await captureVisualViews({
    page,
    ready: coverageHint,
    captureTarget: coverageHint,
    id: "overview-coverage-hint",
    extensionDir,
  })
  await page.keyboard.press("Escape")
  await expect(
    overview.getByRole("region", { name: "今日消耗", exact: true }),
  ).toContainText("待刷新")
  await expect(
    overview.getByRole("region", { name: "今日收入", exact: true }),
  ).toContainText("待刷新")
  await overview.getByRole("button", { name: "财务统计", exact: true }).click()
  const overviewDetails = page.getByRole("dialog", {
    name: "财务统计",
    exact: true,
  })
  await expect(overviewDetails.getByRole("combobox")).toHaveCount(0)
  await expect(overviewDetails).not.toContainText("充值余额")
  await expect(overviewDetails).not.toContainText("$0.00")
  await captureVisualViews({
    page,
    ready: overviewDetails,
    captureTarget: overviewDetails,
    id: "sparse-overview-details",
    extensionDir,
  })
  await expect(overviewDetails).toContainText("$0.03")
  await page.keyboard.press("Escape")
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  await waitForExtensionRoot(page)
  const search = page.getByRole("textbox", {
    name: "输入站点信息或账号信息进行搜索",
  })
  await search.fill("Sparse totals")
  const summary = page.getByRole("region", { name: "共 1 个账号", exact: true })
  await expect(
    page.getByTestId(getAccountManagementListItemTestId("sparse")),
  ).toContainText("$0.03")
  await captureVisualViews({
    page,
    ready: summary,
    captureTarget: summary,
    id: "sparse-subtotal-default",
    extensionDir,
    views: [{ id: "desktop-light", width: 1440, height: 900, theme: "light" }],
  })
  await expect(summary.getByRole("combobox")).toHaveCount(0)
  expect(
    (await summary.boundingBox())!.height,
    "Desktop sparse totals also stay in one row",
  ).toBeLessThan(36)
  await expect(summary).toContainText("$0.03")
  await expect(
    summary.getByRole("group", { name: "今日消耗", exact: true }),
  ).toContainText("待刷新")
  await expect(
    summary.getByRole("group", { name: "今日收入", exact: true }),
  ).toContainText("待刷新")
  const trigger = summary.getByRole("button", { name: "明细", exact: true })
  await trigger.focus()
  await expect(page.getByRole("dialog", { name: "筛选结果小计" })).toHaveCount(
    0,
  )
  await trigger.press("Enter")
  const details = page.getByRole("dialog", {
    name: "筛选结果小计",
    exact: true,
  })
  await expect(details).toContainText("$0.03")
  await expect(details).toContainText("部分覆盖")
  await expect(details.getByRole("combobox")).toHaveCount(0)
  await expect(details.getByRole("group", { name: "今日消耗" })).toContainText(
    "待刷新",
  )
  await expect(details.getByRole("group", { name: "今日收入" })).toContainText(
    "待刷新",
  )
  await captureVisualViews({
    page,
    ready: details,
    captureTarget: details,
    id: "sparse-subtotal-open",
    extensionDir,
    views: [
      { id: "desktop-light", width: 1440, height: 900, theme: "light" },
      { id: "narrow-dark", width: 390, height: 900, theme: "dark" },
      { id: "compact-light", width: 320, height: 900, theme: "light" },
    ],
  })
  await page.keyboard.press("Escape")
  await expect(details).toHaveCount(0)
  await seedUserPreferences(worker, {
    showTodayCashflow: true,
    currencyType: "CNY",
    themeMode: "light",
  })
  await page.reload()
  await waitForExtensionRoot(page)
  await search.fill("Sparse totals")
  await trigger.click()
  await expect(details).toContainText("¥0.22")
  await expect(details).toContainText("折合人民币")
  await expect(details).not.toContainText("USD → CNY")
  await details.getByRole("button", { name: "余额明细", exact: true }).click()
  const assets = page.getByRole("dialog", { name: "余额明细", exact: true })
  await expect(assets).toContainText(/USD\s*0\.03/)
  await page.keyboard.press("Escape")
  await expect(details).toBeVisible()
  await captureVisualViews({
    page,
    ready: details,
    captureTarget: details,
    id: "sparse-subtotal-converted",
    extensionDir,
    views: [{ id: "light", width: 390, height: 900, theme: "light" }],
  })
  await page.keyboard.press("Escape")
  await search.fill("no matching account")
  await expect(
    page.getByRole("region", { name: "共 0 个账号", exact: true }),
  ).toBeVisible()
  await page.getByRole("button", { name: "明细", exact: true }).click()
  await expect(details).toContainText("不可用")
  await expect(details).not.toContainText("¥0.22")
  await captureVisualViews({
    page,
    ready: details,
    captureTarget: details,
    id: "sparse-subtotal-empty",
    extensionDir,
  })
})
