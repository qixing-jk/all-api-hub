import {
  OPTIONS_PAGE_PATH,
  POPUP_PAGE_PATH,
  SIDEPANEL_PAGE_PATH,
} from "~/constants/extensionPages"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { SHARE_SNAPSHOT_TEST_IDS } from "~/features/ShareSnapshots/testIds"
import enAccount from "~/locales/en/account.json" with { type: "json" }
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import { balancePosition } from "~/services/amounts/balance"
import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageJsonValue,
  getServiceWorker,
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import {
  buildFinancialIncomeFact,
  buildFinancialPeriodFact,
} from "~~/tests/test-utils/accountTodayStats"

const baseline = process.env.AAH_UX_BASELINE === "1"

for (const { path, width } of [
  { path: POPUP_PAGE_PATH, width: 380 },
  { path: SIDEPANEL_PAGE_PATH, width: 320 },
]) {
  test(`keeps converted totals, site-day costs, sharing and extra assets consistent in ${path}`, async ({
    page,
    context,
    extensionId,
  }, testInfo) => {
    test.skip(
      baseline,
      "Canonical mixed-currency fixtures are new to this branch",
    )
    test.setTimeout(120000)
    installExtensionPageGuards(page)
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.setViewportSize({ width, height: 1200 })
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
    const worker = await getServiceWorker(context)
    const window = await page.evaluate(() => {
      const date = new Date()
      const start = date.setHours(0, 0, 0, 0)
      const end = date.setHours(12, 0, 0, 0)
      return {
        start,
        end,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }
    })
    await page.clock.setFixedTime(window.end)
    const accounts = (
      [
        {
          id: "rate-fourteen",
          currency: "CNY",
          balance: "140",
          income: "28",
          cost: "14",
          rate: 14,
        },
        {
          id: "rate-seven",
          currency: "USD",
          balance: "2",
          income: "2",
          cost: "1",
          rate: 7,
        },
      ] as const
    ).map(({ id, currency, balance, income, cost, rate }) => {
      const fact = buildFinancialPeriodFact({
        accountId: id,
        value: cost,
        asset: { kind: "currency", code: currency },
      })
      fact.window = window
      if ("observedAt" in fact.amount) fact.amount.observedAt = window.end
      const incomeFact = buildFinancialIncomeFact({
        accountId: id,
        value: income,
        asset: fact.asset,
      })
      incomeFact.window = window
      if ("observedAt" in incomeFact.amount)
        incomeFact.amount.observedAt = window.end
      return createStoredAccount({
        id,
        site_name: id,
        site_url: fact.scope.authority,
        exchange_rate: rate,
        account_info: {
          quota: undefined,
          balance: accountBalanceSnapshot(
            fact.scope,
            [
              balancePosition({
                id: "wallet",
                scope: fact.scope,
                source: fact.amount.source,
                asset: fact.asset,
                value: balance,
                observedAt: Date.now(),
              }),
            ],
            Date.now(),
            "complete",
          ),
          reportedIncome: [incomeFact],
          settledConsumption: [fact],
          usage: {
            scope: "site_today",
            reportedDay: "2026-11-17",
            totalRequests: 4,
            totalTokens: 123,
            cost: {
              scope: fact.scope,
              asset: { kind: "currency", code: "CNY" },
              amount: {
                status: "known",
                source: fact.amount.source,
                observedAt: Date.now(),
                value: "140",
              },
            },
          },
        },
      })
    })
    await seedStoredAccounts(worker, accounts)
    const storedFacts = await getPlasmoStorageJsonValue(
      worker,
      STORAGE_KEYS.ACCOUNTS,
    )
    for (const { mode, total, dayFourteen, daySeven, net, cost, income } of [
      {
        mode: "original",
        total: "$2.00",
        dayFourteen: /^CNY\s*140(?:\.00)?$/u,
        daySeven: /^CNY\s*140(?:\.00)?$/u,
        net: undefined,
        cost: undefined,
        income: undefined,
      },
      {
        mode: "USD",
        total: "$12.00",
        dayFourteen: /^USD\s*10(?:\.00)?$/u,
        daySeven: /^USD\s*20(?:\.00)?$/u,
        net: /Net\s+USD\s*2(?:\.00)?\b/,
        cost: /^USD\s*2(?:\.00)?$/,
        income: /^USD\s*4(?:\.00)?$/,
      },
      {
        mode: "CNY",
        total: "¥154.00",
        dayFourteen: /^CNY\s*140(?:\.00)?$/u,
        daySeven: /^CNY\s*140(?:\.00)?$/u,
        net: /Net\s+CNY\s*21(?:\.00)?\b/,
        cost: /^CNY\s*21(?:\.00)?$/,
        income: /^CNY\s*42(?:\.00)?$/,
      },
    ] as const) {
      await seedUserPreferences(worker, {
        currencyDisplay: mode,
        currencyType: mode === "original" ? "CNY" : mode,
        showTodayCashflow: true,
        refreshOnOpen: false,
        autoRefresh: false,
      })
      await page.goto(`chrome-extension://${extensionId}/${path}`)
      await waitForExtensionRoot(page)
      const summary = page.getByRole("region", {
        name: "Financial totals",
        exact: true,
      })
      await expect(
        summary.getByText(total, { exact: true }).first(),
      ).toBeVisible()
      const day = summary.getByRole("group", {
        name: "Usage by site day",
        exact: true,
      })
      for (const [name, amount] of [
        ["rate-fourteen", dayFourteen],
        ["rate-seven", daySeven],
      ] as const) {
        const reportedDay = day
          .getByText(name, { exact: true })
          .locator("..")
          .filter({ hasText: "Requests" })
        await expect(reportedDay.getByText(amount)).toBeVisible()
      }
      await expect(day).toContainText("2026-11-17")
      if (cost && income) {
        const consumption = summary.getByRole("region", {
          name: "Today's Consumption",
          exact: true,
        })
        const received = summary.getByRole("region", {
          name: "Today's income",
          exact: true,
        })
        await expect(consumption.getByText(cost)).toBeVisible()
        await expect(received.getByText(income)).toBeVisible()
        await expect(consumption.getByText(cost)).toHaveCount(1)
        await expect(received.getByText(income)).toHaveCount(1)
        await expect(consumption).not.toContainText("Partial daily statistic")
        await expect(received).not.toContainText("Partial daily statistic")
      }
      if (mode === "original") {
        const assets = summary.getByRole("button", {
          name: "Balance details",
          exact: true,
        })
        await expect(assets).toContainText("Assets · 2")
        await assets.press("Enter")
        const detail = page.getByRole("dialog", {
          name: "Balance details",
          exact: true,
        })
        await expect(detail).toContainText(/CNY\s*140/)
        await detail.screenshot({
          path: testInfo.outputPath("original-extra-assets.png"),
          animations: "disabled",
        })
        await page.keyboard.press("Escape")
      }
      await summary.screenshot({
        path: testInfo.outputPath(`integrated-overview-${mode}.png`),
        animations: "disabled",
      })
      const download = page.waitForEvent("download")
      await page
        .getByRole("button", { name: "Share overview snapshot", exact: true })
        .click()
      await (
        await download
      ).saveAs(testInfo.outputPath(`integrated-share-${mode}.png`))
      const caption = page.getByTestId(SHARE_SNAPSHOT_TEST_IDS.captionTextarea)
      await expect(caption).toHaveValue(/Usage by site day/)
      await expect(caption).toHaveValue(/2026-11-17/)
      if (net) await expect(caption).toHaveValue(net)
      if (cost && income)
        await expect(caption).not.toHaveValue(/Partial daily statistic/)
      await caption.screenshot({
        path: testInfo.outputPath(`integrated-caption-${mode}.png`),
        animations: "disabled",
      })
      await caption
        .locator("..")
        .getByRole("button", { name: "Close", exact: true })
        .click()
      await expect(caption).toHaveCount(0)
      const accountRow = page.getByTestId(
        getAccountManagementListItemTestId("rate-fourteen"),
      )
      await accountRow.hover()
      await accountRow
        .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton)
        .click()
      await page
        .getByRole("menuitem", { name: "Share", exact: true })
        .press("ArrowRight")
      const accountDownload = page.waitForEvent("download")
      await page
        .getByRole("menuitem", { name: "Share account snapshot", exact: true })
        .click()
      await (
        await accountDownload
      ).saveAs(testInfo.outputPath(`integrated-account-share-${mode}.png`))
      await expect(caption).toHaveValue(
        mode === "USD" ? /\$10\.00/ : /¥140\.00/,
      )
      await expect(caption).toHaveValue(/CNY\s*140/)
      await caption
        .locator("..")
        .getByRole("button", { name: "Close", exact: true })
        .click()
      await expect(caption).toHaveCount(0)
      await expect
        .poll(async () =>
          getPlasmoStorageJsonValue(worker, STORAGE_KEYS.ACCOUNTS),
        )
        .toEqual(storedFacts)
    }
    const tokenScope = accountBalanceScope({
      baseUrl: "https://token-wallet.example",
      accountId: "token-wallet",
    })
    const tokens = createStoredAccount({
      id: "token-wallet",
      site_name: "Token wallet",
      site_url: tokenScope.authority,
      account_info: {
        quota: undefined,
        balance: accountBalanceSnapshot(
          tokenScope,
          [
            balancePosition({
              id: "tokens",
              scope: tokenScope,
              source: {
                kind: "reported",
                adapter: "fixture",
                operation: "wallet",
                contractVersion: "1",
              },
              asset: {
                kind: "quota",
                id: "fixture:tokens",
                label: "Token",
                displayScale: 1000000,
                displayLabel: "M Token",
              },
              value: "3000000",
              observedAt: Date.now(),
            }),
          ],
          Date.now(),
          "complete",
        ),
      },
    })
    await seedStoredAccounts(worker, [...accounts, tokens])
    await seedUserPreferences(worker, {
      currencyDisplay: "USD",
      currencyType: "USD",
      showTodayCashflow: true,
      refreshOnOpen: false,
      autoRefresh: false,
    })
    await page.reload()
    await waitForExtensionRoot(page)
    const summary = page.getByRole("region", {
      name: "Financial totals",
      exact: true,
    })
    await expect(
      summary.getByRole("button", { name: "Balance details", exact: true }),
    ).toContainText("Assets · 3")
    await summary.screenshot({
      path: testInfo.outputPath("converted-extra-assets.png"),
      animations: "disabled",
    })
    await summary
      .getByRole("button", { name: "Balance details", exact: true })
      .click()
    const extraAssets = page.getByRole("dialog", {
      name: "Balance details",
      exact: true,
    })
    await expect(extraAssets).toContainText("3 M Token")
    await expect(extraAssets).toContainText(/CNY\s*140/)
    await extraAssets.screenshot({
      path: testInfo.outputPath("converted-extra-assets-details.png"),
      animations: "disabled",
    })
    await page.keyboard.press("Escape")
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
    )
    await waitForExtensionRoot(page)
    await page
      .getByRole("textbox", {
        name: "Enter site information or account information to search",
        exact: true,
      })
      .fill("rate-")
    const filtered = page.getByRole("region", {
      name: "2 accounts",
      exact: true,
    })
    await expect(
      filtered
        .getByRole("group", { name: "Today's consumption" })
        .getByText(/^USD\s+2(?:\.00)?$/u),
    ).toBeVisible()
    await expect(
      filtered
        .getByRole("group", { name: "Today's income" })
        .getByText(/^USD\s+4(?:\.00)?$/u),
    ).toBeVisible()
    await expect(filtered).not.toContainText("Partial daily statistic")
    await filtered.screenshot({
      path: testInfo.outputPath("filtered-converted-cashflow.png"),
      animations: "disabled",
    })
    await seedUserPreferences(worker, {
      currencyDisplay: "original",
      currencyType: "CNY",
      showTodayCashflow: true,
      refreshOnOpen: false,
      autoRefresh: false,
    })
    await page.reload()
    await waitForExtensionRoot(page)
    await page
      .getByRole("textbox", {
        name: "Enter site information or account information to search",
        exact: true,
      })
      .fill("rate-")
    await expect(
      filtered.getByRole("button", { name: "Balance details", exact: true }),
    ).toContainText("Assets · 2")
    await filtered.screenshot({
      path: testInfo.outputPath("filtered-extra-assets.png"),
      animations: "disabled",
    })
    await seedUserPreferences(worker, {
      currencyDisplay: "USD",
      currencyType: "USD",
      showTodayCashflow: true,
      refreshOnOpen: false,
      autoRefresh: false,
    })
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#overview`,
    )
    await seedStoredAccounts(worker, accounts)
    await page.reload()
    await waitForExtensionRoot(page)
    const overviewDay = page.getByRole("region", {
      name: "Usage by site day",
      exact: true,
    })
    await expect(
      overviewDay.getByText("rate-fourteen", { exact: true }).locator(".."),
    ).toContainText(/USD\s*10(?:\.00)?/)
    await expect(
      overviewDay.getByText("rate-seven", { exact: true }).locator(".."),
    ).toContainText(/USD\s*20(?:\.00)?/)
    await expect(overviewDay).toContainText("2026-11-17")
    await expect(overviewDay).toContainText("Requests")
    await overviewDay.screenshot({
      path: testInfo.outputPath("options-provider-day.png"),
      animations: "disabled",
    })
    const todayCost = page
      .getByText("Today cost", { exact: true })
      .first()
      .locator("..")
    await expect(todayCost).toContainText(
      /USD\s*2(?:\.00)?(?=\s*Observation window:)/,
    )
    await expect(todayCost).not.toContainText("Partial daily statistic")
    await todayCost.screenshot({
      path: testInfo.outputPath("options-converted-cashflow.png"),
      animations: "disabled",
    })
  })
}
const cases = [
  {
    id: "legacy",
    name: "Imported balance",
    value: "20",
    reason: "legacy-semantics",
  },
  { id: "current", name: "Current balance", value: "15" },
  {
    id: "failed",
    name: "Refresh failed",
    value: "10",
    reason: "refresh-failed",
  },
  {
    id: "not-requested",
    name: "Not requested",
    value: "8",
    reason: "not-requested",
  },
  {
    id: "missing-response",
    name: "Missing response",
    value: "5",
    reason: "incomplete-enumeration",
  },
  { id: "uncollected", name: "Not collected" },
] as const

for (const { path, width } of [
  { path: OPTIONS_PAGE_PATH, width: 1440 },
  { path: POPUP_PAGE_PATH, width: 380 },
  { path: SIDEPANEL_PAGE_PATH, width: 320 },
]) {
  test(`explains retained balance states without hiding amounts in ${path}`, async ({
    page,
    context,
    extensionId,
  }, testInfo) => {
    installExtensionPageGuards(page)
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.setViewportSize({ width, height: 1400 })
    const worker = await getServiceWorker(context)
    const now = Date.now()
    const observedAt = now - 3_600_000
    const accounts = cases.map((sample) => {
      const scope = {
        subject: { kind: "account", accountId: sample.id },
        authority: `https://audit-${sample.id}.example`,
        projects: { kind: "all" },
        keys: { kind: "all" },
        models: { kind: "all" },
        groups: { kind: "all" },
      }
      const source = {
        kind: "reported",
        adapter: "fixture",
        operation: "wallet",
        contractVersion: "1",
      }
      const value = "value" in sample ? sample.value : undefined
      const reason = "reason" in sample ? sample.reason : undefined
      const amount =
        value === undefined
          ? { status: "unknown", source, reason: "not-collected" }
          : {
              status: reason ? "stale" : "known",
              value,
              observedAt: sample.id === "current" ? now : observedAt,
              source,
              ...(reason ? { reason } : {}),
            }
      return {
        id: sample.id,
        site_name: sample.name,
        site_url: scope.authority,
        site_type: "new-api",
        configVersion: 8,
        authType: "access_token",
        exchange_rate: 7,
        health: { status: "healthy" },
        disabled: false,
        excludeFromTotalBalance: false,
        excludeFromTodayIncome: false,
        last_sync_time: now,
        updated_at: now,
        user_updated_at: now,
        created_at: observedAt,
        notes: "",
        tagIds: [],
        checkIn: {
          automaticExecutionEnabled: false,
          selection: { mode: "automatic" },
          methodKnowledge: { methods: {} },
        },
        account_info: {
          id: "1",
          username: "review-account",
          access_token: "fixture-token",
          quota: value === undefined ? 0 : Number(value) * 500_000,
          ...(value === undefined ? { balanceUnavailable: true } : {}),
          today_quota_consumption: 0,
          today_income: 0,
          today_requests_count: 0,
          today_prompt_tokens: 0,
          today_completion_tokens: 0,
          ...(sample.id === "legacy"
            ? {}
            : {
                balance: {
                  schemaVersion: 2,
                  subject: scope.subject,
                  capturedAt: now,
                  coverage: "complete",
                  positions: [
                    {
                      id: "available",
                      collectionKey: "wallet",
                      scope,
                      asset: { kind: "currency", code: "USD" },
                      amount,
                      role: "available",
                      nature: "unknown",
                      funding: "unknown",
                      cashClassification: "unknown",
                      validity: { kind: "unknown" },
                    },
                  ],
                },
              }),
        },
      }
    })
    await setPlasmoStorageValue(
      worker,
      STORAGE_KEYS.USER_PREFERENCES,
      {
        lastUpdated: now,
        currencyType: "USD",
        currencyDisplay: "USD",
        showTodayCashflow: false,
        refreshOnOpen: false,
        autoRefresh: false,
        sortingPriorityConfig: { criteria: [], lastModified: now },
      },
      { lock: STORAGE_LOCKS.USER_PREFERENCES },
    )
    await setPlasmoStorageValue(
      worker,
      STORAGE_KEYS.ACCOUNTS,
      {
        schemaVersion: 1,
        accounts,
        bookmarks: [],
        pinnedAccountIds: [],
        orderedAccountIds: [],
        deletedEntryRecords: {},
        last_updated: now,
      },
      { lock: STORAGE_LOCKS.ACCOUNT_STORAGE },
    )
    await page.goto(
      `chrome-extension://${extensionId}/${path}${path === OPTIONS_PAGE_PATH ? "#account" : ""}`,
    )
    await waitForExtensionRoot(page)
    for (const sample of cases) {
      const row = page.getByTestId(
        getAccountManagementListItemTestId(sample.id),
      )
      await expect(row).toBeAttached()
      await row.scrollIntoViewIfNeeded()
      if ("value" in sample)
        await expect(
          row
            .getByText(`$${Number(sample.value).toFixed(2)}`, { exact: true })
            .first(),
        ).toBeVisible()
    }
    await page
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountListView)
      .screenshot({
        path: testInfo.outputPath("retained-states-list.png"),
        animations: "disabled",
      })
    if (baseline) return
    for (const [id, reason] of [
      ["legacy", enAccount.financial.observationReasons.legacy],
      ["failed", enAccount.financial.observationReasons.refreshFailed],
      ["not-requested", enAccount.financial.observationReasons.notRequested],
      [
        "missing-response",
        enAccount.financial.observationReasons.missingResponse,
      ],
    ] as const) {
      const row = page.getByTestId(getAccountManagementListItemTestId(id))
      await row
        .getByRole("button", { name: "Balance details", exact: true })
        .click()
      const details = page.getByRole("dialog", {
        name: "Balance details",
        exact: true,
      })
      await expect(details).toContainText(reason)
      if (id !== "legacy")
        await expect(
          details
            .locator(`time[datetime="${new Date(observedAt).toISOString()}"]`)
            .first(),
        ).toBeVisible()
      await details.screenshot({
        path: testInfo.outputPath(`details-${id}.png`),
        animations: "disabled",
      })
      await page.keyboard.press("Escape")
    }
  })
}

for (const { path, width } of [
  { path: OPTIONS_PAGE_PATH, width: 1440 },
  { path: POPUP_PAGE_PATH, width: 380 },
  { path: SIDEPANEL_PAGE_PATH, width: 320 },
]) {
  test(`makes exact manual balances accessible through ordinary details in ${path}`, async ({
    page,
    context,
    extensionId,
  }, testInfo) => {
    installExtensionPageGuards(page)
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.setViewportSize({ width, height: 1000 })
    const worker = await getServiceWorker(context)
    const scope = {
      subject: { kind: "account" as const, accountId: "manual-only" },
      authority: "https://manual-only.example",
      projects: { kind: "all" as const },
      keys: { kind: "all" as const },
      models: { kind: "all" as const },
      groups: { kind: "all" as const },
    }
    await seedStoredAccounts(worker, [
      createStoredAccount({
        id: "manual-reported",
        site_name: "Manual and provider",
        manualBalanceUsd: "123456.789",
        account_info: { quota: 60_250_000 },
      }),
      ...(baseline
        ? []
        : [
            createStoredAccount({
              id: "manual-only",
              site_name: "Manual only",
              manualBalanceUsd: "12.345678",
              account_info: {
                quota: undefined,
                balance: {
                  schemaVersion: 2,
                  subject: scope.subject,
                  capturedAt: Date.now(),
                  positions: [],
                  coverage: "unknown",
                },
              },
            }),
          ]),
    ])
    await seedUserPreferences(worker, {
      currencyType: "USD",
      currencyDisplay: "USD",
      showTodayCashflow: false,
      refreshOnOpen: false,
      autoRefresh: false,
    })
    await page.goto(
      `chrome-extension://${extensionId}/${path}${path === OPTIONS_PAGE_PATH ? "#account" : ""}`,
    )
    await waitForExtensionRoot(page)
    const row = page.getByTestId(
      getAccountManagementListItemTestId("manual-reported"),
    )
    await expect(row).toBeVisible()
    await row.screenshot({
      path: testInfo.outputPath("manual-row.png"),
      animations: "disabled",
    })
    if (baseline) return
    for (const { id, exact } of [
      { id: "manual-reported", exact: /123,456\.789/ },
      { id: "manual-only", exact: /12\.345678/ },
    ]) {
      await page
        .getByTestId(getAccountManagementListItemTestId(id))
        .getByRole("button", { name: "Balance details", exact: true })
        .click()
      const details = page.getByRole("dialog", {
        name: "Balance details",
        exact: true,
      })
      await expect(
        details.getByRole("region", { name: "Manual balance", exact: true }),
      ).toContainText(exact)
      const manualAmount = details
        .getByRole("region", { name: "Manual balance", exact: true })
        .getByText(exact)
        .first()
      await expect(manualAmount).toBeVisible()
      expect(
        await manualAmount.evaluate(
          (element) =>
            element.getBoundingClientRect().height /
            Number.parseFloat(getComputedStyle(element).lineHeight),
        ),
        "An ordinary exact manual amount fits on one readable line",
      ).toBeLessThanOrEqual(1.05)
      if (id === "manual-reported")
        await expect(details).toContainText(/120\.5/)
      await details.screenshot({
        path: testInfo.outputPath(`details-${id}.png`),
        animations: "disabled",
      })
      await page.keyboard.press("Escape")
    }
  })
}
