import {
  POPUP_PAGE_PATH,
  SIDEPANEL_PAGE_PATH,
} from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
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
