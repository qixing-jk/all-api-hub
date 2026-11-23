import {
  DATA_TYPE_BALANCE,
  DATA_TYPE_CONSUMPTION,
  DATA_TYPE_INCOME,
} from "~/constants"
import {
  OPTIONS_PAGE_PATH,
  POPUP_PAGE_PATH,
  SIDEPANEL_PAGE_PATH,
} from "~/constants/extensionPages"
import { QUOTA_PER_USD } from "~/constants/money"
import { POPUP_TEST_IDS } from "~/entrypoints/popup/testIds"
import {
  ACCOUNT_MANAGEMENT_LIST_ITEM_TEST_ID_PREFIX,
  ACCOUNT_MANAGEMENT_TEST_IDS,
} from "~/features/AccountManagement/testIds"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import { balancePosition } from "~/services/amounts/balance"
import {
  EVIDENCE_KINDS,
  INCOME_CLASSIFICATIONS,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { buildFinancialPeriodFact } from "~~/tests/test-utils/accountTodayStats"

for (const { path, width } of [
  { path: OPTIONS_PAGE_PATH, width: 1280 },
  { path: POPUP_PAGE_PATH, width: 380 },
  { path: SIDEPANEL_PAGE_PATH, width: 320 },
]) {
  test(`sorts visible native and last-known financial amounts in ${path}`, async ({
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
    await seedUserPreferences(worker, {
      sortField: "name",
      sortOrder: "asc",
      currencyType: "USD",
      showTodayCashflow: true,
      refreshOnOpen: false,
      sortingPriorityConfig: { criteria: [], lastModified: Date.now() },
    })
    const native = (
      id: string,
      name: string,
      value: string,
      offset: number,
      currency = "USD",
    ) => {
      const siteUrl = `https://${id}.example`
      const scope = accountBalanceScope({ baseUrl: siteUrl, accountId: id })
      scope.models = {
        kind: SCOPE_SELECTION_KINDS.Restricted,
        ids: ["model-a"],
      }
      const fact = buildFinancialPeriodFact({
        accountId: id,
        value,
        asset: { kind: "currency", code: currency },
      })
      fact.window.start += offset
      fact.window.end += offset + 1
      const { settlement: _settlement, ...income } = fact
      return createStoredAccount({
        id,
        site_name: name,
        site_url: siteUrl,
        account_info: {
          balance: accountBalanceSnapshot(
            scope,
            [
              balancePosition({
                id: "available",
                scope,
                value,
                asset: { kind: "currency", code: currency },
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
          settledConsumption: [fact],
          reportedIncome: [
            { ...income, classification: INCOME_CLASSIFICATIONS.Grant },
          ],
        },
      })
    }
    const reference = (id: string, name: string, value: number) =>
      createStoredAccount({
        id,
        site_name: name,
        site_url: `https://${id}.example`,
        account_info: {
          quota: value * QUOTA_PER_USD,
          legacyFinancial: {
            capturedAt: Date.now() - 86_400_000,
            cashflow: {
              consumption: value * QUOTA_PER_USD,
              income: value * QUOTA_PER_USD,
            },
          },
        },
      })
    await seedStoredAccounts(worker, [
      native("native-high", "Alpha high", "42.75", 0),
      native("native-low", "Zulu low", "8", 1, "CNY"),
      native("yuan-zero", "Kimi zero", "0", 0, "CNY"),
      reference("reference-high", "Bravo old high", 5),
      reference("reference-low", "Yankee old low", 2),
    ])
    await page.goto(
      `chrome-extension://${extensionId}/${path}${path === OPTIONS_PAGE_PATH ? "#account" : ""}`,
    )
    await waitForExtensionRoot(page)
    const rows = page.locator(
      `[data-testid^="${ACCOUNT_MANAGEMENT_LIST_ITEM_TEST_ID_PREFIX}"]`,
    )
    await expect(rows.first()).toBeVisible()
    const assertOrder = async (ids: string[]) => {
      const expected = ids.map(
        (id) => `${ACCOUNT_MANAGEMENT_LIST_ITEM_TEST_ID_PREFIX}${id}`,
      )
      if (path === POPUP_PAGE_PATH) {
        const scroller = page.getByTestId(POPUP_TEST_IDS.scrollContainer)
        await scroller.evaluate((element) => {
          element.scrollTop = 0
        })
        await expect(rows.first()).toHaveAttribute("data-testid", expected[0]!)
        const top = await rows.evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("data-testid")),
        )
        expect(top).toEqual(expected.slice(0, top.length))
        await scroller.evaluate((element) => {
          element.scrollTop = element.scrollHeight
        })
        await expect(
          page.getByTestId(expected[expected.length - 1]!),
        ).toBeVisible()
        const bottom = await rows.evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("data-testid")),
        )
        expect(bottom).toEqual(expected.slice(-bottom.length))
        expect([...new Set([...top, ...bottom])]).toEqual(expected)
        await scroller.evaluate((element) => {
          element.scrollTop = 0
        })
        await expect(rows.first()).toHaveAttribute("data-testid", expected[0]!)
        return
      }
      await expect
        .poll(() =>
          rows.evaluateAll((elements) =>
            elements.map((element) => element.getAttribute("data-testid")),
          ),
        )
        .toEqual(
          ids.map(
            (id) => `${ACCOUNT_MANAGEMENT_LIST_ITEM_TEST_ID_PREFIX}${id}`,
          ),
        )
    }
    for (const { field, label } of [
      { field: DATA_TYPE_BALANCE, label: "Balance" },
      { field: DATA_TYPE_CONSUMPTION, label: "Today's Consumption" },
      { field: DATA_TYPE_INCOME, label: "Today's Income" },
    ]) {
      await page
        .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountListSortMenuButton)
        .click()
      await page
        .getByRole("menuitemradio", { name: label, exact: true })
        .click()
      await assertOrder(
        field === DATA_TYPE_BALANCE
          ? [
              "yuan-zero",
              "native-low",
              "reference-low",
              "reference-high",
              "native-high",
            ]
          : [
              "yuan-zero",
              "native-low",
              "native-high",
              "reference-low",
              "reference-high",
            ],
      )
      await page
        .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountListSortDirectionButton)
        .click()
      await assertOrder(
        field === DATA_TYPE_BALANCE
          ? [
              "native-high",
              "reference-high",
              "reference-low",
              "native-low",
              "yuan-zero",
            ]
          : [
              "native-high",
              "native-low",
              "yuan-zero",
              "reference-high",
              "reference-low",
            ],
      )
      if (field === DATA_TYPE_BALANCE) {
        await page
          .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountListView)
          .screenshot({
            path: testInfo.outputPath("mixed-currency-desc.png"),
            animations: "disabled",
          })
      }
    }
    await page.reload()
    await waitForExtensionRoot(page)
    await assertOrder([
      "native-high",
      "native-low",
      "yuan-zero",
      "reference-high",
      "reference-low",
    ])
  })
}
