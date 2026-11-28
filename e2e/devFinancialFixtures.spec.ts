import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import {
  POPUP_PAGE_PATH,
  SIDEPANEL_PAGE_PATH,
} from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { ACCOUNT_SITE_TYPE_VALUES, SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { buildDevFinancialScenarios } from "~/features/DevPanel/fixtureFinancialScenarios"
import { createUnavailableTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import type { AccountStorageConfig } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  categorizedNativeBalances,
  nativeBalanceExpectations,
} from "~~/e2e/scenarios/nativeBalanceExpectations"
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

// UI-only scenarios use the same canonical examples; fixture creation and cleanup
// remain covered through the Dev panel in the dedicated lifecycle workflow.
const buildBalanceUiAccounts = () =>
  buildDevFinancialScenarios(Date.now()).map((scenario, index) =>
    createStoredAccount({
      id: `balance-ui-${index}`,
      site_name: `Dev Balance: ${scenario.label}`,
      site_type: SITE_TYPES.UNKNOWN,
      site_url: scenario.baseUrl,
      last_sync_time: scenario.observedAt,
      account_info: {
        quota: undefined,
        balance: scenario.balance,
        allowances: scenario.allowances,
        todayStatsAvailability:
          createUnavailableTodayStatsAvailability("not_collected"),
      },
    }),
  )

for (const width of [1440, 390, 320] as const) {
  test(`dev balance scenarios align balances and cashflow at ${width}px`, async ({
    page,
    context,
    extensionId,
  }) => {
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    await page.emulateMedia({ reducedMotion: "reduce" })
    const worker = await getServiceWorker(context)
    const fixtures = buildBalanceUiAccounts()
    await seedStoredAccounts(worker, fixtures)
    await seedUserPreferences(worker, {
      themeMode: "light",
      showTodayCashflow: true,
      autoRefresh: false,
    })
    await page.setViewportSize({ width, height: 1100 })
    await page.goto(`chrome-extension://${extensionId}/options.html#account`)
    await waitForExtensionRoot(page)
    const accountSearch = page.getByRole("textbox", {
      name: "Enter site information or account information to search",
    })
    // Amounts and supplemental cashflow share the same value edge.
    const contentEdges: number[] = []
    for (const account of fixtures) {
      await accountSearch.fill(account.site_name)
      const accountRow = page.getByTestId(
        getAccountManagementListItemTestId(account.id),
      )
      await accountRow.scrollIntoViewIfNeeded()
      const primary = await accountRow
        .getByRole("group")
        .first()
        .getByText(/.+/)
        .first()
        .boundingBox()
      const income = await accountRow
        .getByRole("button", { name: /Click to refresh today's income/ })
        .boundingBox()
      const detailsButton = await accountRow
        .getByRole("button", { name: "Balance details", exact: true })
        .boundingBox()
      if (!primary || !income || !detailsButton)
        throw new Error("Missing financial row layout")
      const contentRight = primary.x + primary.width
      contentEdges.push(contentRight)
      expect(
        Math.abs(income.x + income.width - contentRight),
        `${account.site_name} cashflow at ${width}px`,
      ).toBeLessThanOrEqual(1)
      expect(
        detailsButton.width,
        `${account.site_name} details width at ${width}px`,
      ).toBeCloseTo(20, 0)
    }
    expect(
      Math.max(...contentEdges) - Math.min(...contentEdges),
      `balance edges at ${width}px`,
    ).toBeLessThanOrEqual(1)
    await accountSearch.clear()
  })
}

test("dev balance scenarios keep hover feedback aligned and free of extra blocks", async ({
  page,
  context,
  extensionId,
}) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const worker = await getServiceWorker(context)
  const walletAccount = buildBalanceUiAccounts()[0]!
  await seedStoredAccounts(worker, [walletAccount])
  await page.setViewportSize({ width: 1440, height: 1000 })
  const row = () =>
    page.getByTestId(getAccountManagementListItemTestId(walletAccount.id))
  // Hovering financial text must not paint a second block or move its aligned edge.
  for (const theme of ["light", "dark"] as const) {
    await seedUserPreferences(worker, {
      themeMode: theme,
      showTodayCashflow: true,
      autoRefresh: false,
    })
    await page.goto(`chrome-extension://${extensionId}/options.html#account`)
    await waitForExtensionRoot(page)
    const wallet = row()
    await wallet.scrollIntoViewIfNeeded()
    for (const button of [
      wallet.getByRole("button").filter({ has: page.getByRole("group") }),
      wallet.getByRole("button", {
        name: /Click to refresh today's income/,
      }),
    ]) {
      await page.mouse.move(0, 0)
      const before = await button.boundingBox()
      const color = await button.evaluate((el) => getComputedStyle(el).color)
      await button.hover()
      await expect(button).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
      await expect(button).toHaveCSS("color", color)
      const after = await button.boundingBox()
      expect(after!.x).toBeCloseTo(before!.x, 1)
      expect(after!.width).toBeCloseTo(before!.width, 1)
    }
    const hint = page.getByRole("tooltip")
    await expect(hint).toBeVisible()
    // Tailwind composes cleared shadows as transparent zero-sized entries.
    const noVisibleShadow =
      /^none$|^(rgba\(0, 0, 0, 0\) 0px 0px 0px 0px(, )?)+$/
    await expect(hint).toHaveCSS("box-shadow", noVisibleShadow)
    await page.mouse.move(0, 0)
    await expect(hint).toHaveCount(0)
    const detailsTrigger = wallet.getByRole("button", {
      name: "Balance details",
      exact: true,
    })
    await detailsTrigger.hover()
    const preview = page.getByRole("dialog", {
      name: "Balance details",
      exact: true,
    })
    await expect(preview).toBeVisible()
    await expect(preview).toHaveCSS("box-shadow", noVisibleShadow)
    await page.mouse.move(0, 0)
    await expect(preview).toHaveCount(0)
  }
})
test("dev balance scenarios expose availability and plan details without overflow", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.addInitScript(() =>
    localStorage.setItem("aah_dev_features_unlocked", "true"),
  )
  await page.emulateMedia({ reducedMotion: "reduce" })
  const worker = await getServiceWorker(context)
  const fixtures = buildBalanceUiAccounts()
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "keep-real",
      site_name: "My account",
      notes: "dev fixture: USD wallet",
    }),
    ...fixtures,
  ])
  await seedUserPreferences(worker, {
    themeMode: "light",
    showTodayCashflow: true,
    autoRefresh: false,
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  await waitForExtensionRoot(page)
  const row = (label: string) => {
    const account = fixtures.find(
      (account) => account.site_name === `Dev Balance: ${label}`,
    )
    if (!account) throw new Error(`Missing scenario ${label}`)
    return page.getByTestId(getAccountManagementListItemTestId(account.id))
  }
  await expect(row("USD wallet")).toContainText("120.5")
  await expect(row("Zero balance")).toContainText("0")
  await expect(row("Negative balance")).toContainText("-$8.25")
  await expect(row("Multiple assets")).toContainText("GBP")
  await expect(
    row("Stale balance").getByRole("group", { name: /Last known value/ }),
  ).toBeVisible()
  await expect(
    row("Unavailable balance").getByRole("group", {
      name: /^Available credit · Unavailable/,
    }),
  ).toBeVisible()
  await expect(
    row("Independent plans").getByRole("group", {
      name: "Daily plan · Daily · $8.00",
      exact: true,
    }),
  ).toContainText("8")
  const later = page.getByRole("button", { name: "Later", exact: true })
  if (await later.isVisible()) await later.click()
  const accountSearch = page.getByRole("textbox", {
    name: "Enter site information or account information to search",
  })
  await page.evaluate(() => document.documentElement.classList.remove("dark"))
  await captureVisualViews({
    page,
    ready: row("USD wallet"),
    captureTarget: page.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.accountListView,
    ),
    id: "balance-fixture-list",
    extensionDir,
    views: [
      { id: "light", width: 1440, height: 1100, theme: "light" },
      { id: "dark", width: 390, height: 1000, theme: "dark" },
    ],
  })
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
    expect(overflow).toBe(false)
  }
  await accountSearch.fill("Dev Balance: Independent plans")
  await row("Independent plans")
    .getByRole("button", { name: "Balance details", exact: true })
    .click()
  const details = page.getByRole("dialog", {
    name: "Balance details",
    exact: true,
  })
  await expect(details).toContainText("Unlimited plan")
  await expect(details).toContainText("Daily plan")
  await captureVisualViews({
    page,
    ready: details,
    captureTarget: details,
    id: "balance-fixture-plans",
    extensionDir,
  })
  await page.keyboard.press("Escape")
  await accountSearch.clear()
})

test("dev balance scenarios persist, open in the real account UI and clean up without deleting a look-alike account", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.addInitScript(() =>
    localStorage.setItem("aah_dev_features_unlocked", "true"),
  )
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 1440, height: 1000 })
  const worker = await getServiceWorker(context)
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "keep-real",
      site_name: "My account",
      notes: "dev fixture: USD wallet",
    }),
  ])
  await seedUserPreferences(worker, {
    themeMode: "light",
    showTodayCashflow: true,
    autoRefresh: false,
  })
  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  const openPanel = page.getByRole("button", { name: "Dev: Open dev panel" })
  await waitForExtensionRoot(page)
  await openPanel.click()
  const panel = page.getByRole("dialog", { name: "Dev panel", exact: true })
  const add = panel.getByRole("button", {
    name: "Dev: Add balance and plan scenarios",
    exact: true,
  })
  await expect(add).toBeVisible()
  await add.click()
  await expect(
    panel.getByRole("button", { name: "Dev: Clear fixture accounts (9)" }),
  ).toBeEnabled()
  await captureVisualViews({
    page,
    ready: add,
    captureTarget: panel,
    id: "balance-fixture-tools",
    extensionDir,
    views: [
      { id: "light", width: 420, height: 900, theme: "light" },
      { id: "dark", width: 320, height: 900, theme: "dark" },
    ],
  })
  const config = await getPlasmoStorageJsonValue<AccountStorageConfig>(
    worker,
    STORAGE_KEYS.ACCOUNTS,
  )
  if (!config) throw new Error("Missing saved accounts")
  const fixtures = config.accounts.filter((a) =>
    a.site_name.startsWith("Dev Balance:"),
  )
  expect(fixtures).toHaveLength(9)
  const savedFixture = (label: string) => {
    const account = fixtures.find(
      (account) => account.site_name === `Dev Balance: ${label}`,
    )
    if (!account) throw new Error(`Missing saved scenario ${label}`)
    return account
  }
  for (const [label, amount] of [
    ["USD wallet", { status: "known", value: "120.5" }],
    ["Zero balance", { status: "known", value: "0" }],
    ["Negative balance", { status: "known", value: "-8.25" }],
    ["Stale balance", { status: "stale", value: "64.8" }],
    ["Unavailable balance", { status: "unavailable" }],
  ] as const) {
    expect(
      savedFixture(label).account_info.balance?.positions[0]?.amount,
    ).toMatchObject(amount)
  }
  expect(
    savedFixture("Multiple assets").account_info.balance?.positions.map(
      (position) => position.asset,
    ),
  ).toContainEqual(expect.objectContaining({ kind: "currency", code: "GBP" }))
  const savedPlans =
    savedFixture("Independent plans").account_info.allowances?.entries
  expect(savedPlans).toMatchObject([
    {
      id: "plan:day",
      label: "Daily plan",
      constraint: {
        limitState: "finite",
        remaining: { status: "known", value: "8" },
      },
    },
    {
      id: "plan:week",
      label: "Weekly plan",
      constraint: {
        limitState: "finite",
        remaining: { status: "known", value: "65" },
      },
    },
    {
      id: "plan:month",
      label: "Unlimited plan",
      constraint: { limitState: "unlimited" },
    },
  ])
  for (const account of fixtures) {
    expect(account.checkIn.automaticExecutionEnabled).toBe(false)
    expect(account.account_info.balance?.subject).toEqual({
      kind: "account",
      accountId: account.id,
    })
    for (const position of account.account_info.balance!.positions)
      expect(position.scope.subject).toEqual({
        kind: "account",
        accountId: account.id,
      })
    for (const entry of account.account_info.allowances?.entries ?? [])
      expect(entry.constraint.scope.subject).toEqual({
        kind: "account",
        accountId: account.id,
      })
  }
  const row = (label: string) =>
    page.getByTestId(getAccountManagementListItemTestId(savedFixture(label).id))
  const accountSearch = page.getByRole("textbox", {
    name: "Enter site information or account information to search",
  })
  await panel
    .getByRole("button", { name: "Dev: View account list", exact: true })
    .click()
  await expect(panel).not.toBeVisible()
  const later = page.getByRole("button", { name: "Later", exact: true })
  if (await later.isVisible()) await later.click()
  await expect(accountSearch).toBeVisible()
  await accountSearch.fill("Dev Balance: Multiple assets")
  await expect(row("Multiple assets")).toContainText("GBP")
  await accountSearch.clear()
  await page.reload()
  await expect(accountSearch).toBeVisible()
  await accountSearch.fill("Dev Balance: Multiple assets")
  await expect(row("Multiple assets")).toContainText("GBP")
  await accountSearch.clear()
  await openPanel.click()
  await panel
    .getByRole("button", { name: "Dev: Clear fixture accounts (9)" })
    .click()
  await expect(
    panel.getByRole("button", { name: "Dev: Clear fixture accounts (0)" }),
  ).toBeDisabled()
  await panel
    .getByRole("button", { name: "Dev: View account list", exact: true })
    .click()
  await expect(
    page.getByTestId(getAccountManagementListItemTestId("keep-real")),
  ).toBeVisible()
  const final = await getPlasmoStorageJsonValue<AccountStorageConfig>(
    worker,
    STORAGE_KEYS.ACCOUNTS,
  )
  if (!final) throw new Error("Missing saved accounts after cleanup")
  expect(final.accounts.map((account) => account.id)).toEqual(["keep-real"])
  await expect(
    page.getByText("Dev Balance: USD wallet", { exact: true }),
  ).toHaveCount(0)
})

// Keep every site's details and converted balance covered in bounded batches.
// Each batch still creates and verifies the complete fixture inventory.
const nativeBalanceBatchSize = 15
const nativeBalanceBatches = [
  "native balance details",
  "currency conversion",
].flatMap((phase) =>
  Array.from(
    {
      length: Math.ceil(
        ACCOUNT_SITE_TYPE_VALUES.length / nativeBalanceBatchSize,
      ),
    },
    (_, index) => ({
      phase,
      siteTypes: ACCOUNT_SITE_TYPE_VALUES.slice(
        index * nativeBalanceBatchSize,
        (index + 1) * nativeBalanceBatchSize,
      ),
      suffix: ` batch ${index + 1}`,
    }),
  ),
)
for (const { phase, siteTypes, suffix } of [
  { phase: "native balance rows", siteTypes: [], suffix: "" },
  ...nativeBalanceBatches,
  { phase: "currency switching", siteTypes: [], suffix: "" },
] as const) {
  test(`dev site balance scenarios cover every account type with ${phase}${suffix}`, async ({
    page,
    context,
    extensionId,
    extensionDir,
  }) => {
    if (
      process.env.AAH_VISUAL_CAPTURE_DIR &&
      (phase === "native balance rows" || phase === "native balance details")
    ) {
      const { timeout } = test.info()
      if (timeout > 0) test.setTimeout(timeout + 60_000)
    }

    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    await page.addInitScript(() =>
      localStorage.setItem("aah_dev_features_unlocked", "true"),
    )
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.addLocatorHandler(
      page.getByRole("button", { name: "Later", exact: true }),
      async (later) => {
        await later.click()
      },
    )
    const worker = await getServiceWorker(context)
    await seedStoredAccounts(worker, [])
    await seedUserPreferences(worker, {
      themeMode: "light",
      currencyType: "USD",
      showTodayCashflow: false,
      autoRefresh: false,
      currencyDisplay: "original",
    })
    await page.goto(`chrome-extension://${extensionId}/options.html#account`)
    await waitForExtensionRoot(page)
    await page.getByRole("button", { name: "Dev: Open dev panel" }).click()
    const panel = page.getByRole("dialog", { name: "Dev panel", exact: true })
    await panel
      .getByRole("button", {
        name: "Dev: Add native site balance scenarios",
        exact: true,
      })
      .click()
    await expect(
      panel.getByRole("button", {
        name: `Dev: Clear fixture accounts (${ACCOUNT_SITE_TYPE_VALUES.length})`,
      }),
    ).toBeEnabled()
    const config = await getPlasmoStorageJsonValue<AccountStorageConfig>(
      worker,
      STORAGE_KEYS.ACCOUNTS,
    )
    if (!config) throw new Error("Missing native scenarios")
    if (
      process.env.AAH_BALANCE_FIXTURE_EVIDENCE_DIR &&
      (phase === "native balance rows" || phase === "currency switching")
    ) {
      const directory = process.env.AAH_BALANCE_FIXTURE_EVIDENCE_DIR
      await mkdir(directory, { recursive: true })
      await writeFile(
        path.join(
          directory,
          phase === "native balance rows"
            ? "native-scenarios.json"
            : "currency-scenarios.json",
        ),
        JSON.stringify(
          config.accounts.map((account) => ({
            siteType: account.site_type,
            balance: account.account_info.balance,
            allowances: account.account_info.allowances,
          })),
          null,
          2,
        ),
      )
    }
    expect(config.accounts.map((a) => a.site_type).sort()).toEqual(
      [...ACCOUNT_SITE_TYPE_VALUES].sort(),
    )
    for (const account of config.accounts) {
      expect(account.checkIn.automaticExecutionEnabled).toBe(false)
      expect(account.account_info.balance?.subject).toEqual({
        kind: "account",
        accountId: account.id,
      })
    }
    const row = (type: string) => {
      const account = config.accounts.find((a) => a.site_type === type)
      if (!account) throw new Error(`Missing type ${type}`)
      return page.getByTestId(getAccountManagementListItemTestId(account.id))
    }
    await panel
      .getByRole("button", { name: "Dev: View account list", exact: true })
      .click()
    await waitForExtensionRoot(page)
    // The normal list virtualizes large collections; use its search control to inspect each row.
    const search = page.getByRole("textbox", {
      name: "Enter site information or account information to search",
    })
    const show = async (type: string) => {
      await search.fill(`Dev Balance: ${type}`)
      await expect(row(type)).toBeVisible()
      return row(type)
    }
    if (phase === "native balance rows") {
      for (const account of config.accounts) {
        const visibleRow = await show(account.site_type)
        const expected =
          nativeBalanceExpectations[
            account.site_type as keyof typeof nativeBalanceExpectations
          ]
        expect(expected, account.site_type).toBeDefined()
        for (const text of expected)
          await expect(visibleRow).toContainText(text)
        for (const [category, amount] of categorizedNativeBalances[
          account.site_type as keyof typeof categorizedNativeBalances
        ] ?? []) {
          await expect(
            visibleRow
              .getByRole("group", { name: new RegExp(category, "u") })
              .getByText(amount, { exact: true }),
          ).toBeVisible()
        }
        await captureVisualViews({
          page,
          ready: visibleRow,
          captureTarget: visibleRow,
          id: `all-native-${account.site_type.toLowerCase()}`,
          extensionDir,
          views: [{ id: "light", width: 1440, height: 1000, theme: "light" }],
        })
      }
      if (process.env.AAH_VISUAL_CAPTURE_DIR) {
        for (const type of [
          SITE_TYPES.NEW_API,
          SITE_TYPES.SUB2API,
          SITE_TYPES.RELAYFOR,
          SITE_TYPES.KIMI,
          SITE_TYPES.DAHL,
          SITE_TYPES.CUBENCE,
          SITE_TYPES.FREEMODEL,
        ]) {
          const visibleRow = await show(type)
          await captureVisualViews({
            page,
            ready: visibleRow,
            captureTarget: visibleRow,
            id: `native-${type.toLowerCase()}`,
            extensionDir,
            views: [
              { id: "light", width: 1440, height: 1000, theme: "light" },
              { id: "dark", width: 390, height: 1000, theme: "dark" },
            ],
          })
        }
      }
    } else if (phase === "native balance details") {
      const detailTexts: Record<string, readonly string[]> = {
        [SITE_TYPES.FREEMODEL]: ["5 hours", "Weekly"],
        [SITE_TYPES.KRILL]: ["Daily"],
        [SITE_TYPES.NANOGPT]: ["Daily", "Weekly", "XNO", "Image"],
        [SITE_TYPES.FOXCODE]: [
          "Daily",
          "Weekly",
          "Monthly",
          "Yearly",
          "All time",
        ],
        [SITE_TYPES.SHAREDCHAT]: ["USD", "Daily"],
        [SITE_TYPES.RIGHT_CODE]: ["USD", "Daily"],
        [SITE_TYPES.XIAOEN]: ["Permanent credit", "Daily credit"],
      }
      const supplementalTexts: Record<string, readonly string[]> = {
        [SITE_TYPES.DAHL]: [
          "Token pool",
          "Tokens on keys",
          "1.5 M Token",
          "1 M Token",
        ],
        [SITE_TYPES.NOVITA]: ["Pending charges", "Debt", "3.7"],
      }
      const details = page.getByRole("dialog", {
        name: "Balance details",
        exact: true,
      })
      for (const { site_type: type } of config.accounts.filter((account) =>
        siteTypes.some((type) => type === account.site_type),
      )) {
        const visibleRow = await show(type)
        await visibleRow
          .getByRole("button", { name: "Balance details", exact: true })
          .click()
        await expect(details).toBeVisible()
        expect(await details.innerText()).not.toMatch(
          /Credit type unverified|Funding source unverified|Usage scope unverified|Validity unverified|@standard-usd/,
        )
        for (const text of detailTexts[type] ?? [])
          await expect(details).toContainText(text)
        if (detailTexts[type])
          await captureVisualViews({
            page,
            ready: details,
            captureTarget: details,
            id: `all-native-${type.toLowerCase()}-details`,
            extensionDir,
            views: [{ id: "light", width: 1440, height: 1000, theme: "light" }],
          })
        if (type === SITE_TYPES.NEW_API) {
          const technical = details.getByText("Technical details (debug)", {
            exact: true,
          })
          await technical.click()
          const provenance = details.getByText(
            /new-api\/dev-fixture\/balance@standard-usd\/v1/,
          )
          await expect(provenance).toBeVisible()
          await captureVisualViews({
            page,
            ready: provenance,
            captureTarget: details,
            id: "new-api-debug-details",
            extensionDir,
          })
          await technical.click()
        }
        if (type === SITE_TYPES.FOXCODE && process.env.AAH_VISUAL_CAPTURE_DIR) {
          await details
            .getByText("All time", { exact: true })
            .scrollIntoViewIfNeeded()
          await captureVisualViews({
            page,
            ready: details,
            captureTarget: details,
            id: "native-foxcode-yearly-lifetime",
            extensionDir,
          })
        }
        if (supplementalTexts[type]) {
          for (const text of supplementalTexts[type])
            await expect(details).toContainText(text)
        }
        if (supplementalTexts[type] || type === SITE_TYPES.NANOGPT) {
          await captureVisualViews({
            page,
            ready: details,
            captureTarget: details,
            id: `native-${type.toLowerCase()}-details`,
            extensionDir,
          })
        }
        if (type === SITE_TYPES.NANOGPT || type === SITE_TYPES.NOVITA) {
          const isNanoGpt = type === SITE_TYPES.NANOGPT
          const metric = details.getByText(isNanoGpt ? "8 Image" : "Debt", {
            exact: true,
          })
          await metric.scrollIntoViewIfNeeded()
          await expect(metric).toBeVisible()
          await captureVisualViews({
            page,
            ready: details,
            captureTarget: details,
            id: isNanoGpt
              ? "native-nanogpt-images"
              : "native-novita-charges-debt",
            extensionDir,
          })
        }
        if (type === SITE_TYPES.NANOGPT) {
          await page.keyboard.press("Escape")
        } else {
          await details
            .getByRole("button", { name: "Close", exact: true })
            .click()
        }
        // A newly filtered row can appear beneath the old cursor and open its hover preview.
        await page.mouse.move(0, 0)
        await search.focus()
        await expect(details).not.toBeVisible()
      }
    } else {
      await page.goto(
        `chrome-extension://${extensionId}/options.html#${MENU_ITEM_IDS.BASIC}`,
      )
      await waitForExtensionRoot(page)
      await page.getByRole("button", { name: "CNY (¥)" }).click()
      await page.goto(`chrome-extension://${extensionId}/options.html#account`)
      await waitForExtensionRoot(page)
      if (phase === "currency conversion") {
        for (const account of config.accounts.filter((account) =>
          siteTypes.some((type) => type === account.site_type),
        )) {
          const visibleRow = await show(account.site_type)
          const expected =
            nativeBalanceExpectations[
              account.site_type as keyof typeof nativeBalanceExpectations
            ]
          for (const text of expected) {
            const match = /^\$([\d,.]+)$/.exec(text)
            const converted = match
              ? `¥${(Number(match[1]!.replaceAll(",", "")) * 7.2).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : text
            await expect(visibleRow).toContainText(converted)
          }
        }
      } else {
        await expect(await show(SITE_TYPES.NEW_API)).toContainText("¥72.00")
        await expect(await show(SITE_TYPES.SUB2API)).toContainText("¥88.85")
        await expect(await show(SITE_TYPES.KIMI)).toContainText("¥8.00")
        await expect(await show(SITE_TYPES.DAHL)).toContainText("2.5 M Token")
        await page.reload()
        await waitForExtensionRoot(page)
        await expect(await show(SITE_TYPES.NEW_API)).toContainText("¥72.00")
        await expect(await show(SITE_TYPES.SUB2API)).toContainText("¥88.85")
        for (const [entry, width] of [
          [POPUP_PAGE_PATH, 390],
          [SIDEPANEL_PAGE_PATH, 320],
        ] as const) {
          await page.setViewportSize({ width, height: 1000 })
          await page.goto(`chrome-extension://${extensionId}/${entry}`)
          await waitForExtensionRoot(page)
          await expect(await show(SITE_TYPES.RELAYFOR)).toContainText(
            "Permanent credit",
          )
          await expect(await show(SITE_TYPES.NEW_API)).toContainText("¥72.00")
          await expect(await show(SITE_TYPES.SUB2API)).toContainText("¥88.85")
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
          ).toBe(false)
          await captureVisualViews({
            page,
            ready: row(SITE_TYPES.SUB2API),
            id: `native-${entry.replace(".html", "")}`,
            extensionDir,
          })
        }
      }
    }
    await page.goto(`chrome-extension://${extensionId}/options.html#account`)
    await waitForExtensionRoot(page)
    await page.getByRole("button", { name: "Dev: Open dev panel" }).click()
    await panel
      .getByRole("button", {
        name: `Dev: Clear fixture accounts (${ACCOUNT_SITE_TYPE_VALUES.length})`,
      })
      .click()
    await expect(
      panel.getByRole("button", { name: "Dev: Clear fixture accounts (0)" }),
    ).toBeDisabled()
  })
}

test("dev native observation states persist for every type and distinguish missing from zero", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  test.setTimeout(180_000)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.addInitScript(() =>
    localStorage.setItem("aah_dev_features_unlocked", "true"),
  )
  await page.emulateMedia({ reducedMotion: "reduce" })
  const worker = await getServiceWorker(context)
  await seedStoredAccounts(worker, [
    createStoredAccount({ id: "keep-real", site_name: "My account" }),
  ])
  await seedUserPreferences(worker, {
    themeMode: "light",
    currencyType: "USD",
    currencyDisplay: "original",
    showTodayCashflow: false,
    autoRefresh: false,
  })
  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  await waitForExtensionRoot(page)
  await page.getByRole("button", { name: "Dev: Open dev panel" }).click()
  const panel = page.getByRole("dialog", { name: "Dev panel", exact: true })
  await panel
    .getByRole("button", {
      name: "Dev: Add native zero, missing and stale scenarios",
      exact: true,
    })
    .click()
  await expect(
    panel.getByRole("button", {
      name: `Dev: Clear fixture accounts (${ACCOUNT_SITE_TYPE_VALUES.length * 3 + 1})`,
    }),
  ).toBeEnabled()
  const config = await getPlasmoStorageJsonValue<AccountStorageConfig>(
    worker,
    STORAGE_KEYS.ACCOUNTS,
  )
  if (!config) throw new Error("Missing persisted state scenarios")
  const fixtures = config.accounts.filter((a) => a.id !== "keep-real")
  expect(fixtures).toHaveLength(ACCOUNT_SITE_TYPE_VALUES.length * 3 + 1)
  await panel
    .getByRole("button", { name: "Dev: View account list", exact: true })
    .click()
  const search = page.getByRole("textbox", {
    name: "Enter site information or account information to search",
  })
  const stateRow = (name: string) => {
    const account = fixtures.find((a) => a.site_name === `Dev Balance: ${name}`)
    if (!account) throw new Error(`Missing state ${name}`)
    return page.getByTestId(getAccountManagementListItemTestId(account.id))
  }
  const show = async (name: string) => {
    await search.fill(`Dev Balance: ${name}`)
    const row = stateRow(name)
    await expect(row).toBeVisible()
    return row
  }
  for (const type of ACCOUNT_SITE_TYPE_VALUES) {
    // All three states fit together; one real search avoids repeating its debounce.
    await search.fill(`Dev Balance: ${type} ·`)
    const allowanceOnly =
      fixtures.find((a) => a.site_name === `Dev Balance: ${type} · missing`)!
        .account_info.balance!.positions.length === 0
    const zero = stateRow(`${type} · zero`)
    await expect(zero).toBeVisible()
    await expect(zero).not.toContainText("Unavailable")
    const zeroAccount = fixtures.find(
      (account) => account.site_name === `Dev Balance: ${type} · zero`,
    )!
    const asset =
      zeroAccount.account_info.balance?.positions[0]?.asset ??
      zeroAccount.account_info.allowances?.entries[0]?.constraint.asset
    if (!asset || asset.kind === "unknown") {
      throw new Error(`Missing native zero fixture for ${type}`)
    }
    const expectedZero =
      asset.kind === "currency"
        ? asset.code === "CNY"
          ? "¥0.00"
          : "$0.00"
        : asset.kind === "quota"
          ? `0 ${asset.displayLabel ?? asset.label}`
          : `0 ${asset.id}`
    await expect(
      zero.getByText(expectedZero, { exact: true }).first(),
    ).toBeVisible()
    const missing = stateRow(`${type} · missing`)
    await expect(missing).toBeVisible()
    await expect(
      missing.getByRole("button").filter({ has: page.getByRole("group") }),
    ).toContainText(allowanceOnly ? "N/A" : "Unavailable")
    const stale = stateRow(`${type} · stale`)
    await expect(stale).toBeVisible()
    await expect(
      stale.getByRole("button").filter({ has: page.getByRole("group") }),
    ).toContainText("Last known")
  }
  const requests = await show(`${SITE_TYPES.SHAREDCHAT} · requests`)
  await expect(requests).toContainText("requests")
  await expect(requests).not.toContainText("USD")
  await page.reload()
  await waitForExtensionRoot(page)
  await expect(await show(`${SITE_TYPES.NEW_API} · missing`)).toContainText(
    "Unavailable",
  )
  for (const state of ["zero", "missing", "stale"] as const) {
    const row = await show(`${SITE_TYPES.NOVITA} · ${state}`)
    await captureVisualViews({
      page,
      ready: row,
      captureTarget: row,
      id: `native-state-${state}`,
      extensionDir,
    })
  }
  await page.getByRole("button", { name: "Dev: Open dev panel" }).click()
  await panel
    .getByRole("button", {
      name: `Dev: Clear fixture accounts (${ACCOUNT_SITE_TYPE_VALUES.length * 3 + 1})`,
    })
    .click()
  await expect(
    panel.getByRole("button", { name: "Dev: Clear fixture accounts (0)" }),
  ).toBeDisabled()
  const final = await getPlasmoStorageJsonValue<AccountStorageConfig>(
    worker,
    STORAGE_KEYS.ACCOUNTS,
  )
  expect(final?.accounts.map((a) => a.id)).toEqual(["keep-real"])
})
