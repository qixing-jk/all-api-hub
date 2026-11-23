import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { getAccountManagementListItemTestId } from "~/features/AccountManagement/testIds"
import { accountAllowanceObservation } from "~/services/accounts/allowances"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import { budgetConstraint } from "~/services/amounts/budgets"
import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import {
  DEFAULT_BALANCE_HISTORY_PREFERENCES,
  type DailyBalanceHistoryStore,
} from "~/types/dailyBalanceHistory"
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
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

test("explains expired and reset plans without presenting their retained amounts as current", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  await forceExtensionLanguage(page, "en")
  await page.emulateMedia({ reducedMotion: "reduce" })
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  const now = Date.now()
  const scope = accountBalanceScope({
    baseUrl: "https://allowance-fixture.invalid",
    accountId: "elapsed-plan",
  })
  const source = {
    adapter: "fixture",
    operation: "plans",
    kind: "reported" as const,
    contractVersion: "1",
  }
  const allowances = accountAllowanceObservation(
    scope,
    [
      {
        source,
        collectionKey: "plans",
        enumeration: "complete",
        entries: [
          {
            id: "expired",
            label: "Expired plan",
            identityKind: "upstream",
            collectionKey: "plans",
            validity: { kind: "expires", at: now - 1000 },
            constraint: budgetConstraint({
              scope,
              source,
              observedAt: now - 2000,
              asset: { kind: "currency", code: "USD" },
              limitState: "finite",
              limit: "20",
              used: "12",
              remaining: "5",
              enabled: true,
            }),
          },
          {
            id: "reset",
            label: "Reset plan",
            identityKind: "upstream",
            collectionKey: "plans",
            validity: { kind: "unknown" },
            constraint: budgetConstraint({
              scope,
              source,
              observedAt: now - 2000,
              asset: { kind: "currency", code: "USD" },
              limitState: "finite",
              remaining: "21",
              window: { kind: "periodic", period: "day", resetsAt: now - 1000 },
            }),
          },
        ],
      },
    ],
    now,
  ).allowances
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "elapsed-plan",
      site_name: "Elapsed plans",
      account_info: { allowances, quota: undefined },
    }),
  ])
  await page.setViewportSize({ width: 320, height: 900 })
  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  await waitForExtensionRoot(page)
  await page
    .getByTestId(getAccountManagementListItemTestId("elapsed-plan"))
    .getByRole("button", { name: "Balance details", exact: true })
    .click()
  const details = page.getByRole("dialog", {
    name: "Balance details",
    exact: true,
  })
  const expired = details.getByRole("group", { name: /Expired plan/ })
  const reset = details.getByRole("group", { name: /Reset plan/ })
  await expect(expired.getByText("Expired", { exact: true })).toBeVisible()
  await expect(
    reset.getByText("Reset · Last known value", { exact: true }),
  ).toBeVisible()
  await expect(expired.getByText("USD 5", { exact: true })).toBeVisible()
  await expect(reset.getByText("USD 21", { exact: true })).toBeVisible()
  await expect(details.getByRole("meter")).toHaveCount(0)
  await captureVisualViews({
    page,
    extensionDir,
    ready: details,
    captureTarget: details,
    id: "elapsed-plan-details",
    views: [
      { id: "compact-light", width: 320, height: 900, theme: "light" },
      { id: "narrow-dark", width: 390, height: 900, theme: "dark" },
    ],
  })
  const resetPlan = details.getByRole("group", {
    name: "Reset plan · Daily",
    exact: true,
  })
  await resetPlan.scrollIntoViewIfNeeded()
  await expect(
    resetPlan.getByText("Reset · Last known value", { exact: true }),
  ).toBeVisible()
  await captureVisualViews({
    page,
    extensionDir,
    ready: resetPlan,
    captureTarget: details,
    id: "elapsed-plan-details-lower",
    views: [
      { id: "compact-light", width: 320, height: 900, theme: "light" },
      { id: "narrow-dark", width: 390, height: 900, theme: "dark" },
    ],
  })
})

test("preserves independent plan windows through account reload and native history without balance or income", async ({
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
  const earlier = now - 86_400_000
  const scope = accountBalanceScope({
    baseUrl: "https://allowance-fixture.invalid",
    accountId: "allowance-fixture",
  })
  const source = {
    adapter: "fixture",
    operation: "plans",
    contractVersion: "1",
    kind: "reported" as const,
  }
  const observation = (at: number, day: string, week: string) =>
    accountAllowanceObservation(
      scope,
      [
        {
          source,
          collectionKey: "plans",
          enumeration: "complete",
          entries: [
            ...[
              ["day", day],
              ["week", week],
            ].map(([period, remaining]) => ({
              id: `plan:${period}`,
              identityKind: "upstream" as const,
              collectionKey: "plans",
              label: period === "day" ? "Daily plan" : "Weekly plan",
              validity: { kind: "unknown" as const },
              constraint: budgetConstraint({
                scope,
                source,
                observedAt: at,
                asset: { kind: "currency", code: "USD" },
                limitState: "finite",
                remaining,
                window: { kind: "unknown", period: period as "day" | "week" },
              }),
            })),
            ...(["unlimited", "inherited", "unknown"] as const).map(
              (limitState) => ({
                id: `state:${limitState}`,
                identityKind: "upstream" as const,
                collectionKey: "plans",
                label: `${limitState} plan`,
                validity: { kind: "unknown" as const },
                constraint: budgetConstraint({
                  scope,
                  source,
                  observedAt: at,
                  asset: { kind: "currency", code: "USD" },
                  limitState,
                  window: { kind: "unknown", period: "month" },
                }),
              }),
            ),
          ],
        },
      ],
      at,
    ).allowances
  const previous = observation(earlier, "20", "90")
  const current = observation(now, "10", "70")
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "allowance-fixture",
      site_name: "Independent plans",
      site_url: scope.authority,
      last_sync_time: now,
      account_info: {
        quota: undefined,
        balance: accountBalanceSnapshot(scope, [], now, "complete"),
        allowances: current,
      },
    }),
  ])
  await seedUserPreferences(worker, {
    showTodayCashflow: false,
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
      schemaVersion: 4,
      referenceSnapshotsByAccountId: {},
      financialSnapshotsByAccountId: {
        "allowance-fixture": [
          { allowances: previous, source: "refresh", generation: 1 },
          { allowances: current, source: "refresh", generation: 2 },
        ],
      },
    } satisfies DailyBalanceHistoryStore,
    { lock: STORAGE_LOCKS.DAILY_BALANCE_HISTORY },
  )
  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  await waitForExtensionRoot(page)
  const row = page.getByTestId(
    getAccountManagementListItemTestId("allowance-fixture"),
  )
  await expect(row.getByRole("progressbar")).toHaveCount(0)
  await row
    .getByRole("button", { name: "Balance details", exact: true })
    .click()
  const details = page.getByRole("dialog", {
    name: "Balance details",
    exact: true,
  })
  await expect(
    details.getByRole("group", { name: "Daily plan · Daily", exact: true }),
  ).toContainText("10")
  await expect(
    details.getByRole("group", { name: "Weekly plan · Weekly", exact: true }),
  ).toContainText("70")
  await expect(details).not.toContainText("Window unknown")
  await expect(details).toContainText(
    "Only the remaining allowance is provided",
  )
  for (const name of ["Daily plan · Daily", "Weekly plan · Weekly"]) {
    await expect(
      details.getByRole("group", { name, exact: true }),
    ).not.toContainText("N/A")
  }
  await captureVisualViews({
    page,
    ready: details,
    captureTarget: details,
    id: "account-plan-windows",
    extensionDir,
  })
  await page.reload()
  await waitForExtensionRoot(page)
  await row
    .getByRole("button", { name: "Balance details", exact: true })
    .click()
  await expect(
    details.getByRole("group", { name: "Weekly plan · Weekly", exact: true }),
  ).toContainText("70")
  await page.keyboard.press("Escape")
  await page.goto(
    `chrome-extension://${extensionId}/options.html#${MENU_ITEM_IDS.BALANCE_HISTORY}`,
  )
  await waitForExtensionRoot(page)
  const daily = page.getByRole("dialog")
  const openRecords = async (name: RegExp) => {
    await page.getByRole("button", { name }).click()
  }
  await openRecords(/^Daily plan · Daily/)
  await expect(daily).not.toContainText("N/A")
  await expect(daily).not.toContainText("Window unknown")
  await expect(
    daily.getByRole("cell", { name: /USD\s*20|20\s*USD/ }),
  ).toBeVisible()
  await expect(
    daily.getByRole("cell", { name: /USD\s*10|10\s*USD/ }),
  ).toBeVisible()
  await expect(
    daily.getByRole("columnheader", { name: "Estimated net inflow" }),
  ).toHaveCount(0)
  await captureVisualViews({
    page,
    ready: daily,
    captureTarget: daily,
    id: "account-plan-history",
    extensionDir,
    views: [
      { id: "desktop-light", width: 1440, height: 1000, theme: "light" },
      { id: "narrow-dark", width: 390, height: 1000, theme: "dark" },
      { id: "compact-light", width: 320, height: 1000, theme: "light" },
    ],
  })
  await page.keyboard.press("Escape")
  await openRecords(/^Weekly plan · Weekly/)
  await expect(
    daily.getByRole("heading", { name: /Weekly plan/ }),
  ).toBeVisible()
  await expect(daily).not.toContainText("N/A")
  await expect(daily).not.toContainText("Window unknown")
  await expect(
    daily.getByRole("cell", { name: /USD\s*90|90\s*USD/ }),
  ).toBeVisible()
  await expect(
    daily.getByRole("cell", { name: /USD\s*70|70\s*USD/ }),
  ).toBeVisible()
  await captureVisualViews({
    page,
    ready: daily,
    captureTarget: daily,
    id: "account-weekly-plan-history",
    extensionDir,
  })
  for (const [state, amount] of [
    ["unlimited", "Unlimited Quota"],
    ["inherited", "Inherited account budget"],
    ["unknown", "N/A"],
  ]) {
    await page.keyboard.press("Escape")
    await openRecords(new RegExp(`^${state!} plan · Monthly`))
    await expect(
      daily.getByRole("cell", { name: amount, exact: true }).first(),
    ).toBeVisible()
    await expect(daily).not.toContainText("Window unknown")
    if (state !== "unknown") await expect(daily).not.toContainText("N/A")
    await captureVisualViews({
      page,
      ready: daily,
      captureTarget: daily,
      id: `account-${state}-plan-history`,
      extensionDir,
    })
  }
  await page.evaluate(() =>
    localStorage.setItem("aah_dev_features_unlocked", "true"),
  )
  await page.reload()
  await waitForExtensionRoot(page)
  await openRecords(/^Daily plan · Daily/)
  const technical = daily.getByText("Technical details (debug)", {
    exact: true,
  })
  await expect(daily.getByText(/Limit: N\/A/)).not.toBeVisible()
  await captureVisualViews({
    page,
    ready: technical,
    captureTarget: daily,
    id: "account-plan-history-debug-collapsed",
    extensionDir,
  })
  await technical.click()
  await expect(daily.getByText(/Limit: N\/A/)).toBeVisible()
  await expect(daily.getByText(/Window unknown/)).toBeVisible()
  await captureVisualViews({
    page,
    ready: technical,
    captureTarget: daily,
    id: "account-plan-history-debug",
    extensionDir,
  })
  const stored = await getPlasmoStorageJsonValue<DailyBalanceHistoryStore>(
    worker,
    STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE,
  )
  expect(
    stored?.financialSnapshotsByAccountId?.[
      "allowance-fixture"
    ]?.[1]?.allowances?.entries.map((entry) => entry.constraint.remaining),
  ).toEqual(current.entries.map((entry) => entry.constraint.remaining))
  expect(
    stored?.financialSnapshotsByAccountId?.["allowance-fixture"]?.every(
      (entry) => entry.balance === undefined,
    ),
  ).toBe(true)
})
