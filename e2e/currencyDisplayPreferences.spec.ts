import {
  OPTIONS_PAGE_PATH,
  POPUP_PAGE_PATH,
  SIDEPANEL_PAGE_PATH,
} from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
import { POPUP_TEST_IDS } from "~/entrypoints/popup/testIds"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import { balancePosition } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  INCOME_CLASSIFICATIONS,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
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
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { buildFinancialPeriodFact } from "~~/tests/test-utils/accountTodayStats"

const ids = ACCOUNT_MANAGEMENT_TEST_IDS

test.beforeEach(async ({ page, context }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    currencyDisplay: "original",
    currencyType: "CNY",
    showTodayCashflow: true,
    refreshOnOpen: false,
    sortingPriorityConfig: { criteria: [], lastModified: Date.now() },
  })
  const monetary = (id: string, currency: "USD" | "CNY", value: string) => {
    const siteUrl = `https://${id}.example`
    const scope = accountBalanceScope({ baseUrl: siteUrl, accountId: id })
    scope.projects =
      scope.keys =
      scope.models =
      scope.groups =
        { kind: SCOPE_SELECTION_KINDS.All }
    const fact = buildFinancialPeriodFact({
      accountId: id,
      value,
      asset: { kind: ASSET_KINDS.Currency, code: currency },
    })
    const { settlement: _settlement, ...income } = fact
    return createStoredAccount({
      id,
      site_name: currency === "CNY" ? "Kimi CN" : "Kimi Global",
      site_type: currency === "CNY" ? SITE_TYPES.KIMI : SITE_TYPES.KIMI_GLOBAL,
      site_url: siteUrl,
      exchange_rate: 7,
      account_info: {
        balance: accountBalanceSnapshot(
          scope,
          [
            balancePosition({
              id: "available",
              scope,
              asset: fact.asset,
              value,
              observedAt: Date.now(),
              source: fact.amount.source,
            }),
          ],
          Date.now(),
          "complete",
        ),
        settledConsumption: [fact],
        reportedIncome: [
          { ...income, classification: INCOME_CLASSIFICATIONS.Grant },
        ],
      },
    })
  }
  const tokenScope = accountBalanceScope({
    baseUrl: "https://token-wallet.example",
    accountId: "tokens",
  })
  tokenScope.projects =
    tokenScope.keys =
    tokenScope.models =
    tokenScope.groups =
      { kind: SCOPE_SELECTION_KINDS.All }
  await seedStoredAccounts(worker, [
    monetary("kimi-cn", "CNY", "7"),
    monetary("kimi-global", "USD", "2"),
    createStoredAccount({
      id: "tokens",
      site_name: "Token wallet",
      site_url: "https://token-wallet.example",
      account_info: {
        balance: accountBalanceSnapshot(
          tokenScope,
          [
            balancePosition({
              id: "available",
              scope: tokenScope,
              asset: {
                kind: ASSET_KINDS.Quota,
                id: "fixture:tokens",
                label: "Token",
                displayScale: 1_000_000,
                displayLabel: "M Token",
              },
              value: "3000000",
              observedAt: Date.now(),
              source: {
                adapter: "fixture",
                operation: "balance",
                contractVersion: "1",
                kind: EVIDENCE_KINDS.Reported,
              },
            }),
          ],
          Date.now(),
          "complete",
        ),
      },
    }),
  ])
})

test("persists three currency display choices from settings and preserves a legacy choice", async ({
  page,
  context,
  extensionId,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  const worker = await getServiceWorker(context)
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#basic`,
  )
  await waitForExtensionRoot(page)
  const setting = page.locator("#display-currency-unit")
  await expect(setting).toBeVisible()
  await setting.screenshot({
    path: testInfo.outputPath("currency-settings.png"),
    animations: "disabled",
  })
  await page.locator("#general-display").screenshot({
    path: testInfo.outputPath("display-settings-panel.png"),
    animations: "disabled",
  })
  const original = setting.getByRole("button", {
    name: "Original currency",
    exact: true,
  })
  await expect(original).toHaveAttribute("aria-pressed", "true")
  for (const { mode, label } of [
    { mode: "USD", label: "USD ($)" },
    { mode: "CNY", label: "CNY (¥)" },
    { mode: "original", label: "Original currency" },
  ]) {
    await setting.getByRole("button", { name: label, exact: true }).click()
    await expect(
      setting.getByRole("button", { name: label, exact: true }),
    ).toHaveAttribute("aria-pressed", "true")
    await expect
      .poll(
        async () =>
          await getPlasmoStorageJsonValue(
            worker,
            STORAGE_KEYS.USER_PREFERENCES,
          ),
      )
      .toMatchObject({
        currencyDisplay: mode,
        currencyType: mode === "original" ? "CNY" : mode,
      })
    await page.reload()
    await waitForExtensionRoot(page)
    await expect(
      setting.getByRole("button", { name: label, exact: true }),
    ).toHaveAttribute("aria-pressed", "true")
  }
  await page.setViewportSize({ width: 320, height: 1000 })
  await expect(original).toBeVisible()
  expect(
    await setting.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true)
  await setting.screenshot({
    path: testInfo.outputPath("currency-settings-narrow.png"),
    animations: "disabled",
  })
  await page.locator("#general-display").screenshot({
    path: testInfo.outputPath("display-settings-panel-narrow.png"),
    animations: "disabled",
  })
  await seedUserPreferences(worker, {
    currencyType: "CNY",
    preferencesVersion: 30,
  })
  await page.reload()
  await waitForExtensionRoot(page)
  await expect(
    setting.getByRole("button", { name: "CNY (¥)", exact: true }),
  ).toHaveAttribute("aria-pressed", "true")
})

for (const { path, width } of [
  { path: OPTIONS_PAGE_PATH, width: 1280 },
  { path: POPUP_PAGE_PATH, width: 380 },
  { path: SIDEPANEL_PAGE_PATH, width: 320 },
]) {
  test(`switches original, dollar and yuan values without changing stored native facts in ${path}`, async ({
    page,
    context,
    extensionId,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    const worker = await getServiceWorker(context)
    await page.goto(
      `chrome-extension://${extensionId}/${path}${path === OPTIONS_PAGE_PATH ? "#account" : ""}`,
    )
    await waitForExtensionRoot(page)
    const assertMode = async (cn: string, global: string) => {
      for (const { id, amount } of [
        { id: "kimi-cn", amount: cn },
        { id: "kimi-global", amount: global },
        { id: "tokens", amount: "3 M Token" },
      ]) {
        const row = page.getByTestId(getAccountManagementListItemTestId(id))
        if ((await row.count()) === 0) {
          if (path === POPUP_PAGE_PATH)
            await page
              .getByTestId(POPUP_TEST_IDS.scrollContainer)
              .evaluate((element) => {
                element.scrollTop = element.scrollHeight
              })
          else
            await page.evaluate(() =>
              window.scrollTo(0, document.body.scrollHeight),
            )
        }
        await expect(row).toBeAttached()
        await row.scrollIntoViewIfNeeded()
        await expect(
          row.getByText(amount, { exact: true }).first(),
        ).toBeVisible()
        if (id !== "tokens") {
          await expect(
            row.getByText(`-${amount}`, { exact: true }).first(),
          ).toBeVisible()
          await expect(
            row.getByText(`+${amount}`, { exact: true }).first(),
          ).toBeVisible()
        }
      }
    }
    await assertMode("¥7.00", "$2.00")
    for (const { target, label, cn, global } of [
      { target: "USD", label: "USD", cn: "$1.00", global: "$2.00" },
      { target: "CNY", label: "CNY", cn: "¥7.00", global: "¥14.00" },
      {
        target: "original",
        label: "Original currency",
        cn: "¥7.00",
        global: "$2.00",
      },
    ]) {
      if (path === OPTIONS_PAGE_PATH) {
        await page.goto(
          `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#basic`,
        )
        await waitForExtensionRoot(page)
        await page
          .locator("#display-currency-unit")
          .getByRole("button", {
            name:
              target === "USD"
                ? "USD ($)"
                : target === "CNY"
                  ? "CNY (¥)"
                  : label,
            exact: true,
          })
          .click()
        await page.goto(
          `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
        )
        await waitForExtensionRoot(page)
      } else {
        await page
          .getByRole("button", {
            // The accessible name prefixes the current amount before the action.
            name: new RegExp(`Display Currency · ${label}$`),
          })
          .click()
      }
      await assertMode(cn, global)
      await expect
        .poll(
          async () =>
            await getPlasmoStorageJsonValue(
              worker,
              STORAGE_KEYS.USER_PREFERENCES,
            ),
        )
        .toMatchObject({ currencyDisplay: target })
      await page.reload()
      await waitForExtensionRoot(page)
      await assertMode(cn, global)
      await page.mouse.move(0, 0)
      await page.getByTestId(ids.accountListView).screenshot({
        path: testInfo.outputPath(`currency-${target}.png`),
        animations: "disabled",
      })
      if (path !== OPTIONS_PAGE_PATH) {
        const overview = page.getByRole("region", {
          name: "Financial totals",
          exact: true,
        })
        await overview.screenshot({
          path: testInfo.outputPath(`overview-${target}.png`),
          animations: "disabled",
        })
      }
      const detailsId = target === "CNY" ? "kimi-global" : "kimi-cn"
      await page
        .getByTestId(getAccountManagementListItemTestId(detailsId))
        .getByRole("button", { name: "Balance details", exact: true })
        .click()
      const details = page.getByRole("dialog", {
        name: "Balance details",
        exact: true,
      })
      await expect(details).toContainText(target === "CNY" ? "USD 2" : "CNY 7")
      await details.screenshot({
        path: testInfo.outputPath(`native-details-${target}.png`),
        animations: "disabled",
      })
      await page.keyboard.press("Escape")
    }
    const stored = (await getPlasmoStorageJsonValue(
      worker,
      STORAGE_KEYS.ACCOUNTS,
    )) as {
      accounts: {
        id: string
        account_info: {
          balance: {
            positions: {
              asset: { code?: string }
              amount: { value?: string }
            }[]
          }
        }
      }[]
    }
    expect(
      stored.accounts.find((account) => account.id === "kimi-cn")?.account_info
        .balance.positions[0],
    ).toMatchObject({ asset: { code: "CNY" }, amount: { value: "7" } })
    expect(
      stored.accounts.find((account) => account.id === "kimi-global")
        ?.account_info.balance.positions[0],
    ).toMatchObject({ asset: { code: "USD" }, amount: { value: "2" } })
  })
}
