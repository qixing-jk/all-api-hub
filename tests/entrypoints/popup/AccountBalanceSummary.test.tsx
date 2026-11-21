import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { afterEach, describe, expect, it, vi } from "vitest"

import AccountBalanceSummary from "~/features/AccountManagement/components/AccountBalanceSummary"
import { AccountListFilteredSummary } from "~/features/AccountManagement/components/AccountList/AccountListFilteredSummary"
import { buildDevSiteFinancialScenarios } from "~/features/DevPanel/fixtureSiteBalances"
import enAccount from "~/locales/en/account.json"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import { buildNetInflowTotals } from "~/services/accounts/metrics/netInflowTotals"
import { balancePosition, observeAmount } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  BALANCE_NATURES,
  BALANCE_VALIDITY_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SETTLEMENT_STATUSES,
  FINANCIAL_SUBJECT_KINDS,
  INCOME_CLASSIFICATIONS,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import {
  calculateTotalConsumption,
  calculateTotalIncomeForSites,
} from "~/utils/core/formatters"
import {
  buildFinancialIncomeFact,
  buildFinancialPeriodFact,
} from "~~/tests/test-utils/accountTodayStats"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { createResourceTestI18n, testI18n } from "~~/tests/test-utils/i18n"
import {
  buildNetInflow,
  buildNetInflowItem,
} from "~~/tests/test-utils/netInflow"
import { act, render, screen, within } from "~~/tests/test-utils/render"

// Hoisted fixtures load dependency-free runtime values before component imports.
const { CURRENCIES, CURRENCY_DISPLAY_MODES } = await vi.hoisted(
  () => import("~/constants/money"),
)

const { context, netEnabled, displayCurrency, updateCurrencyType } = vi.hoisted(
  () => ({
    context: vi.fn(),
    netEnabled: { value: false },
    displayCurrency: {
      value: CURRENCIES.USD as "USD" | "CNY",
      mode: undefined as "USD" | "CNY" | "original" | undefined,
    },
    updateCurrencyType: vi.fn(),
  }),
)
vi.mock("~/features/AccountManagement/data/AccountDataContext", () => ({
  useAccountDataContext: () => context(),
}))
vi.mock("~/contexts/UserPreferencesContext", () => ({
  UserPreferencesProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useUserPreferencesContext: () => ({
    currencyType: displayCurrency.value,
    currencyDisplay: displayCurrency.mode ?? displayCurrency.value,
    showTodayCashflow: netEnabled.value,
    preferences: {
      balanceHistory: { estimatedTodayIncome: { enabled: netEnabled.value } },
    },
    updateCurrencyType,
    updateCurrencyDisplay: updateCurrencyType,
  }),
}))

describe("AccountBalanceSummary", () => {
  it.each([
    [CURRENCIES.USD, /USD\s2\.00/, /USD\s4\.00/],
    [CURRENCIES.CNY, /CNY\s21\.00/, /CNY\s42\.00/],
  ] as const)(
    "shows one complete %s cashflow total across native currencies and keeps original groups",
    async (mode, cost, received) => {
      displayCurrency.mode = mode
      netEnabled.value = true
      const sites = ([CURRENCIES.USD, CURRENCIES.CNY] as const).map((code) =>
        buildDisplaySiteData({
          id: code,
          exchangeRate: code === CURRENCIES.USD ? 7 : 14,
          settledConsumption: [
            buildFinancialPeriodFact({
              accountId: code,
              value: code === CURRENCIES.USD ? "1" : "14",
              asset: { kind: ASSET_KINDS.Currency, code },
            }),
          ],
          reportedIncome: [
            buildFinancialIncomeFact({
              accountId: code,
              value: code === CURRENCIES.USD ? "2" : "28",
              asset: { kind: ASSET_KINDS.Currency, code },
            }),
          ],
        }),
      )
      context.mockReturnValue({ displayData: sites })
      const i18n = await createResourceTestI18n({ en: { account: enAccount } })
      const { rerender } = render(
        <I18nextProvider i18n={i18n}>
          <AccountBalanceSummary />
        </I18nextProvider>,
      )
      const consumption = screen.getByRole("region", {
        name: enAccount.stats.todayConsumption,
      })
      const income = screen.getByRole("region", {
        name: enAccount.filteredTotals.income,
      })
      expect(
        within(consumption).getAllByText(cost, { exact: true }),
      ).toHaveLength(1)
      expect(
        within(income).getAllByText(received, { exact: true }),
      ).toHaveLength(1)
      expect(consumption).not.toHaveTextContent(
        enAccount.todayMetricAvailability.partial,
      )
      expect(income).not.toHaveTextContent(
        enAccount.todayMetricAvailability.partial,
      )
      displayCurrency.mode = CURRENCY_DISPLAY_MODES.Original
      rerender(
        <I18nextProvider i18n={i18n}>
          <AccountBalanceSummary />
        </I18nextProvider>,
      )
      expect(within(consumption).getByText(/USD\s1\.00/)).toBeVisible()
      expect(within(consumption).getByText(/CNY\s14\.00/)).toBeVisible()
      expect(within(income).getByText(/USD\s2\.00/)).toBeVisible()
      expect(within(income).getByText(/CNY\s28\.00/)).toBeVisible()
    },
  )
  it.each([CURRENCY_DISPLAY_MODES.Original, CURRENCIES.USD] as const)(
    "keeps the inline %s single-asset or combined-fiat subtotal free of redundant disclosure",
    async (mode) => {
      displayCurrency.mode = mode
      const now = Date.now()
      const scope = accountBalanceScope({
        baseUrl: "https://simple-filtered.example",
      })
      const source = {
        adapter: "fixture",
        operation: "balances",
        contractVersion: "1",
        kind: EVIDENCE_KINDS.Reported,
      } as const
      const positions = [
        balancePosition({
          id: "usd",
          scope,
          source,
          observedAt: now,
          value: "2",
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        }),
      ]
      if (mode === CURRENCIES.USD)
        positions.push(
          balancePosition({
            id: "cny",
            scope,
            source,
            observedAt: now,
            value: "7",
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
          }),
        )
      const sites = [
        buildDisplaySiteData({
          exchangeRate: 7,
          balanceSnapshot: accountBalanceSnapshot(
            scope,
            positions,
            now,
            FINANCIAL_COVERAGE.Complete,
          ),
        }),
      ]
      const i18n = await createResourceTestI18n({ en: { account: enAccount } })
      render(
        <I18nextProvider i18n={i18n}>
          <AccountListFilteredSummary
            sites={sites}
            consumption={calculateTotalConsumption([])}
            income={calculateTotalIncomeForSites([])}
            showTodayCashflow
          />
        </I18nextProvider>,
      )
      const balance = screen.getByRole("group", { name: "Balance" })
      expect(
        within(balance).getByText(mode === "original" ? "$2.00" : "$3.00", {
          exact: true,
        }),
      ).toBeVisible()
      expect(
        within(balance).queryByRole("button", { name: "Balance details" }),
      ).not.toBeInTheDocument()
      expect(within(balance).queryByText(/Assets/)).not.toBeInTheDocument()
    },
  )

  it.each([
    [CURRENCY_DISPLAY_MODES.Original, "$2.00"],
    [CURRENCIES.USD, "$3.00"],
    [CURRENCIES.CNY, "¥21.00"],
  ] as const)(
    "keeps extra native assets discoverable in the inline %s filtered subtotal",
    async (mode, primary) => {
      displayCurrency.mode = mode
      const now = Date.now()
      const scope = accountBalanceScope({
        baseUrl: "https://filtered-assets.example",
      })
      const source = {
        adapter: "fixture",
        operation: "balances",
        contractVersion: "1",
        kind: EVIDENCE_KINDS.Reported,
      } as const
      const positions = [
        balancePosition({
          id: "usd",
          scope,
          source,
          observedAt: now,
          value: "2",
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        }),
        balancePosition({
          id: "cny",
          scope,
          source,
          observedAt: now,
          value: "7",
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
        }),
        balancePosition({
          id: "tokens",
          scope,
          source,
          observedAt: now,
          value: "3000000",
          asset: {
            kind: ASSET_KINDS.Quota,
            id: "fixture:tokens",
            label: "Token",
            displayScale: 1000000,
            displayLabel: "M Token",
          },
        }),
      ]
      const sites = [
        buildDisplaySiteData({
          exchangeRate: 7,
          balanceSnapshot: accountBalanceSnapshot(
            scope,
            positions,
            now,
            FINANCIAL_COVERAGE.Complete,
          ),
        }),
      ]
      const i18n = await createResourceTestI18n({ en: { account: enAccount } })
      const user = userEvent.setup()
      render(
        <I18nextProvider i18n={i18n}>
          <AccountListFilteredSummary
            sites={sites}
            consumption={calculateTotalConsumption([])}
            income={calculateTotalIncomeForSites([])}
            showTodayCashflow
          />
        </I18nextProvider>,
      )
      const balance = screen.getByRole("group", { name: "Balance" })
      expect(within(balance).getByText(primary, { exact: true })).toBeVisible()
      const nativeDetails = within(balance).getByRole("button", {
        name: "Balance details",
      })
      expect(nativeDetails).toHaveTextContent("Assets · 3")
      await user.click(nativeDetails)
      const details = await screen.findByRole("dialog", {
        name: "Balance details",
      })
      expect(details).toHaveTextContent("USD 2")
      expect(details).toHaveTextContent("CNY 7")
      expect(details).toHaveTextContent("3 M Token")
      await user.keyboard("{Escape}")
      await user.tab({ shift: true })
      await user.tab()
      expect(nativeDetails).toHaveFocus()
      expect(
        await screen.findByRole("dialog", { name: "Balance details" }),
      ).toHaveTextContent("3 M Token")
    },
  )

  it.each([
    [CURRENCY_DISPLAY_MODES.Original, "$2.00"],
    [CURRENCIES.USD, "$3.00"],
    [CURRENCIES.CNY, "¥21.00"],
  ] as const)(
    "makes hidden native assets discoverable in %s mode by click and keyboard",
    async (mode, primary) => {
      displayCurrency.mode = mode
      const now = Date.now()
      const scope = accountBalanceScope({
        baseUrl: "https://native-assets.example",
      })
      const source = {
        adapter: "fixture",
        operation: "balances",
        contractVersion: "1",
        kind: EVIDENCE_KINDS.Reported,
      } as const
      const positions = [
        balancePosition({
          id: "usd",
          scope,
          source,
          observedAt: now,
          value: "2",
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        }),
        balancePosition({
          id: "cny",
          scope,
          source,
          observedAt: now,
          value: "7",
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
        }),
        balancePosition({
          id: "tokens",
          scope,
          source,
          observedAt: now,
          value: "3000000",
          asset: {
            kind: ASSET_KINDS.Quota,
            id: "fixture:tokens",
            label: "Token",
            displayScale: 1000000,
            displayLabel: "M Token",
          },
        }),
      ]
      context.mockReturnValue({
        displayData: [
          buildDisplaySiteData({
            exchangeRate: 7,
            balanceSnapshot: accountBalanceSnapshot(
              scope,
              positions,
              now,
              FINANCIAL_COVERAGE.Complete,
            ),
          }),
        ],
      })
      const i18n = await createResourceTestI18n({ en: { account: enAccount } })
      const user = userEvent.setup()
      render(
        <I18nextProvider i18n={i18n}>
          <AccountBalanceSummary />
        </I18nextProvider>,
      )
      const overview = screen.getByRole("region", { name: "Financial totals" })
      expect(within(overview).getByText(primary, { exact: true })).toBeVisible()
      expect(within(overview).queryByText("3 M Token")).not.toBeInTheDocument()
      const assetHint = within(overview).getByRole("button", {
        name: "Balance details",
      })
      expect(assetHint).toBeVisible()
      expect(assetHint).toHaveTextContent("Assets · 3")
      await user.click(assetHint)
      const hint = await screen.findByRole("dialog", {
        name: "Balance details",
      })
      expect(hint).toHaveTextContent("USD 2")
      expect(hint).toHaveTextContent("CNY 7")
      expect(hint).toHaveTextContent("3 M Token")
      await user.keyboard("{Escape}")
      await user.tab({ shift: true })
      await user.tab()
      expect(assetHint).toHaveFocus()
      expect(
        await screen.findByRole("dialog", { name: "Balance details" }),
      ).toHaveTextContent("3 M Token")
      await user.keyboard("{Escape}")
      await user.click(
        within(overview).getByRole("button", { name: "Financial totals" }),
      )
      const details = screen.getByRole("dialog", { name: "Financial totals" })
      const balance = within(details).getByRole("group", { name: "Balance" })
      await user.click(
        within(balance).getByRole("button", { name: "Assets · 3" }),
      )
      expect(
        within(balance).getByText("3 M Token", { exact: true }),
      ).toBeVisible()
    },
  )

  it("keeps a single native asset overview free of an additional-assets hint", async () => {
    displayCurrency.mode = CURRENCY_DISPLAY_MODES.Original
    const example = buildDevSiteFinancialScenarios(Date.now()).find(
      (item) => item.siteType === "novita",
    )!
    context.mockReturnValue({
      displayData: [buildDisplaySiteData({ balanceSnapshot: example.balance })],
    })
    const i18n = await createResourceTestI18n({ en: { account: enAccount } })
    render(
      <I18nextProvider i18n={i18n}>
        <AccountBalanceSummary />
      </I18nextProvider>,
    )
    const overview = screen.getByRole("region", { name: "Financial totals" })
    expect(within(overview).getByText("$12.30", { exact: true })).toBeVisible()
    expect(
      within(overview).queryByRole("button", { name: "Balance details" }),
    ).not.toBeInTheDocument()
    expect(within(overview).queryByText(/Assets/)).not.toBeInTheDocument()
  })

  it("keeps the combined fiat-only overview without an extra-assets hint", async () => {
    displayCurrency.mode = CURRENCIES.USD
    const now = Date.now()
    const scope = accountBalanceScope({ baseUrl: "https://fiat-only.example" })
    const source = {
      adapter: "fixture",
      operation: "balances",
      contractVersion: "1",
      kind: EVIDENCE_KINDS.Reported,
    } as const
    const positions = [
      balancePosition({
        id: "usd",
        scope,
        source,
        observedAt: now,
        value: "2",
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
      }),
      balancePosition({
        id: "cny",
        scope,
        source,
        observedAt: now,
        value: "7",
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
      }),
    ]
    context.mockReturnValue({
      displayData: [
        buildDisplaySiteData({
          exchangeRate: 7,
          balanceSnapshot: accountBalanceSnapshot(
            scope,
            positions,
            now,
            FINANCIAL_COVERAGE.Complete,
          ),
        }),
      ],
    })
    const i18n = await createResourceTestI18n({ en: { account: enAccount } })
    render(
      <I18nextProvider i18n={i18n}>
        <AccountBalanceSummary />
      </I18nextProvider>,
    )
    const overview = screen.getByRole("region", { name: "Financial totals" })
    expect(within(overview).getByText("$3.00", { exact: true })).toBeVisible()
    expect(
      within(overview).queryByRole("button", { name: "Balance details" }),
    ).not.toBeInTheDocument()
    expect(within(overview).queryByText(/Assets/)).not.toBeInTheDocument()
  })

  it("shows the original overview currency when a different reference currency was remembered", () => {
    displayCurrency.value = CURRENCIES.CNY
    displayCurrency.mode = CURRENCY_DISPLAY_MODES.Original
    const example = buildDevSiteFinancialScenarios(Date.now()).find(
      (item) => item.siteType === "novita",
    )!
    context.mockReturnValue({
      displayData: [
        buildDisplaySiteData({
          id: "novita",
          exchangeRate: 6.5,
          balanceSnapshot: example.balance,
        }),
      ],
    })
    render(<AccountBalanceSummary />)
    expect(screen.getByText("$12.30", { exact: true })).toBeVisible()
    displayCurrency.mode = undefined
  })
  it("uses the configured rate and allows switching currency from the balance", async () => {
    displayCurrency.value = CURRENCIES.CNY
    const example = buildDevSiteFinancialScenarios(Date.now()).find(
      (item) => item.siteType === "novita",
    )!
    const site = buildDisplaySiteData({
      id: "novita",
      exchangeRate: 6.5,
      balanceSnapshot: example.balance,
    })
    context.mockReturnValue({ displayData: [site] })
    render(<AccountBalanceSummary />)
    expect(screen.getByText("¥79.95")).toBeVisible()
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /currency.clickToSwitch/ }))
    expect(updateCurrencyType).toHaveBeenCalledWith("USD")
  })
  it("explains which accounts were omitted from each total inside the overview details", async () => {
    netEnabled.value = true
    const example = buildDevSiteFinancialScenarios(Date.now()).find(
      (item) => item.siteType === "novita",
    )!
    const sites = [
      buildDisplaySiteData({ id: "known", balanceSnapshot: example.balance }),
      buildDisplaySiteData({ id: "unknown", name: "Unknown wallet" }),
      buildDisplaySiteData({
        id: "excluded",
        name: "Personal wallet",
        excludeFromTotalBalance: true,
        excludeFromTodayIncome: true,
      }),
    ]
    context.mockReturnValue({ displayData: sites })
    const user = userEvent.setup()
    render(<AccountBalanceSummary />)
    const overview = screen.getByRole("region", {
      name: testI18n.t("account:financial.summary"),
    })
    const coverage = testI18n.t("account:financial.coverage", {
      included: 1,
      eligible: 2,
    })
    expect(
      within(overview).queryByText(coverage, { exact: false }),
    ).not.toBeInTheDocument()
    expect(within(overview).getByLabelText(new RegExp(coverage))).toBeVisible()
    await user.click(
      within(overview).getByRole("button", {
        name: testI18n.t("account:financial.summary"),
      }),
    )
    const details = screen.getByRole("dialog", {
      name: testI18n.t("account:financial.summary"),
    })
    expect(details).toHaveTextContent(coverage)
    const balance = within(details).getByRole("group", {
      name: testI18n.t("account:financial.availableTotal"),
    })
    const disclosureName = new RegExp(
      testI18n.t("account:financial.exclusions.heading"),
    )
    expect(within(balance).queryByRole("list")).not.toBeInTheDocument()
    await user.click(
      within(balance).getByRole("button", {
        name: disclosureName,
        expanded: false,
      }),
    )
    expect(balance).toHaveTextContent(
      /Unknown wallet.*financial\.exclusions\.noBalance/,
    )
    expect(balance).toHaveTextContent(
      /Personal wallet.*financial\.exclusions\.settings/,
    )
    const income = within(details).getByRole("group", {
      name: testI18n.t("account:filteredTotals.income"),
    })
    const incomeDisclosure = within(income).getByRole("button", {
      name: disclosureName,
      expanded: false,
    })
    incomeDisclosure.focus()
    await user.keyboard("{Enter}")
    expect(incomeDisclosure).toHaveAttribute("aria-expanded", "true")
    expect(income).toHaveTextContent(
      /Personal wallet.*financial\.exclusions\.settings/,
    )
  })
  it("keeps balance, consumption and income visible even before daily amounts are available", async () => {
    netEnabled.value = true
    const example = buildDevSiteFinancialScenarios(Date.now()).find(
      (item) => item.siteType === "novita",
    )!
    const sites = [
      buildDisplaySiteData({
        id: "novita",
        name: "Novita",
        balanceSnapshot: example.balance,
      }),
    ]
    context.mockReturnValue({
      displayData: sites,
      netInflowTotals: buildNetInflowTotals(sites),
    })
    const user = userEvent.setup()
    render(<AccountBalanceSummary />)
    expect(screen.getByText("$12.30")).toBeVisible()
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: testI18n.t("account:financial.prepaidTotal"),
      }),
    ).not.toBeInTheDocument()
    for (const label of [
      "account:stats.todayConsumption",
      "account:filteredTotals.income",
    ]) {
      const metric = screen.getByRole("region", { name: testI18n.t(label) })
      expect(metric).toBeVisible()
      expect(metric).not.toHaveTextContent(/\$0\.00|USD 0/)
    }
    await user.click(
      screen.getByRole("button", {
        name: testI18n.t("account:financial.summary"),
      }),
    )
    const details = screen.getByRole("dialog", {
      name: testI18n.t("account:financial.summary"),
    })
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
    expect(details).not.toHaveTextContent(
      testI18n.t("account:financial.prepaidSubtotal"),
    )
    expect(details).not.toHaveTextContent("$0.00")
    expect(details).toHaveTextContent("$12.30")
  })
  it("keeps one primary balance and reveals separate same-label assets with their site names", async () => {
    displayCurrency.value = CURRENCIES.CNY
    const examples = buildDevSiteFinancialScenarios(Date.now()).filter(
      (example) => ["dahl", "emrank", "aimlapi"].includes(example.siteType),
    )
    const sites = examples.map((example) =>
      buildDisplaySiteData({
        id: example.siteType,
        name: example.siteType,
        balanceSnapshot: example.balance,
      }),
    )
    context.mockReturnValue({
      displayData: sites,
      netInflowTotals: buildNetInflowTotals(sites),
    })
    const user = userEvent.setup()
    const view = render(<AccountBalanceSummary />)
    expect(
      screen.getByText(testI18n.t("account:financial.convertedToCny")),
    ).toBeVisible()
    expect(screen.queryAllByText(/M Token/)).toHaveLength(0)
    await user.click(
      screen.getByRole("button", {
        name: testI18n.t("account:financial.summary"),
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: testI18n.t("account:financial.assetCount"),
      }),
    )
    const details = screen.getByRole("group", {
      name: testI18n.t("account:financial.details"),
    })
    expect(details).toHaveTextContent("dahl")
    expect(details).toHaveTextContent("emrank")
    expect(details).toHaveTextContent("USD")
    expect(screen.getAllByText("2.5 M Token")).toHaveLength(2)
    await user.keyboard("{Escape}")
    displayCurrency.value = CURRENCIES.USD
    displayCurrency.mode = undefined
    view.rerender(<AccountBalanceSummary />)
    expect(
      screen.queryByText(testI18n.t("account:financial.convertedToCny")),
    ).not.toBeInTheDocument()
    expect(screen.getByText("USD")).toBeVisible()
  })
  it("labels quota totals only with accepted live sources after expiry and wallet deduplication", async () => {
    const now = Date.now()
    const source = {
      adapter: "fixture",
      operation: "balance",
      contractVersion: "1",
      kind: EVIDENCE_KINDS.Reported,
    }
    const site = (
      id: string,
      value: string,
      observedAt: number,
      walletId: string,
      expired = false,
    ) => {
      const scope = {
        ...accountBalanceScope(
          { baseUrl: "https://quota.example", accountId: id },
          { walletId },
        ),
        projects: { kind: SCOPE_SELECTION_KINDS.All },
        keys: { kind: SCOPE_SELECTION_KINDS.All },
        groups: { kind: SCOPE_SELECTION_KINDS.All },
        models: { kind: SCOPE_SELECTION_KINDS.All },
      }
      const position = balancePosition({
        id: "available",
        scope,
        source,
        value,
        observedAt,
        asset: {
          kind: ASSET_KINDS.Quota,
          id: "provider:credits",
          label: "Credits",
          displayScale: 1,
          displayLabel: "Credits",
        },
        nature: BALANCE_NATURES.Prepaid,
        validity: expired
          ? { kind: BALANCE_VALIDITY_KINDS.Expires, at: now - 1 }
          : { kind: BALANCE_VALIDITY_KINDS.NoExpiry },
      })
      return buildDisplaySiteData({
        id,
        name: id,
        balanceSnapshot: accountBalanceSnapshot(
          scope,
          [position],
          observedAt,
          FINANCIAL_COVERAGE.Complete,
        ),
      })
    }
    const sites = [
      buildDisplaySiteData({ id: "missing", name: "Missing source" }),
      site("Old source", "10", now - 3, "same-wallet"),
      site("Live source", "20", now - 2, "same-wallet"),
      site("Expired source", "30", now - 2, "expired-wallet", true),
    ]
    context.mockReturnValue({
      displayData: sites,
      netInflowTotals: buildNetInflowTotals(sites),
    })
    const user = userEvent.setup()
    render(<AccountBalanceSummary />)
    expect(screen.getByText("20 Credits")).toBeVisible()
    await user.click(
      screen.getByRole("button", {
        name: testI18n.t("account:financial.summary"),
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: testI18n.t("account:financial.assetCount"),
      }),
    )
    const details = screen.getByRole("group", {
      name: testI18n.t("account:financial.details"),
    })
    expect(details).toHaveTextContent("Live source")
    expect(details).not.toHaveTextContent("Old source")
    expect(details).not.toHaveTextContent("Expired source")
    expect(details).not.toHaveTextContent("Missing source")
  })
  it("keeps a stable native primary asset when no currency exists and account order changes", () => {
    const sites = buildDevSiteFinancialScenarios(Date.now())
      .filter((example) => ["dahl", "emrank"].includes(example.siteType))
      .map((example) =>
        buildDisplaySiteData({
          id: example.siteType,
          name: example.siteType,
          balanceSnapshot: example.balance,
        }),
      )
    context.mockReturnValue({ displayData: [...sites].reverse() })
    const view = render(<AccountBalanceSummary />)
    expect(screen.getByText("dahl")).toBeVisible()
    expect(screen.getByText("2.5 M Token")).toBeVisible()
    context.mockReturnValue({ displayData: sites })
    view.rerender(<AccountBalanceSummary />)
    expect(screen.getByText("dahl")).toBeVisible()
    expect(screen.getByText("2.5 M Token")).toBeVisible()
    expect(screen.queryByText(/USD|CNY/)).not.toBeInTheDocument()
  })
  it.each([
    ["consumption", false],
    ["income", false],
    ["consumption", true],
  ] as const)(
    "keeps native %s compact and reveals its interval on demand (full day: %s)",
    async (metric, fullDay) => {
      displayCurrency.mode = CURRENCY_DISPLAY_MODES.Original
      vi.useFakeTimers({ toFake: ["Date"] })
      const user = userEvent.setup()
      const now = new Date(2026, 10, 11, 12).getTime()
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      vi.setSystemTime(now)
      netEnabled.value = true
      const scope = {
        subject: { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId: "a" },
        authority: "https://usage.example",
        projects: { kind: SCOPE_SELECTION_KINDS.All },
        keys: { kind: SCOPE_SELECTION_KINDS.All },
        models: { kind: SCOPE_SELECTION_KINDS.All },
        groups: { kind: SCOPE_SELECTION_KINDS.All },
      }
      const sites = [
        buildDisplaySiteData({
          id: "a",
          todayConsumption: { USD: 999, CNY: 6993 },
          [metric === "income" ? "reportedIncome" : "settledConsumption"]: [
            {
              asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
              amount: observeAmount(
                "1.000000000000000017",
                {
                  adapter: "fixture",
                  operation: "cost",
                  contractVersion: "1",
                  kind: EVIDENCE_KINDS.Reported,
                },
                now,
              ),
              scope,
              window: {
                start: new Date(2026, 10, 11).getTime(),
                end: fullDay ? new Date(2026, 10, 12).getTime() : now,
                timeZone,
              },
              coverage: fullDay ? "complete" : "partial",
              ...(metric === "income"
                ? { classification: INCOME_CLASSIFICATIONS.Unclassified }
                : { settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled }),
            },
          ],
        }),
      ]
      context.mockReturnValue({
        displayData: sites,
        netInflowTotals: buildNetInflowTotals(sites),
        prevTotalConsumption: { USD: 0, CNY: 0 },
      })
      render(<AccountBalanceSummary />)
      expect(screen.getByText(/CNY\s*1\.00$/)).toBeVisible()
      if (!fullDay)
        expect(
          screen.getByText(
            testI18n.t("account:todayMetricAvailability.partial"),
          ),
        ).toBeVisible()
      expect(
        screen.queryByText(/CNY\s*1\.000000000000000017/),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByText(timeZone, { exact: false }),
      ).not.toBeInTheDocument()
      await user.click(
        screen.getByRole("button", {
          name: testI18n.t("account:financial.summary"),
        }),
      )
      expect(screen.getByText(/CNY\s*1\.000000000000000017/)).toBeVisible()
      const interval = screen.getByRole("button", {
        name: /account:financial\.window/,
      })
      expect(interval).toHaveTextContent(
        testI18n.t(
          fullDay
            ? "account:financial.fullDay"
            : "account:financial.observedThrough",
        ),
      )
      expect(interval).not.toHaveTextContent("00:00")
      expect(interval).not.toHaveTextContent(timeZone)
      await user.click(interval)
      const tooltip = await screen.findByRole("tooltip")
      expect(tooltip).toHaveTextContent(
        fullDay ? /11.*00:00:00.*12.*00:00:00/ : /00:00:00.*12:00:00/,
      )
      expect(tooltip).toHaveTextContent(timeZone)
      expect(screen.queryByText(/999/)).not.toBeInTheDocument()
    },
  )
  afterEach(() => {
    vi.useRealTimers()
    netEnabled.value = false
    displayCurrency.value = CURRENCIES.USD
    displayCurrency.mode = undefined
  })

  it("shows native net inflow separately and moves estimate coverage to details", async () => {
    netEnabled.value = true
    const sites = [
      buildDisplaySiteData({
        id: "known",
        netInflowEstimate: {
          status: "available",
          estimates: [
            buildNetInflowItem(buildNetInflow()),
            buildNetInflowItem({
              ...buildNetInflow(),
              amount: {
                value: "2",
                asset: { kind: ASSET_KINDS.Crypto, id: "XNO" },
              },
            }),
          ],
        },
        todayIncome: { USD: 2, CNY: 14 },
      }),
      buildDisplaySiteData({
        id: "old",
        netInflowEstimate: { status: "legacy", estimates: [] },
        todayIncome: { USD: 0, CNY: 0 },
      }),
    ]
    context.mockReturnValue({
      displayData: sites,
      netInflowTotals: buildNetInflowTotals(sites),
      prevTotalConsumption: { USD: 0, CNY: 0 },
    })
    render(<AccountBalanceSummary />)
    const net = screen.getByRole("region", {
      name: testI18n.t("account:stats.estimatedNetInflow"),
    })
    expect(net).toHaveTextContent(/CNY\s*-5|-[^0-9]*CNY\s*5/)
    expect(net).toHaveTextContent("2 XNO")
    const coverage = testI18n.t("account:netInflow.coverage", {
      included: 1,
      eligible: 2,
    })
    expect(net).not.toHaveTextContent(coverage)
    await userEvent.setup().click(
      screen.getByRole("button", {
        name: testI18n.t("account:financial.summary"),
      }),
    )
    expect(screen.getByRole("dialog")).toHaveTextContent(coverage)
    expect(net).not.toHaveTextContent("$2")
  })

  it.each(["timer", "focus", "visibility"] as const)(
    "removes expired available credit after %s",
    (wake) => {
      displayCurrency.mode = CURRENCY_DISPLAY_MODES.Original
      vi.useFakeTimers()
      const now = Date.UTC(2026, 0, 1, 12)
      vi.setSystemTime(now)
      const scope = accountBalanceScope({
        baseUrl: "https://example.com",
        accountId: "account",
        auth: { authType: "access_token" },
      } as never)
      const position = balancePosition({
        id: "available",
        scope: {
          ...scope,
          projects: { kind: SCOPE_SELECTION_KINDS.All },
          keys: { kind: SCOPE_SELECTION_KINDS.All },
          models: { kind: SCOPE_SELECTION_KINDS.All },
          groups: { kind: SCOPE_SELECTION_KINDS.All },
        },
        source: {
          adapter: "test",
          operation: "wallet",
          contractVersion: "2",
          kind: EVIDENCE_KINDS.Reported,
        },
        observedAt: now,
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
        value: "8",
        nature: BALANCE_NATURES.Subscription,
        validity: { kind: BALANCE_VALIDITY_KINDS.Expires, at: now + 1000 },
      })
      const displayData = [
        buildDisplaySiteData({
          balanceSnapshot: accountBalanceSnapshot(
            scope,
            [position],
            now,
            FINANCIAL_COVERAGE.Complete,
          ),
        }),
      ]
      context.mockReturnValue({
        displayData,
        prevTotalConsumption: { USD: 0, CNY: 0 },
        todayIncomeEstimateTotals: {},
      })
      const { unmount } = render(<AccountBalanceSummary />)
      expect(screen.getByText("¥8.00")).toBeVisible()
      if (wake === "timer") act(() => vi.advanceTimersByTime(1000))
      else {
        vi.setSystemTime(now + 2000)
        act(() =>
          wake === "focus"
            ? window.dispatchEvent(new Event("focus"))
            : document.dispatchEvent(new Event("visibilitychange")),
        )
      }
      expect(screen.queryByText("¥8.00")).not.toBeInTheDocument()
      expect(
        screen.getByText(testI18n.t("account:financial.unavailable")),
      ).toBeVisible()
      unmount()
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it("keeps spendable subscription tokens in native asset details without a purpose selector", async () => {
    displayCurrency.mode = CURRENCY_DISPLAY_MODES.Original
    const scope = accountBalanceScope({
      baseUrl: "https://example.com",
      accountId: "account",
      auth: { authType: "access_token" },
    } as never)
    const source = {
      adapter: "test",
      operation: "wallet",
      contractVersion: "2",
      kind: EVIDENCE_KINDS.Reported,
    } as const
    const positions = [
      balancePosition({
        id: "cash",
        scope,
        source,
        observedAt: 1,
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
        value: "8",
        nature: BALANCE_NATURES.Prepaid,
        validity: { kind: BALANCE_VALIDITY_KINDS.NoExpiry },
      }),
      balancePosition({
        id: "tokens",
        scope,
        source,
        observedAt: 1,
        asset: {
          kind: ASSET_KINDS.Quota,
          id: "provider:tokens",
          label: "Tokens",
          displayScale: 1,
          displayLabel: "Tokens",
        },
        value: "2000",
        nature: BALANCE_NATURES.Subscription,
      }),
    ].map((p) => ({
      ...p,
      scope: {
        ...p.scope,
        projects: { kind: SCOPE_SELECTION_KINDS.All },
        keys: { kind: SCOPE_SELECTION_KINDS.All },
        models: { kind: SCOPE_SELECTION_KINDS.All },
        groups: { kind: SCOPE_SELECTION_KINDS.All },
      },
    }))
    context.mockReturnValue({
      displayData: [
        buildDisplaySiteData({
          balance: { USD: 999, CNY: 6993 },
          balanceSnapshot: accountBalanceSnapshot(
            scope,
            positions,
            1,
            FINANCIAL_COVERAGE.Complete,
          ),
        }),
      ],
      prevTotalConsumption: { USD: 0, CNY: 0 },
      todayIncomeEstimateTotals: {},
    })
    const user = userEvent.setup()
    render(<AccountBalanceSummary />)
    expect(screen.getByText("¥8.00")).toBeVisible()
    await user.click(
      screen.getByRole("button", {
        name: testI18n.t("account:financial.summary"),
      }),
    )
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
    await user.click(
      within(
        screen.getByRole("dialog", {
          name: testI18n.t("account:financial.summary"),
        }),
      ).getByRole("button", {
        name: testI18n.t("account:financial.assetCount"),
      }),
    )
    expect(screen.getByText(/2,000 Tokens/)).toBeVisible()
    await user.keyboard("{Escape}")
    expect(screen.queryByText(/999/)).not.toBeInTheDocument()
  })
})
