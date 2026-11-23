import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { PNG } from "pngjs"

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
import { buildDevSiteFinancialScenarios } from "~/features/DevPanel/fixtureSiteBalances"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import {
  AUTO_REFRESH_UPDATE_MESSAGE_TYPE,
  AUTO_REFRESH_UPDATE_TYPES,
} from "~/services/accounts/refresh/constants"
import type { Asset } from "~/services/amounts/assets"
import { balancePosition } from "~/services/amounts/balance"
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

test("balance value typography follows hierarchy across availability and native assets", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  await forceExtensionLanguage(page, "zh-CN")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const now = Date.now()
  const known = buildDevSiteFinancialScenarios(now)
  const missing = buildDevSiteFinancialScenarios(now, "missing")
  const types = [
    SITE_TYPES.CUBENCE,
    SITE_TYPES.RELAYFOR,
    SITE_TYPES.EMRANK,
    SITE_TYPES.SHAREDCHAT,
  ]
  const samples = types.flatMap((type) => [
    known.find((sample) => sample.siteType === type)!,
    missing.find((sample) => sample.siteType === type)!,
  ])
  const blank = structuredClone(
    known.find((sample) => sample.siteType === SITE_TYPES.SHAREDCHAT)!,
  )
  blank.allowances = undefined
  samples.push(blank)
  const accounts = samples.map((sample, index) =>
    createStoredAccount({
      id: `value-type-${index}`,
      site_name: `Typography ${index}: ${sample.siteType}`,
      site_type: sample.siteType,
      site_url: sample.baseUrl,
      account_info: {
        balance: sample.balance,
        allowances: sample.allowances,
        quota: undefined,
      },
    }),
  )
  const worker = await getServiceWorker(context)
  await seedStoredAccounts(worker, accounts)
  await seedUserPreferences(worker, {
    currencyType: "USD",
    autoRefresh: false,
    showTodayCashflow: false,
  })
  const observations: {
    width: number
    index: number
    values: { text: string | null; size: number }[]
    nameSize: number
  }[] = []
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(
      `chrome-extension://${extensionId}/${width === 1440 ? "options.html#account" : SIDEPANEL_PAGE_PATH}`,
    )
    await waitForExtensionRoot(page)
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      width === 390,
    )
    const search = page.getByPlaceholder(/输入站点信息或账号信息/)
    let reference: { text: string | null; size: number }[] = []
    for (const [index, account] of accounts.entries()) {
      await search.fill(account.site_name)
      const row = page.getByTestId(
        getAccountManagementListItemTestId(account.id),
      )
      await expect(row).toBeVisible()
      await expect(row.getByRole("group").first()).toBeVisible()
      if (index === 0)
        await expect(row.getByText("$12.50", { exact: true })).toBeVisible()
      const values = await row
        .getByRole("group")
        .locator("span.tabular-nums")
        .evaluateAll((elements) =>
          elements.map((element) => ({
            text: element.textContent,
            size: parseFloat(getComputedStyle(element).fontSize),
          })),
        )
      const nameSize = await row
        .getByText(account.site_name, { exact: true })
        .evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
      if (index === 0) reference = values
      observations.push({ width, index, values, nameSize })
      const primary = values[0]
      const numericPrimary = reference[0]
      if (!primary || !numericPrimary)
        throw new Error("Missing primary balance value")
      expect
        .soft(
          primary.size,
          `${account.site_name}: primary shares the numeric scale`,
        )
        .toBe(numericPrimary.size)
      expect
        .soft(
          primary.size,
          `${account.site_name}: primary is distinct from account identity`,
        )
        .toBeGreaterThan(nameSize)
      const secondary = values[1]
      if (secondary) {
        const numericSecondary = reference[1]
        if (!numericSecondary)
          throw new Error("Missing reference secondary balance value")
        expect
          .soft(
            secondary.size,
            `${account.site_name}: secondary shares the numeric scale`,
          )
          .toBe(numericSecondary.size)
      }
      if (index === 3 || index === accounts.length - 1)
        await captureVisualViews({
          page,
          ready: row,
          id: `value-type-${index}-${width}`,
          extensionDir,
        })
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
  console.log("value-typography-hierarchy", JSON.stringify(observations))
})

test("balance tooltip arrows point to the hovered amount rather than its wide column", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  await forceExtensionLanguage(page, "zh-CN")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const now = Date.now()
  const samples = buildDevSiteFinancialScenarios(now, "stale")
  const worker = await getServiceWorker(context)
  await seedStoredAccounts(
    worker,
    [SITE_TYPES.CUBENCE, SITE_TYPES.FREEMODEL].map((type, index) => {
      const sample = samples.find((item) => item.siteType === type)!
      return createStoredAccount({
        id: `arrow-${index}`,
        site_name: index ? "示例余额" : "多个余额",
        site_type: type,
        site_url: sample.baseUrl,
        last_sync_time: now,
        account_info: {
          balance: sample.balance,
          allowances: sample.allowances,
        },
      })
    }),
  )
  await seedUserPreferences(worker, {
    currencyType: "USD",
    autoRefresh: false,
    showTodayCashflow: false,
  })
  const measured: { width: number; value: string; delta: number }[] = []
  for (const [width, dark] of [
    [320, false],
    [390, true],
    [1440, false],
  ] as const) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(
      `chrome-extension://${extensionId}/${width === 1440 ? "options.html#account" : SIDEPANEL_PAGE_PATH}`,
    )
    await waitForExtensionRoot(page)
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      dark,
    )
    for (const [step, id, value, dismissAfter] of [
      ["single", 1, "$17.34", true],
      ["primary", 0, "$12.50", false],
      ["secondary", 0, "$9.00", false],
      ["return", 0, "$12.50", true],
      ["secondary-fresh", 0, "$9.00", true],
      ["keyboard", 0, "$12.50", true],
    ] as const) {
      const row = page.getByTestId(
        getAccountManagementListItemTestId(`arrow-${id}`),
      )
      const amount = row.getByText(value, { exact: true })
      if (step === "keyboard") {
        await row
          .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton)
          .focus()
        await page.keyboard.press("Tab")
        await expect(amount.locator("xpath=ancestor::button[1]")).toBeFocused()
      } else {
        await amount.hover()
      }
      const hint = page.getByRole("tooltip")
      await expect(
        hint,
        `balance hint at ${width}px for ${step} (${value})`,
      ).toBeVisible()
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      )
      const arrow = hint.locator('[aria-hidden="true"][data-side]')
      const a = (await amount.boundingBox())!,
        tip = (await arrow.boundingBox())!
      const side = await arrow.getAttribute("data-side")
      const vertical = side === "top" || side === "bottom"
      measured.push({
        width,
        value,
        delta: vertical
          ? Math.abs(a.x + a.width / 2 - tip.x - tip.width / 2)
          : Math.abs(a.y + a.height / 2 - tip.y - tip.height / 2),
      })
      await captureVisualViews({
        page,
        ready: hint,
        id: `arrow-${step}-${id}-${value.replace(/\W/g, "")}-${width}`,
        extensionDir,
      })
      if (dismissAfter) {
        await page.mouse.move(0, 0)
        await page.keyboard.press("Escape")
        await expect(hint).toHaveCount(0)
      }
    }
  }
  // An observation update can remove the hovered amount while retaining its
  // primary and refresh button. Exercise the normal background completion event.
  const updatingRow = page.getByTestId(
    getAccountManagementListItemTestId("arrow-0"),
  )
  const primary = updatingRow.getByText("$12.50", { exact: true })
  const secondary = updatingRow.getByText("$9.00", { exact: true })
  const refresh = primary.locator("xpath=ancestor::button[1]")
  await updatingRow
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton)
    .focus()
  await page.keyboard.press("Tab")
  await expect(refresh).toBeFocused()
  await secondary.hover()
  const bounds = (await refresh.boundingBox())!
  // Keep the pointer over the retained status column, without entering primary.
  await refresh.hover({ position: { x: bounds.width - 2, y: 3 } })
  const oldPrimary = (await primary.elementHandle())!
  const oldSecondary = (await secondary.elementHandle())!
  const oldRefresh = (await refresh.elementHandle())!
  const stored = (await getPlasmoStorageJsonValue<AccountStorageConfig>(
    worker,
    STORAGE_KEYS.ACCOUNTS,
  ))!
  stored.accounts
    .find((account) => account.id === "arrow-0")!
    .account_info.balance!.positions.splice(1, 1)
  await seedStoredAccounts(worker, stored.accounts)
  await worker.evaluate(
    async ({ type, completed }) => {
      await chrome.runtime.sendMessage({ type, payload: { type: completed } })
    },
    {
      type: AUTO_REFRESH_UPDATE_MESSAGE_TYPE,
      completed: AUTO_REFRESH_UPDATE_TYPES.Completed,
    },
  )
  await expect(secondary).toHaveCount(0)
  expect(await oldPrimary.evaluate((element) => element.isConnected)).toBe(true)
  expect(await oldSecondary.evaluate((element) => element.isConnected)).toBe(
    false,
  )
  expect(await oldRefresh.evaluate((element) => element.isConnected)).toBe(true)
  const updatedHint = page.getByRole("tooltip")
  await expect(updatedHint).toBeVisible()
  await expect
    .poll(async () => {
      const arrow = updatedHint.locator('[aria-hidden="true"][data-side]')
      const side = await arrow.getAttribute("data-side")
      const amountBounds = (await primary.boundingBox())!
      const arrowBounds = (await arrow.boundingBox())!
      return side === "top" || side === "bottom"
        ? Math.abs(
            amountBounds.x +
              amountBounds.width / 2 -
              arrowBounds.x -
              arrowBounds.width / 2,
          )
        : Math.abs(
            amountBounds.y +
              amountBounds.height / 2 -
              arrowBounds.y -
              arrowBounds.height / 2,
          )
    })
    .toBeLessThanOrEqual(2)
  await captureVisualViews({
    page,
    ready: updatedHint,
    id: "arrow-update-primary",
    extensionDir,
  })
  await page.mouse.move(0, 0)
  await page.keyboard.press("Escape")
  await expect(updatedHint).toHaveCount(0)
  console.log("balance-arrow-alignment", JSON.stringify(measured))
  for (const item of measured)
    expect(
      item.delta,
      `${item.width}/${item.value} arrow points at the visible amount`,
    ).toBeLessThanOrEqual(2)
})

test("ordinary zero and small balances expose their complete known amounts", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  await forceExtensionLanguage(page, "zh-CN")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const now = Date.now()
  const samples = [
    {
      id: "zero",
      name: "零余额",
      value: "0",
      summary: "$0.00",
      exact: "USD 0",
    },
    {
      id: "ordinary",
      name: "普通余额",
      value: "12.345678",
      summary: "$12.35",
      exact: "12.345678",
    },
    {
      id: "tiny",
      name: "小额非零",
      value: "0.000001",
      summary: "<$0.01",
      exact: "0.000001",
    },
    {
      id: "negative",
      name: "小额欠款",
      value: "-0.000001",
      summary: ">-$0.01",
      exact: "-USD 0.000001",
    },
  ]
  const worker = await getServiceWorker(context)
  const allowance = buildDevSiteFinancialScenarios(now).find(
    (sample) => sample.siteType === SITE_TYPES.SHAREDCHAT,
  )!
  const allowances = structuredClone(allowance.allowances!)
  allowances.entries = allowances.entries.slice(0, 1)
  const remaining = allowances.entries[0]!.constraint.remaining
  allowances.entries[0]!.constraint.remaining = {
    ...remaining,
    status: "known",
    observedAt: now,
    value: "0",
  }
  await seedStoredAccounts(worker, [
    ...samples.map((sample) => {
      const scope = accountBalanceScope({
        baseUrl: `https://known-${sample.id}.invalid`,
        accountId: sample.id,
      })
      return createStoredAccount({
        id: `known-${sample.id}`,
        site_name: sample.name,
        site_url: scope.authority,
        last_sync_time: now,
        account_info: {
          balance: accountBalanceSnapshot(
            scope,
            [
              balancePosition({
                id: "wallet",
                asset: { kind: "currency", code: "USD" },
                value: sample.value,
                scope,
                observedAt: now,
                source: {
                  kind: "reported",
                  adapter: "fixture",
                  operation: "balance",
                  contractVersion: "1",
                },
              }),
            ],
            now,
            "complete",
          ),
        },
      })
    }),
    createStoredAccount({
      id: "known-allowance",
      site_name: "零套餐余量",
      site_type: allowance.siteType,
      site_url: allowance.baseUrl,
      last_sync_time: now,
      account_info: { balance: allowance.balance, allowances },
    }),
  ])
  await seedUserPreferences(worker, {
    currencyType: "USD",
    showTodayCashflow: false,
    autoRefresh: false,
  })
  const inspected: { text: string; exact: string }[] = []
  for (const [width, dark] of [
    [320, true],
    [390, false],
  ] as const) {
    await page.setViewportSize({ width, height: 1100 })
    await page.goto(`chrome-extension://${extensionId}/${SIDEPANEL_PAGE_PATH}`)
    await waitForExtensionRoot(page)
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      dark,
    )
    for (const sample of [
      ...samples,
      { id: "allowance", summary: "$0.00", exact: "USD 0" },
    ]) {
      const row = page.getByTestId(
        getAccountManagementListItemTestId(`known-${sample.id}`),
      )
      await row.getByText(sample.summary, { exact: true }).hover()
      const hint = page.getByRole("tooltip")
      await expect(hint).toBeVisible()
      inspected.push({ text: await hint.innerText(), exact: sample.exact })
      await captureVisualViews({
        page,
        ready: hint,
        id: `known-hint-${sample.id}-${width}`,
        extensionDir,
      })
      await page.mouse.move(0, 0)
      await page.keyboard.press("Escape")
      await row
        .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton)
        .focus()
      await page.keyboard.press("Tab")
      await expect(hint).toBeVisible()
      inspected.push({ text: await hint.innerText(), exact: sample.exact })
      await page.keyboard.press("Escape")
    }
  }
  for (const hint of inspected) {
    expect(hint.text).toContain("精确金额")
    expect(hint.text.replace(/\s+/g, " ")).toContain(hint.exact)
    expect(hint.text).toContain("点击刷新余额")
  }
})

test("bounds long native account amounts while retaining exact ordinary details", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const now = 1795156200000
  await page.clock.install({ time: now })
  const samples: {
    id: string
    name: string
    value: string
    asset: Asset
    summary: string
    exact: string
  }[] = [
    {
      id: "currency",
      name: "Large wallet",
      value: "1234567.891",
      asset: { kind: "currency", code: "USD" },
      summary: "$1.23M",
      exact: "1,234,567.891",
    },
    {
      id: "quota",
      name: "Native quota",
      value: "5000000",
      asset: {
        kind: "quota",
        id: "unknown",
        label: "quota",
        displayLabel: "quota",
        displayScale: 1,
      },
      summary: "5M quota",
      exact: "5,000,000 quota",
    },
    {
      id: "tokens",
      name: "Token allowance",
      value: "5299832500000",
      asset: {
        kind: "quota",
        id: "tokens",
        label: "Token",
        displayLabel: "M Token",
        displayScale: 1000000,
      },
      summary: "5.3T Token",
      exact: "5,299,832.5 M Token",
    },
    {
      id: "crypto",
      name: "Crypto wallet",
      value: "1234567.891",
      asset: { kind: "crypto", id: "XNO" },
      summary: "1.23M XNO",
      exact: "1,234,567.891 XNO",
    },
    {
      id: "scaled",
      name: "Normal M Token",
      value: "2500000",
      asset: {
        kind: "quota",
        id: "tokens",
        label: "Token",
        displayLabel: "M Token",
        displayScale: 1000000,
      },
      summary: "2.5 M Token",
      exact: "2.5 M Token",
    },
    {
      id: "tiny",
      name: "Small nonzero wallet",
      value: "-0.000001",
      asset: { kind: "currency", code: "USD" },
      summary: ">-$0.01",
      exact: "0.000001",
    },
  ]
  const worker = await getServiceWorker(context)
  await seedStoredAccounts(
    worker,
    samples.map((sample) => {
      const scope = accountBalanceScope({
        baseUrl: `https://${sample.id}.invalid`,
        accountId: sample.id,
      })
      return createStoredAccount({
        id: `magnitude-${sample.id}`,
        site_name: sample.name,
        site_url: scope.authority,
        account_info: {
          balance: accountBalanceSnapshot(
            scope,
            [
              balancePosition({
                id: "wallet",
                asset: sample.asset,
                value: sample.value,
                scope,
                observedAt: now,
                source: {
                  kind: "reported",
                  adapter: "fixture",
                  operation: "balance",
                  contractVersion: "1",
                },
              }),
            ],
            now,
            "complete",
          ),
        },
      })
    }),
  )
  await seedUserPreferences(worker, {
    currencyType: "USD",
    showTodayCashflow: false,
    autoRefresh: false,
  })
  const rendered: {
    id: string
    expected: string
    text: string | null
    lines: number
  }[] = []
  for (const [width, theme] of [
    [320, "dark"],
    [390, "light"],
  ] as const) {
    await page.setViewportSize({ width, height: 1100 })
    await page.goto(`chrome-extension://${extensionId}/${SIDEPANEL_PAGE_PATH}`)
    await waitForExtensionRoot(page)
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      theme === "dark",
    )
    for (const sample of samples) {
      const row = page.getByTestId(
        getAccountManagementListItemTestId(`magnitude-${sample.id}`),
      )
      const amount = row.getByText(sample.summary, { exact: true })
      await expect(amount).toBeVisible()
      rendered.push({
        id: `${width}/${sample.id}`,
        expected: sample.summary,
        text: await amount.textContent(),
        lines: await amount.evaluate((element) => {
          const range = document.createRange()
          range.selectNodeContents(element)
          return new Set(
            [...range.getClientRects()].map((rect) => Math.round(rect.y)),
          ).size
        }),
      })
    }
    await captureVisualViews({
      page,
      ready: page.getByTestId(
        getAccountManagementListItemTestId("magnitude-currency"),
      ),
      id: `magnitude-panel-${width}-${theme}`,
      extensionDir,
    })
  }
  for (const sample of samples) {
    const row = page.getByTestId(
      getAccountManagementListItemTestId(`magnitude-${sample.id}`),
    )
    await row
      .getByRole("button", { name: "Balance details", exact: true })
      .click()
    const dialog = page.getByRole("dialog", {
      name: "Balance details",
      exact: true,
    })
    await expect(
      dialog.getByText(sample.exact, { exact: false }).first(),
    ).toBeVisible()
    await expect(
      dialog.getByText("Technical details (debug)", { exact: true }),
    ).toHaveCount(0)
    await captureVisualViews({
      page,
      ready: dialog,
      captureTarget: dialog,
      id: `magnitude-details-${sample.id}`,
      extensionDir,
    })
    await page.keyboard.press("Escape")
  }
  for (const item of rendered) {
    expect(item.text, item.id).toBe(item.expected)
    expect(item.lines, item.id).toBe(1)
  }
  for (const [id, summary, full] of [
    ["currency", "$1.23M", "1,234,567.891"],
    ["tokens", "5.3T Token", "5,299,832,500,000 Token"],
    ["scaled", "2.5 M Token", "2,500,000 Token"],
    ["crypto", "1.23M XNO", "1,234,567.891 XNO"],
  ] as const) {
    const row = page.getByTestId(
      getAccountManagementListItemTestId(`magnitude-${id}`),
    )
    await row.getByText(summary, { exact: true }).hover()
    const hint = page.getByRole("tooltip").filter({ hasText: "Exact amount" })
    await expect(hint).toBeVisible()
    await expect(hint).toContainText(full)
    await expect(hint).toContainText("Click to refresh balance")
    await captureVisualViews({
      page,
      ready: hint,
      id: `magnitude-hint-${id}`,
      extensionDir,
    })
    await page.mouse.move(0, 0)
    await page.keyboard.press("Escape")
    await expect(hint).toHaveCount(0)
    await row
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton)
      .focus()
    await page.keyboard.press("Tab")
    const refresh = row
      .getByRole("button")
      .filter({ has: page.getByText(summary, { exact: true }) })
    await expect(refresh).toBeFocused()
    await expect(hint).toBeVisible()
    await expect(hint).toContainText(full)
    await page.keyboard.press("Escape")
    await expect(hint).toHaveCount(0)
  }
})

test("empty balance placeholders use the same value and details alignment", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const now = 1795156200000
  await page.clock.install({ time: now })
  const worker = await getServiceWorker(context)
  const scenario = buildDevFinancialScenarios(now)[6]!
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "align-empty",
      site_name: "No balance observation",
      site_url: scenario.baseUrl,
      last_sync_time: now,
      account_info: { balance: scenario.balance },
    }),
  ])
  await seedUserPreferences(worker, {
    themeMode: "light",
    currencyType: "USD",
    showTodayCashflow: false,
    autoRefresh: false,
  })
  const offsets = []
  for (const [entry, width, surface] of [
    ["options.html#account", 1440, "options"],
    [POPUP_PAGE_PATH, 380, "popup"],
    [SIDEPANEL_PAGE_PATH, 320, "sidepanel"],
  ] as const) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`chrome-extension://${extensionId}/${entry}`)
    await waitForExtensionRoot(page)
    const row = page.getByTestId(
      getAccountManagementListItemTestId("align-empty"),
    )
    const value = row.getByText("Unavailable", { exact: true })
    await expect(value).toBeVisible()
    const amount = (await value.boundingBox())!
    const details = (await row
      .getByRole("button", { name: "Balance details", exact: true })
      .boundingBox())!
    offsets.push({
      surface,
      offset: Math.abs(
        amount.y + amount.height / 2 - details.y - details.height / 2,
      ),
    })
    await captureVisualViews({
      page,
      ready: row,
      captureTarget: row,
      id: `balance-row-empty-${surface}`,
      extensionDir,
    })
  }
  for (const item of offsets)
    expect(item.offset, item.surface).toBeLessThanOrEqual(1)
})

test("balance amounts and observation controls share a consistent alignment", async ({
  page,
  context,
  extensionId,
  extensionDir,
}, testInfo) => {
  test.setTimeout(120_000)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const now = 1795156200000
  await page.clock.install({ time: now })
  const worker = await getServiceWorker(context)
  const examples = buildDevFinancialScenarios(now)
  const voucher = examples[4]!
  const plans = examples[6]!
  await seedStoredAccounts(worker, [
    ...(
      [
        [SITE_TYPES.SUB2API, "default", "align-wallet"],
        [SITE_TYPES.NANOGPT, "default", "align-assets"],
        [SITE_TYPES.SHAREDCHAT, "stale", "align-stale"],
      ] as const
    ).map(([siteType, state, id]) => {
      const scenario = buildDevSiteFinancialScenarios(now, state).find(
        (s) => s.siteType === siteType,
      )!
      return createStoredAccount({
        id,
        site_name: id,
        site_type: siteType,
        site_url: scenario.baseUrl,
        last_sync_time: now,
        account_info: {
          balance: scenario.balance,
          allowances: scenario.allowances,
        },
      })
    }),
    createStoredAccount({
      id: "align-expired",
      site_name: "align-expired",
      site_url: voucher.baseUrl,
      last_sync_time: now,
      account_info: {
        balance: {
          ...voucher.balance,
          positions: voucher.balance.positions.map((p) => ({
            ...p,
            validity: { kind: "expires", at: now - 1000 },
          })),
        },
      },
    }),
    createStoredAccount({
      id: "align-reset",
      site_name: "align-reset",
      site_url: plans.baseUrl,
      last_sync_time: now,
      account_info: {
        balance: plans.balance,
        allowances: {
          ...plans.allowances!,
          entries: plans.allowances!.entries.slice(0, 1).map((entry) => ({
            ...entry,
            constraint: {
              ...entry.constraint,
              window: { kind: "periodic", period: "day", resetsAt: now - 1000 },
            },
          })),
        },
      },
    }),
  ])
  await seedUserPreferences(worker, {
    themeMode: "light",
    currencyType: "USD",
    showTodayCashflow: false,
    autoRefresh: false,
  })
  const metrics = []
  const cases: {
    id: string
    value: string
    status?: RegExp
    secondary?: string
  }[] = [
    { id: "align-wallet", value: "$12.34" },
    { id: "align-assets", value: "$42.75", secondary: "1.25 XNO" },
    { id: "align-stale", value: "$8.00", status: /Last known value/ },
    { id: "align-expired", value: "$15.00", status: /Expired/ },
    { id: "align-reset", value: "$8.00", status: /Reset/ },
  ]
  for (const [entry, width, surface] of [
    ["options.html#account", 1440, "options"],
    [POPUP_PAGE_PATH, 380, "popup"],
    [SIDEPANEL_PAGE_PATH, 320, "sidepanel"],
  ] as const) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`chrome-extension://${extensionId}/${entry}`)
    await waitForExtensionRoot(page)
    for (const item of cases) {
      const row = page.getByTestId(getAccountManagementListItemTestId(item.id))
      const value = row.getByText(item.value, { exact: true })
      await expect(value).toBeVisible()
      const amount = (await value.boundingBox())!
      const details = (await row
        .getByRole("button", { name: "Balance details", exact: true })
        .boundingBox())!
      const status = item.status
        ? row.getByRole("img", { name: item.status })
        : null
      const indicator =
        status && (await status.count()) ? await status.boundingBox() : null
      const secondary = item.secondary
        ? await row.getByText(item.secondary, { exact: true }).boundingBox()
        : null
      metrics.push({
        surface,
        id: item.id,
        amountRight: amount.x + amount.width,
        amountCenter: amount.y + amount.height / 2,
        detailsCenter: details.y + details.height / 2,
        statusLeft: indicator?.x ?? null,
        statusCenter: indicator ? indicator.y + indicator.height / 2 : null,
        statusRequired: Boolean(item.status),
        secondaryRight: secondary ? secondary.x + secondary.width : null,
      })
    }
    const list = page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountListView)
    await captureVisualViews({
      page,
      ready: list,
      captureTarget: list,
      id: `balance-row-alignment-${surface}`,
      extensionDir,
      views: [
        { id: "light", width, height: 900, theme: "light" },
        ...(surface === "sidepanel"
          ? [{ id: "dark", width, height: 900, theme: "dark" as const }]
          : []),
      ],
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false)
  }
  await testInfo.attach("balance-row-geometry", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  })
  for (const item of metrics) {
    expect(
      Math.abs(item.amountCenter - item.detailsCenter),
      `${item.surface}/${item.id}: amount and details share a center`,
    ).toBeLessThanOrEqual(1)
    const wallet = metrics.find(
      (other) => other.surface === item.surface && other.id === "align-wallet",
    )!
    expect(
      Math.abs(item.amountRight - wallet.amountRight),
      `${item.surface}/${item.id}: amount column aligns`,
    ).toBeLessThanOrEqual(1)
    if (item.secondaryRight !== null)
      expect(
        Math.abs(item.amountRight - item.secondaryRight),
      ).toBeLessThanOrEqual(1)
    if (item.statusRequired) {
      expect(
        item.statusLeft,
        `${item.surface}/${item.id}: status remains visible`,
      ).not.toBeNull()
      expect(item.statusLeft!).toBeGreaterThan(item.amountRight)
      expect(
        Math.abs(item.statusCenter! - item.detailsCenter),
      ).toBeLessThanOrEqual(1)
    }
  }
})

test("currency symbols and native allowance units stay consistent across account surfaces", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  test.setTimeout(120_000)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const now = 1795156200000
  await page.clock.install({ time: now })
  const worker = await getServiceWorker(context)
  await seedStoredAccounts(
    worker,
    (
      [
        [SITE_TYPES.SUB2API, "default", "symbol-wallet"],
        [SITE_TYPES.SHAREDCHAT, "stale", "symbol-plan"],
        [SITE_TYPES.SHAREDCHAT, "requests", "symbol-requests"],
        [SITE_TYPES.KIMI, "default", "symbol-cny"],
        [SITE_TYPES.NANOGPT, "default", "symbol-xno"],
      ] as const
    ).map(([siteType, state, id]) => {
      const scenario = buildDevSiteFinancialScenarios(now, state).find(
        (entry) => entry.siteType === siteType,
      )!
      return createStoredAccount({
        id,
        site_name: id,
        site_type: scenario.siteType,
        site_url: scenario.baseUrl,
        exchange_rate: 7.2,
        last_sync_time: now,
        account_info: {
          balance: scenario.balance,
          allowances: scenario.allowances,
        },
      })
    }),
  )
  for (const currencyType of ["USD", "CNY"] as const) {
    await seedUserPreferences(worker, {
      themeMode: "light",
      currencyType,
      showTodayCashflow: false,
      autoRefresh: false,
    })
    for (const [entry, width, surface] of [
      ["options.html#account", 1440, "options"],
      [POPUP_PAGE_PATH, 380, "popup"],
      [SIDEPANEL_PAGE_PATH, 320, "sidepanel"],
    ] as const) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`chrome-extension://${extensionId}/${entry}`)
      await waitForExtensionRoot(page)
      const row = (id: string) =>
        page.getByTestId(getAccountManagementListItemTestId(id))
      await expect(row("symbol-requests")).toContainText("8 requests")
      await expect(row("symbol-cny")).toContainText(
        currencyType === "USD" ? "$1.11" : "¥8.00",
      )
      await expect(row("symbol-xno")).toContainText("1.25 XNO")
      const plan = row("symbol-plan")
      await expect(plan).toContainText(
        currencyType === "USD" ? "$8.00" : "¥57.60",
      )
      await expect(plan).not.toContainText("USD")
      await expect(row("symbol-wallet")).toContainText(
        currencyType === "USD" ? "$12.34" : "¥88.85",
      )
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false)
      await captureVisualViews({
        page,
        ready: plan,
        captureTarget: page.getByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.accountListView,
        ),
        id: `currency-symbols-${surface}-${currencyType.toLowerCase()}`,
        extensionDir,
        views: [
          { id: "light", width, height: 900, theme: "light" },
          ...(currencyType === "CNY" && surface === "sidepanel"
            ? [{ id: "dark", width, height: 900, theme: "dark" as const }]
            : []),
        ],
      })
      await plan
        .getByRole("button", { name: "Balance details", exact: true })
        .click()
      const details = page.getByRole("dialog", {
        name: "Balance details",
        exact: true,
      })
      await expect(details).toContainText(/USD\s*8(?:\.00)?\s*\(Stale\)/)
      await expect(details).toContainText("Stale")
      await page.keyboard.press("Escape")
    }
  }
})

test("account balance rows remain readable across compact extension surfaces", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  test.setTimeout(120_000)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const now = 1795156200000
  await page.clock.install({ time: now })
  const worker = await getServiceWorker(context)
  const scenarios = [
    [SITE_TYPES.NEW_API, "stale"],
    [SITE_TYPES.SUB2API, "zero"],
    [SITE_TYPES.NANOGPT, "stale"],
    [SITE_TYPES.CUBENCE, "stale"],
    [SITE_TYPES.FREEMODEL, "stale"],
  ] as const
  await seedStoredAccounts(
    worker,
    scenarios.map(([siteType, state], index) => {
      const scenario = buildDevSiteFinancialScenarios(now, state).find(
        (entry) => entry.siteType === siteType,
      )!
      return createStoredAccount({
        id: `compact-balance-${index}`,
        last_sync_time: now,
        site_name: scenario.label,
        site_type: siteType,
        site_url: scenario.baseUrl,
        account_info: {
          balance: scenario.balance,
          allowances: scenario.allowances,
          todayStatsAvailability: {
            consumption: { status: "unavailable", reason: "not_collected" },
            income: { status: "unavailable", reason: "not_collected" },
            requests: { status: "unavailable", reason: "not_collected" },
            tokens: { status: "unavailable", reason: "not_collected" },
          },
        },
      })
    }),
  )
  await seedUserPreferences(worker, {
    themeMode: "light",
    currencyType: "USD",
    showTodayCashflow: true,
    autoRefresh: false,
  })
  for (const [entry, width, surface] of [
    ["options.html#account", 1440, "options"],
    [POPUP_PAGE_PATH, 380, "popup"],
    [SIDEPANEL_PAGE_PATH, 320, "sidepanel"],
  ] as const) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`chrome-extension://${extensionId}/${entry}`)
    await waitForExtensionRoot(page)
    const list = page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountListView)
    const row = page.getByTestId(
      getAccountManagementListItemTestId("compact-balance-2"),
    )
    await expect(row.getByRole("group", { name: /1.25 XNO/ })).toBeVisible()
    const balanceBox = (await row
      .getByText("$42.75", { exact: true })
      .boundingBox())!
    const incomeBox = (await row
      .getByRole("button", { name: /Click to refresh today's income/ })
      .boundingBox())!
    expect(
      Math.abs(balanceBox.x + balanceBox.width - incomeBox.x - incomeBox.width),
      "Balance and cashflow share the same right edge",
    ).toBeLessThanOrEqual(1)
    await expect(
      row.getByText("Available credit", { exact: true }),
    ).toHaveCount(0)
    const namedBalance = page.getByTestId(
      getAccountManagementListItemTestId("compact-balance-3"),
    )
    const normalBalanceLabel = namedBalance.getByText("Normal balance", {
      exact: true,
    })
    await expect(normalBalanceLabel).toBeVisible()
    for (const label of await normalBalanceLabel.all()) {
      expect(
        await label.evaluate((element) => {
          const word = document.createRange()
          word.setStart(element.firstChild!, 0)
          word.setEnd(element.firstChild!, "Normal".length)
          return word.getClientRects().length
        }),
        "A balance label must keep whole words readable at narrow widths",
      ).toBe(1)
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false)
    await captureVisualViews({
      page,
      ready: row,
      captureTarget: list,
      id: `compact-balances-${surface}`,
      extensionDir,
      views: [
        { id: "light", width, height: 900, theme: "light" },
        { id: "dark", width, height: 900, theme: "dark" },
      ],
    })
    await row
      .getByRole("button", { name: "Balance details", exact: true })
      .click()
    const details = page.getByRole("dialog", {
      name: "Balance details",
      exact: true,
    })
    await expect(details).toContainText("Stale")
    await expect(details).toContainText("XNO")
    await captureVisualViews({
      page,
      ready: details,
      captureTarget: details,
      id: `compact-balances-${surface}-details`,
      extensionDir,
    })
    await page.keyboard.press("Escape")
  }
})

for (const [siteType, label] of [
  [SITE_TYPES.NEW_API, "New API"],
  [SITE_TYPES.SUB2API, "Sub2API"],
] as const) {
  test(`ordinary ${label} balance details show only site facts across extension surfaces`, async ({
    page,
    context,
    extensionId,
    extensionDir,
  }) => {
    test.setTimeout(process.env.AAH_VISUAL_CAPTURE_DIR ? 120_000 : 60_000)
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    await page.emulateMedia({ reducedMotion: "reduce" })
    const now = 1794916800000
    await page.clock.install({ time: now })
    const scenario = buildDevSiteFinancialScenarios(now).find(
      (s) => s.siteType === siteType,
    )!
    const worker = await getServiceWorker(context)
    await seedStoredAccounts(worker, [
      createStoredAccount({
        id: "ordinary-balance",
        last_sync_time: now,
        site_name: `Ordinary ${label}`,
        site_type: scenario.siteType,
        site_url: scenario.baseUrl,
        account_info: {
          balance: scenario.balance,
          todayStatsAvailability: {
            consumption: { status: "unavailable", reason: "not_collected" },
            income: { status: "unavailable", reason: "not_collected" },
            requests: { status: "unavailable", reason: "not_collected" },
            tokens: { status: "unavailable", reason: "not_collected" },
          },
        },
      }),
    ])
    await seedUserPreferences(worker, {
      themeMode: "light",
      showTodayCashflow: false,
      autoRefresh: false,
    })
    for (const [entry, width] of [
      [POPUP_PAGE_PATH, 320],
      [SIDEPANEL_PAGE_PATH, 390],
      ["options.html#account", 1440],
    ] as const) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`chrome-extension://${extensionId}/${entry}`)
      await waitForExtensionRoot(page)
      const row = page.getByTestId(
        getAccountManagementListItemTestId("ordinary-balance"),
      )
      await row
        .getByRole("button", { name: "Balance details", exact: true })
        .click()
      const details = page.getByRole("dialog", {
        name: "Balance details",
        exact: true,
      })
      await expect(details).toContainText("USD")
      await expect(
        details.getByText("Technical details (debug)", { exact: true }),
      ).toHaveCount(0)
      if (siteType === SITE_TYPES.SUB2API) {
        await expect(
          details.getByText("USD 12.34", { exact: true }),
        ).toBeVisible()
        await expect(details).toContainText("Prepaid credit")
        await expect(details).not.toContainText(/\b(?:quota|Token)\b/i)
      }
      await captureVisualViews({
        page,
        ready: details,
        captureTarget: details,
        id: `ordinary-${siteType}-${width}`,
        extensionDir,
        views: [
          { id: "light", width, height: 900, theme: "light" },
          { id: "dark", width, height: 900, theme: "dark" },
        ],
      })
      if (
        process.env.AAH_VISUAL_CAPTURE_DIR &&
        process.env.AAH_VISUAL_CAPTURE_CONTEXT === "1"
      ) {
        const capturedViews = process.env.AAH_VISUAL_CAPTURE_VIEWS
          ? JSON.parse(process.env.AAH_VISUAL_CAPTURE_VIEWS)
          : [
              { id: "light", width, height: 900 },
              { id: "dark", width, height: 900 },
            ]
        for (const view of capturedViews) {
          const contextFile = path.join(
            process.env.AAH_VISUAL_CAPTURE_DIR!,
            `ordinary-${siteType}-${width}-${view.id}-context`,
          )
          const metadata = JSON.parse(
            await readFile(`${contextFile}.json`, "utf8"),
          )
          expect(metadata.capture).toBe("viewport")
          const contextImage = PNG.sync.read(
            await readFile(`${contextFile}.png`),
          )
          expect(contextImage.width).toBe(view.width)
          expect(contextImage.height).toBe(view.height)
        }
      }
      await expect
        .soft(details)
        .not.toContainText(/unverified|@standard-usd|\/api\//i, {
          timeout: 1000,
        })
      await expect
        .soft(details.locator("time").first())
        .toHaveAttribute("datetime", new Date(now).toISOString())
      expect
        .soft(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
        )
        .toBe(false)
      await page.keyboard.press("Escape")
    }
  })
}

test("keeps narrow balances beside account identity with compact row actions", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const worker = await getServiceWorker(context)
  const samples = buildDevSiteFinancialScenarios(Date.now())
  await seedStoredAccounts(
    worker,
    [SITE_TYPES.NANOGPT, SITE_TYPES.CUBENCE].map((siteType, index) => {
      const sample = samples.find((item) => item.siteType === siteType)!
      return createStoredAccount({
        id: `compact-row-${index}`,
        site_name: index ? "Cubence" : "NanoGPT",
        site_type: siteType,
        site_url: sample.baseUrl,
        exchange_rate: 7.2,
        account_info: {
          balance: sample.balance,
          allowances: sample.allowances,
        },
      })
    }),
  )
  await seedUserPreferences(worker, {
    currencyType: "CNY",
    showTodayCashflow: false,
    autoRefresh: false,
  })
  for (const [entry, width, theme] of [
    [POPUP_PAGE_PATH, 320, "light"],
    [SIDEPANEL_PAGE_PATH, 320, "dark"],
    [POPUP_PAGE_PATH, 380, "light"],
  ] as const) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`chrome-extension://${extensionId}/${entry}`)
    await waitForExtensionRoot(page)
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      theme === "dark",
    )
    for (const [index, amount] of [
      [0, "¥307.80"],
      [1, "¥90.00"],
    ] as const) {
      const row = page.getByTestId(
        getAccountManagementListItemTestId(`compact-row-${index}`),
      )
      const name = (await row
        .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowOpenButton)
        .boundingBox())!
      const value = (await row
        .getByText(amount, { exact: true })
        .boundingBox())!
      expect(
        value.x,
        "Balance remains beside the account identity",
      ).toBeGreaterThan(name.x + name.width)
      expect(
        Math.abs(value.y + value.height / 2 - name.y - name.height / 2),
        "Primary balance aligns with the account name",
      ).toBeLessThanOrEqual(4)
      expect(
        (await row.boundingBox())!.height,
        "Two native positions remain a compact list row",
      ).toBeLessThanOrEqual(108)
      const copy = (await row
        .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowCopyUrlButton)
        .boundingBox())!
      const edit = (await row
        .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton)
        .boundingBox())!
      expect(
        Math.abs(copy.y - edit.y),
        "Quick actions share a compact line",
      ).toBeLessThanOrEqual(1)
      expect(
        copy.x,
        "Row actions form a trailing group rather than a detached left toolbar",
      ).toBeGreaterThan(name.x + name.width)
      const user = (await row
        .getByText("e2e-user", { exact: true })
        .boundingBox())!
      expect(
        Math.abs(copy.y + copy.height / 2 - user.y - user.height / 2),
        "Actions align with the account metadata row",
      ).toBeLessThanOrEqual(4)
      await captureVisualViews({
        page,
        ready: row,
        captureTarget: row,
        id: `compact-paired-${index}-${entry.replace(".html", "")}-${width}-${theme}`,
        extensionDir,
      })
    }
  }
})

test("keeps daily cashflow below the compact account identity and actions", async ({
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
  const samples = buildDevSiteFinancialScenarios(now)
  await seedStoredAccounts(
    worker,
    [SITE_TYPES.NANOGPT, SITE_TYPES.CUBENCE].map((type, index) => {
      const sample = samples.find((item) => item.siteType === type)!
      const scope = structuredClone(sample.balance.positions[0]!.scope)
      scope.keys =
        scope.models =
        scope.projects =
        scope.groups =
          { kind: "all" }
      const fact = (value: string) => ({
        scope,
        asset: { kind: "currency", code: "USD" } as const,
        amount: {
          status: "known",
          value,
          observedAt: now,
          source: {
            kind: "reported",
            adapter: "fixture",
            operation: "daily",
            contractVersion: "1",
          },
        } as const,
        window: {
          start: new Date(now).setHours(0, 0, 0, 0),
          end: now,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        coverage: "complete" as const,
      })
      return createStoredAccount({
        id: `cashflow-layout-${index}`,
        site_name: index ? "Cubence" : "NanoGPT",
        site_type: type,
        site_url: sample.baseUrl,
        account_info: {
          balance: sample.balance,
          allowances: sample.allowances,
          settledConsumption: [{ ...fact("0.75"), settlement: "settled" }],
          reportedIncome: [{ ...fact("2.5"), classification: "unclassified" }],
        },
      })
    }),
  )
  await page.setViewportSize({ width: 320, height: 900 })
  const gaps: number[] = []
  for (const showTodayCashflow of [false, true]) {
    await seedUserPreferences(worker, {
      currencyType: "USD",
      showTodayCashflow,
      autoRefresh: false,
      balanceHistory: { estimatedTodayIncome: { enabled: true } },
    })
    await page.goto(`chrome-extension://${extensionId}/${SIDEPANEL_PAGE_PATH}`)
    await waitForExtensionRoot(page)
    for (const index of [0, 1]) {
      const row = page.getByTestId(
        getAccountManagementListItemTestId(`cashflow-layout-${index}`),
      )
      const name = (await row
        .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowOpenButton)
        .boundingBox())!
      const user = (await row
        .getByTitle("e2e-user", { exact: true })
        .boundingBox())!
      if (!showTodayCashflow) gaps[index] = user.y - name.y
      else {
        expect(
          user.y - name.y,
          "Daily statistics do not separate account identity",
        ).toBeLessThanOrEqual(gaps[index]! + 2)
        const copy = (await row
          .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowCopyUrlButton)
          .boundingBox())!
        const expense = row.getByRole("button").filter({ hasText: /-\$0\.75/ })
        await expect(expense).toBeVisible()
        expect(
          (await expense.boundingBox())!.y,
          "Daily cashflow follows the metadata and action line",
        ).toBeGreaterThanOrEqual(copy.y + copy.height)
        await expect(
          row.getByRole("button").filter({ hasText: /\+\$2\.50/ }),
        ).toBeVisible()
        await expect(
          row.getByText("Estimated net inflow", { exact: true }),
        ).toBeVisible()
        await captureVisualViews({
          page,
          ready: row,
          captureTarget: row,
          id: `daily-cashflow-layout-${index}`,
          extensionDir,
        })
      }
    }
  }
})

test("mixed native balances keep the overview bounded and expose each asset separately", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  test.setTimeout(process.env.AAH_VISUAL_CAPTURE_DIR ? 120_000 : 60_000)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const worker = await getServiceWorker(context)
  const examples = buildDevSiteFinancialScenarios(Date.now())
  const cubenceIndex = examples.findIndex(
    (example) => example.siteType === SITE_TYPES.CUBENCE,
  )
  await seedStoredAccounts(
    worker,
    examples.map((example, index) =>
      createStoredAccount({
        id: `overview-${index}`,
        site_name: `Dev Balance: ${example.label}`,
        site_type: example.siteType,
        site_url: example.baseUrl,
        exchange_rate: 7.2,
        account_info: {
          balance: example.balance,
          allowances: example.allowances,
        },
      }),
    ),
  )
  await seedUserPreferences(worker, {
    themeMode: "light",
    currencyType: "CNY",
    showTodayCashflow: false,
    autoRefresh: false,
  })
  for (const [entry, width] of [
    [POPUP_PAGE_PATH, 320],
    [SIDEPANEL_PAGE_PATH, 390],
    ["options.html#account", 1440],
  ] as const) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`chrome-extension://${extensionId}/${entry}`)
    await waitForExtensionRoot(page)
    if (width === 320 && !entry.startsWith("options")) {
      const row = page.getByTestId(
        getAccountManagementListItemTestId(`overview-${cubenceIndex}`),
      )
      await expect(
        row.getByText("Normal balance", { exact: true }),
      ).toBeVisible()
      for (const name of ["Normal balance", "Charity balance"]) {
        const lines = await row
          .getByText(name, { exact: true })
          .evaluate((element) => {
            const range = document.createRange()
            range.selectNodeContents(element)
            return new Set([...range.getClientRects()].map((rect) => rect.top))
              .size
          })
        expect(
          lines,
          `${name} remains readable beside its amount at 320px`,
        ).toBe(1)
      }
      for (const type of [
        SITE_TYPES.FREEMODEL,
        SITE_TYPES.GRSAI,
        SITE_TYPES.UNKNOWN,
      ]) {
        const index = examples.findIndex((example) => example.siteType === type)
        const search = page.getByRole("textbox", {
          name: "Enter site information or account information to search",
        })
        await search.fill(`Dev Balance: ${examples[index]!.label}`)
        const account = page.getByTestId(
          getAccountManagementListItemTestId(`overview-${index}`),
        )
        const expectedAmounts =
          type === SITE_TYPES.FREEMODEL
            ? ["¥124.85"]
            : nativeBalanceExpectations[type]!
        const values = account.getByText(
          new RegExp(
            `^(?:${expectedAmounts.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`,
          ),
        )
        await expect(values.first()).toBeVisible()
        for (const value of await values.all()) {
          expect(
            await value.evaluate(
              (element) => element.scrollWidth <= element.clientWidth,
            ),
            `${type} keeps the native amount readable at 320px`,
          ).toBe(true)
          const lines = await value.evaluate((element) => {
            const range = document.createRange()
            range.selectNodeContents(element)
            return new Set([...range.getClientRects()].map((rect) => rect.top))
              .size
          })
          expect(
            lines,
            `${type} keeps its common native amount and unit on one line`,
          ).toBe(1)
        }
        await search.clear()
      }
    }
    if (entry.startsWith("options")) {
      await page
        .getByRole("textbox", {
          name: "Enter site information or account information to search",
        })
        .fill("Dev Balance:")
      const filteredSummary = page.getByRole("region", {
        name: "40 accounts",
        exact: true,
      })
      await expect(filteredSummary).toBeVisible()
      expect(
        (await filteredSummary.boundingBox())!.height,
        "Filtered totals remain a compact strip above the list",
      ).toBeLessThan(36)
      await expect(
        filteredSummary.getByRole("combobox", { name: "Balance subtotal" }),
      ).toHaveCount(0)
      await filteredSummary
        .getByRole("button", { name: "Details", exact: true })
        .click()
    }
    const summary = entry.startsWith("options")
      ? page.getByRole("dialog", { name: "Filtered subtotals", exact: true })
      : page.getByRole("region", { name: "Financial totals", exact: true })
    await expect(summary).toContainText("¥2,853.94")
    await captureVisualViews({
      page,
      ready: summary,
      captureTarget: summary,
      id: `mixed-overview-${width}`,
      extensionDir,
      views: [
        { id: "light", width, height: 900, theme: "light" },
        { id: "dark", width, height: 900, theme: "dark" },
      ],
    })
  }
  for (const [entry, width] of [
    [POPUP_PAGE_PATH, 320],
    [SIDEPANEL_PAGE_PATH, 390],
    ["options.html#account", 1440],
  ] as const) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`chrome-extension://${extensionId}/${entry}`)
    await waitForExtensionRoot(page)
    if (entry.startsWith("options")) {
      await page
        .getByRole("textbox", {
          name: "Enter site information or account information to search",
        })
        .fill("Dev Balance:")
      await page.getByRole("button", { name: "Details", exact: true }).click()
    }
    const summary = entry.startsWith("options")
      ? page.getByRole("dialog", { name: "Filtered subtotals", exact: true })
      : page.getByRole("region", { name: "Financial totals", exact: true })
    expect((await summary.boundingBox())!.height).toBeLessThan(180)
    if (!entry.startsWith("options"))
      await summary
        .getByRole("button", { name: "Financial totals", exact: true })
        .click()
    const assetSummary = entry.startsWith("options")
      ? summary
      : page.getByRole("dialog", { name: "Financial totals", exact: true })
    const assets = assetSummary.getByRole(
      "button",
      entry.startsWith("options")
        ? { name: "Balance details", exact: true }
        : { name: /^Assets/ },
    )
    await assets.click()
    const details = entry.startsWith("options")
      ? page.getByRole("dialog", { name: "Balance details", exact: true })
      : assetSummary.getByRole("group", {
          name: "Balance details",
          exact: true,
        })
    await expect(details).toContainText("dahl")
    await expect(details).toContainText("emrank")
    await expect(details.getByText("2.5 M Token", { exact: true })).toHaveCount(
      2,
    )
    await expect(details).toContainText("XNO")
    await captureVisualViews({
      page,
      ready: details,
      captureTarget: details,
      id: `mixed-overview-details-${width}`,
      extensionDir,
    })
    await page.keyboard.press("Escape")
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false)
  }
  for (const [entry, width, captureId] of [
    [POPUP_PAGE_PATH, 320, "popup-filtered-summary"],
    [SIDEPANEL_PAGE_PATH, 390, "sidepanel-filtered-summary"],
    ["options.html#account", 320, "filtered-summary"],
    ["options.html#account", 390, "filtered-summary"],
    ["options.html#account", 1440, "filtered-summary"],
  ] as const) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`chrome-extension://${extensionId}/${entry}`)
    await waitForExtensionRoot(page)
    const search = page.getByRole("textbox", {
      name: "Enter site information or account information to search",
    })
    await search.fill("Dev Balance:")
    const summary = page.getByRole("region", {
      name: "40 accounts",
      exact: true,
    })
    await expect(summary).toBeVisible()
    expect(
      await summary.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
      "Filtered summary stays within the account panel",
    ).toBe(true)
    await expect(summary.getByRole("combobox")).toHaveCount(0)
    await expect(summary).toContainText("¥2,853.94")
    await captureVisualViews({
      page,
      ready: summary,
      captureTarget: summary,
      id: `${captureId}-closed-${width}`,
      extensionDir,
      views: [{ id: "light", width, height: 900, theme: "light" }],
    })
    await summary.getByRole("button", { name: "Details", exact: true }).click()
    const totals = page.getByRole("dialog", {
      name: "Filtered subtotals",
      exact: true,
    })
    const amount = totals.getByText("¥2,853.94", { exact: true })
    await expect(amount).toBeVisible()
    expect(
      await amount.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
      "The filtered subtotal amount remains readable at narrow widths",
    ).toBe(true)
    await captureVisualViews({
      page,
      ready: totals,
      captureTarget: totals,
      id: `${captureId}-${width}`,
      extensionDir,
      views: [
        { id: "light", width, height: 900, theme: "light" },
        { id: "dark", width, height: 900, theme: "dark" },
      ],
    })
    await search.fill("Dev Balance: novita")
    const singleSummary = page.getByRole("region", {
      name: "1 account",
      exact: true,
    })
    await singleSummary
      .getByRole("button", { name: "Details", exact: true })
      .click()
    await expect(totals.getByRole("combobox")).toHaveCount(0)
    await expect(totals.getByText("¥88.56", { exact: true })).toBeVisible()
    await expect(totals).toContainText("Included 1 of 1 accounts")
    if (entry.startsWith("options") && width !== 390) {
      await captureVisualViews({
        page,
        ready: totals,
        captureTarget: totals,
        id: `filtered-single-${width}`,
        extensionDir,
        views: [
          { id: "light", width, height: 900, theme: "light" },
          { id: "dark", width, height: 900, theme: "dark" },
        ],
      })
    }
    await expect(totals.getByText("¥88.56", { exact: true })).toBeVisible()
    await totals
      .getByRole("button", { name: "Balance details", exact: true })
      .click()
    await expect(
      page.getByRole("dialog", { name: "Balance details", exact: true }),
    ).toContainText("USD 12.3")
    await page.keyboard.press("Escape")
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false)
  }
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
  await waitForExtensionRoot(page)
  await page.getByRole("button", { name: "Dev: Open dev panel" }).click()
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
  const row = (label: string) => {
    const account = fixtures.find(
      (a) => a.site_name === `Dev Balance: ${label}`,
    )
    if (!account) throw new Error(`Missing scenario ${label}`)
    return page.getByTestId(getAccountManagementListItemTestId(account.id))
  }
  await panel
    .getByRole("button", { name: "Dev: View account list", exact: true })
    .click()
  await waitForExtensionRoot(page)
  await expect(panel).not.toBeVisible()
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
  // Hovering financial text must not paint a second block or move its aligned edge.
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((value) => {
      document.documentElement.classList.toggle("dark", value === "dark")
    }, theme)
    const wallet = row("USD wallet")
    await wallet.scrollIntoViewIfNeeded()
    for (const button of [
      wallet.getByRole("button").filter({ has: page.getByRole("group") }),
      wallet.getByRole("button", { name: /Click to refresh today's income/ }),
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
  await page.evaluate(() => document.documentElement.classList.remove("dark"))
  // Amounts and supplemental cashflow share the same value edge.
  const accountSearch = page.getByRole("textbox", {
    name: "Enter site information or account information to search",
  })
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1100 })
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
  }
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
  await page.reload()
  await waitForExtensionRoot(page)
  await accountSearch.fill("Dev Balance: Multiple assets")
  await expect(row("Multiple assets")).toContainText("GBP")
  await accountSearch.clear()
  await page.getByRole("button", { name: "Dev: Open dev panel" }).click()
  await panel
    .getByRole("button", { name: "Dev: Clear fixture accounts (9)" })
    .click()
  await expect(
    panel.getByRole("button", { name: "Dev: Clear fixture accounts (0)" }),
  ).toBeDisabled()
  await panel
    .getByRole("button", { name: "Dev: View account list", exact: true })
    .click()
  await waitForExtensionRoot(page)
  const final = await getPlasmoStorageJsonValue<AccountStorageConfig>(
    worker,
    STORAGE_KEYS.ACCOUNTS,
  )
  if (!final) throw new Error("Missing saved accounts after cleanup")
  expect(final.accounts.map((account) => account.id)).toEqual(["keep-real"])
  await expect(
    page.getByTestId(getAccountManagementListItemTestId("keep-real")),
  ).toBeVisible()
  await expect(
    page.getByText("Dev Balance: USD wallet", { exact: true }),
  ).toHaveCount(0)
})

for (const phase of [
  "native units and periods",
  "currency switching",
] as const) {
  test(`dev site balance scenarios cover every account type with ${phase}`, async ({
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
      panel.getByRole("button", { name: "Dev: Clear fixture accounts (40)" }),
    ).toBeEnabled()
    const config = await getPlasmoStorageJsonValue<AccountStorageConfig>(
      worker,
      STORAGE_KEYS.ACCOUNTS,
    )
    if (!config) throw new Error("Missing native scenarios")
    if (process.env.AAH_BALANCE_FIXTURE_EVIDENCE_DIR) {
      const directory = process.env.AAH_BALANCE_FIXTURE_EVIDENCE_DIR
      await mkdir(directory, { recursive: true })
      await writeFile(
        path.join(
          directory,
          phase === "native units and periods"
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
    const show = async (type: string) => {
      await page
        .getByRole("textbox", {
          name: "Enter site information or account information to search",
        })
        .fill(`Dev Balance: ${type}`)
      await expect(row(type)).toBeVisible()
      return row(type)
    }
    if (phase === "native units and periods") {
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
        {
          await visibleRow
            .getByRole("button", { name: "Balance details", exact: true })
            .click()
          const details = page.getByRole("dialog", {
            name: "Balance details",
            exact: true,
          })
          await expect(details).toBeVisible()
          expect(await details.innerText()).not.toMatch(
            /Credit type unverified|Funding source unverified|Usage scope unverified|Validity unverified|@standard-usd/,
          )
          for (const text of detailTexts[account.site_type] ?? [])
            await expect(details).toContainText(text)
          if (detailTexts[account.site_type])
            await captureVisualViews({
              page,
              ready: details,
              captureTarget: details,
              id: `all-native-${account.site_type.toLowerCase()}-details`,
              extensionDir,
              views: [
                { id: "light", width: 1440, height: 1000, theme: "light" },
              ],
            })
          if (account.site_type === SITE_TYPES.NEW_API) {
            const technical = details.getByText("Technical details (debug)", {
              exact: true,
            })
            await technical.click()
            await expect(
              details.getByText(
                /new-api\/dev-fixture\/balance@standard-usd\/v1/,
              ),
            ).toBeVisible()
            await captureVisualViews({
              page,
              ready: details.getByText(
                /new-api\/dev-fixture\/balance@standard-usd\/v1/,
              ),
              captureTarget: details,
              id: "new-api-debug-details",
              extensionDir,
            })
            await technical.click()
          }
          if (account.site_type === SITE_TYPES.FOXCODE) {
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
          await details
            .getByRole("button", { name: "Close", exact: true })
            .click()
          // A newly filtered row can appear beneath the old cursor and open its hover preview.
          await page.mouse.move(0, 0)
          await page
            .getByRole("textbox", {
              name: "Enter site information or account information to search",
            })
            .focus()
          await expect(details).not.toBeVisible()
        }
      }
      for (const [type, texts] of [
        [SITE_TYPES.NEW_API, ["$10.00"]],
        [SITE_TYPES.SUB2API, ["$12.34"]],
        [
          SITE_TYPES.RELAYFOR,
          ["$1.88", "$3.76", "Permanent credit", "Timed credit"],
        ],
        [SITE_TYPES.CUBENCE, ["Normal balance", "Charity balance"]],
        [SITE_TYPES.VO_API_V2, ["Bound balance"]],
        [SITE_TYPES.KIMI, ["¥8.00"]],
        [SITE_TYPES.DAHL, ["2.5 M Token"]],
        [SITE_TYPES.EMRANK, ["2.5 M Token"]],
        [SITE_TYPES.FREEMODEL, ["$17.34"]],
        [SITE_TYPES.NANOGPT, ["1.25 XNO"]],
      ] as const) {
        const visibleRow = await show(type)
        for (const text of texts) await expect(visibleRow).toContainText(text)
      }
      await show(SITE_TYPES.FREEMODEL)
      await row(SITE_TYPES.FREEMODEL)
        .getByRole("button", { name: "Balance details", exact: true })
        .click()
      await expect(
        page.getByRole("dialog", { name: "Balance details", exact: true }),
      ).toContainText("Weekly")
      await page.keyboard.press("Escape")
      await show(SITE_TYPES.NANOGPT)
      await row(SITE_TYPES.NANOGPT)
        .getByRole("button", { name: "Balance details", exact: true })
        .click()
      const details = page.getByRole("dialog", {
        name: "Balance details",
        exact: true,
      })
      await expect(details).toContainText("Daily")
      await expect(details).toContainText("Weekly")
      await expect(details).toContainText("Image")
      await captureVisualViews({
        page,
        ready: details,
        captureTarget: details,
        id: "native-nanogpt-details",
        extensionDir,
      })
      await details
        .getByText("8 Image", { exact: true })
        .scrollIntoViewIfNeeded()
      await expect(details.getByText("8 Image", { exact: true })).toBeVisible()
      await captureVisualViews({
        page,
        ready: details,
        captureTarget: details,
        id: "native-nanogpt-images",
        extensionDir,
      })
      await page.keyboard.press("Escape")
      for (const [type, texts] of [
        [
          SITE_TYPES.DAHL,
          ["Token pool", "Tokens on keys", "1.5 M Token", "1 M Token"],
        ],
        [SITE_TYPES.NOVITA, ["Pending charges", "Debt", "3.7"]],
      ] as const) {
        await show(type)
        await row(type)
          .getByRole("button", { name: "Balance details", exact: true })
          .click()
        const nativeDetails = page.getByRole("dialog", {
          name: "Balance details",
          exact: true,
        })
        for (const text of texts)
          await expect(nativeDetails).toContainText(text)
        await captureVisualViews({
          page,
          ready: nativeDetails,
          captureTarget: nativeDetails,
          id: `native-${type.toLowerCase()}-details`,
          extensionDir,
        })
        if (type === SITE_TYPES.NOVITA) {
          await nativeDetails
            .getByText("Debt", { exact: true })
            .scrollIntoViewIfNeeded()
          await expect(
            nativeDetails.getByText("Debt", { exact: true }),
          ).toBeVisible()
          await captureVisualViews({
            page,
            ready: nativeDetails,
            captureTarget: nativeDetails,
            id: "native-novita-charges-debt",
            extensionDir,
          })
        }
        await page.keyboard.press("Escape")
      }
      for (const type of [
        SITE_TYPES.NEW_API,
        SITE_TYPES.SUB2API,
        SITE_TYPES.RELAYFOR,
        SITE_TYPES.KIMI,
        SITE_TYPES.DAHL,
        SITE_TYPES.CUBENCE,
        SITE_TYPES.FREEMODEL,
      ]) {
        await show(type)
        await captureVisualViews({
          page,
          ready: row(type),
          captureTarget: row(type),
          id: `native-${type.toLowerCase()}`,
          extensionDir,
          views: [
            { id: "light", width: 1440, height: 1000, theme: "light" },
            { id: "dark", width: 390, height: 1000, theme: "dark" },
          ],
        })
      }
    } else {
      await page.goto(
        `chrome-extension://${extensionId}/options.html#${MENU_ITEM_IDS.BASIC}`,
      )
      await waitForExtensionRoot(page)
      await page.getByRole("button", { name: "CNY (¥)" }).click()
      await page.goto(`chrome-extension://${extensionId}/options.html#account`)
      await waitForExtensionRoot(page)
      await expect(await show(SITE_TYPES.NEW_API)).toContainText("¥72.00")
      await expect(await show(SITE_TYPES.SUB2API)).toContainText("¥88.85")
      await expect(await show(SITE_TYPES.KIMI)).toContainText("¥8.00")
      await expect(await show(SITE_TYPES.DAHL)).toContainText("2.5 M Token")
      for (const account of config.accounts) {
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
    await page.goto(`chrome-extension://${extensionId}/options.html#account`)
    await waitForExtensionRoot(page)
    await page.getByRole("button", { name: "Dev: Open dev panel" }).click()
    await panel
      .getByRole("button", { name: "Dev: Clear fixture accounts (40)" })
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
    panel.getByRole("button", { name: "Dev: Clear fixture accounts (121)" }),
  ).toBeEnabled()
  const config = await getPlasmoStorageJsonValue<AccountStorageConfig>(
    worker,
    STORAGE_KEYS.ACCOUNTS,
  )
  if (!config) throw new Error("Missing persisted state scenarios")
  const fixtures = config.accounts.filter((a) => a.id !== "keep-real")
  expect(fixtures).toHaveLength(121)
  await panel
    .getByRole("button", { name: "Dev: View account list", exact: true })
    .click()
  const show = async (name: string) => {
    const account = fixtures.find((a) => a.site_name === `Dev Balance: ${name}`)
    if (!account) throw new Error(`Missing state ${name}`)
    await page
      .getByRole("textbox", {
        name: "Enter site information or account information to search",
      })
      .fill(account.site_name)
    const row = page.getByTestId(getAccountManagementListItemTestId(account.id))
    await expect(row).toBeVisible()
    return row
  }
  for (const type of ACCOUNT_SITE_TYPE_VALUES) {
    const allowanceOnly =
      fixtures.find((a) => a.site_name === `Dev Balance: ${type} · missing`)!
        .account_info.balance!.positions.length === 0
    const zero = await show(`${type} · zero`)
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
    const missing = await show(`${type} · missing`)
    await expect(
      missing.getByRole("button").filter({ has: page.getByRole("group") }),
    ).toContainText(allowanceOnly ? "N/A" : "Unavailable")
    const stale = await show(`${type} · stale`)
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
    .getByRole("button", { name: "Dev: Clear fixture accounts (121)" })
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
