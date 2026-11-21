import { act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { expect, it, onTestFinished, vi } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import { FinancialBalanceDisplay } from "~/features/AccountManagement/components/AccountList/rows/FinancialBalanceDisplay"
import { buildDevFinancialScenarios } from "~/features/DevPanel/fixtureFinancialScenarios"
import { buildDevSiteFinancialScenarios } from "~/features/DevPanel/fixtureSiteBalances"
import enAccount from "~/locales/en/account.json"
import enBalanceHistory from "~/locales/en/balanceHistory.json"
import common from "~/locales/en/common.json"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
  readAccountBalance,
} from "~/services/accounts/balanceSnapshot"
import { acceptBalanceRefresh } from "~/services/accounts/refresh/balanceAcceptance"
import {
  balancePosition,
  balanceSnapshotSchema,
  observeAmount,
} from "~/services/amounts/balance"
import { staleBudgetConstraint } from "~/services/amounts/budgets"
import {
  ASSET_KINDS,
  BALANCE_NATURES,
  BALANCE_RELATIONS,
  BALANCE_ROLES,
  BALANCE_VALIDITY_KINDS,
  BUDGET_LIMIT_STATES,
  BUDGET_WINDOW_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_OBSERVATION_REASONS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import {
  KIMI_FINANCIAL_SOURCES,
  parseKimiFinancialData,
} from "~/services/apiService/kimiOpenPlatform/balance"
import { NEW_API_FINANCIAL_CONTRACT_VERSIONS } from "~/services/apiService/newApiFamily/financialContractVersions"
import {
  buildAccountShareSnapshotPayload,
  generateShareSnapshotCaption,
} from "~/services/sharing/shareSnapshots"
import { toggleDevUnlocked } from "~/utils/core/devMode"
import { createResourceTestI18n, testI18n } from "~~/tests/test-utils/i18n"
import { render, screen, within } from "~~/tests/test-utils/render"

it.each([
  [
    FINANCIAL_OBSERVATION_REASONS.LegacySemantics,
    "Saved by an older version; refresh to confirm this balance.",
  ],
  [
    FINANCIAL_OBSERVATION_REASONS.NotRequested,
    "This balance was not requested in the latest refresh. Refresh the account to update it.",
  ],
  [
    FINANCIAL_OBSERVATION_REASONS.IncompleteEnumeration,
    "The latest response did not provide a usable value for this balance. The earlier value is shown.",
  ],
  [
    FINANCIAL_OBSERVATION_REASONS.RefreshUnavailable,
    "The latest response did not provide a usable value for this balance. The earlier value is shown.",
  ],
  [
    FINANCIAL_OBSERVATION_REASONS.RefreshFailed,
    "The balance refresh failed. The earlier value is shown; try refreshing again.",
  ],
  [
    FINANCIAL_OBSERVATION_REASONS.IdentityChanged,
    "Account details changed; this value belongs to the earlier account. Refresh to confirm.",
  ],
])(
  "explains %s and the actual amount time in hover, keyboard and details without changing refresh",
  async (reason, explanation) => {
    const observedAt = Date.parse("2026-11-18T03:55:00Z")
    const scope = accountBalanceScope({ baseUrl: "https://wallet.example" })
    const position = balancePosition({
      id: "wallet",
      scope,
      source: {
        adapter: "fixture",
        operation: "balance",
        contractVersion: "1",
        kind:
          reason === FINANCIAL_OBSERVATION_REASONS.LegacySemantics
            ? EVIDENCE_KINDS.Legacy
            : EVIDENCE_KINDS.Reported,
      },
      observedAt,
      value: "7",
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
    })
    if (position.amount.status !== OBSERVATION_STATUSES.Known)
      throw new Error("The balance fixture must have a known amount")
    position.amount = {
      ...position.amount,
      status: OBSERVATION_STATUSES.Stale,
      reason,
    }
    const i18n = await createResourceTestI18n({
      en: { account: enAccount, balanceHistory: enBalanceHistory, common },
    })
    const refresh = vi.fn()
    const user = userEvent.setup()
    render(
      <I18nextProvider i18n={i18n}>
        <FinancialBalanceDisplay
          snapshot={accountBalanceSnapshot(
            scope,
            [position],
            Date.now(),
            FINANCIAL_COVERAGE.Partial,
          )}
          disabled={false}
          refreshing={false}
          onRefresh={refresh}
        />
      </I18nextProvider>,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    const amount = screen.getByText("$7.00", { exact: true })
    expect(screen.queryByText(explanation)).not.toBeInTheDocument()
    await user.hover(amount)
    const hint = await screen.findByRole("tooltip")
    expect(hint).toHaveTextContent(explanation)
    expect(hint).toHaveTextContent(new Date(observedAt).toLocaleString("en"))
    await user.unhover(amount)
    await user.tab()
    expect(await screen.findByRole("tooltip")).toHaveTextContent(explanation)
    await user.keyboard("{Enter}")
    expect(refresh).toHaveBeenCalledOnce()
    await user.click(
      screen.getByRole("button", { name: enAccount.financial.details }),
    )
    const details = screen.getByRole("dialog")
    expect(within(details).getByText(explanation)).toBeVisible()
    expect(details.querySelector("time")).toHaveAttribute(
      "datetime",
      new Date(observedAt).toISOString(),
    )
  },
)

it("keeps a readable stale balance when its saved observation time is outside the Date range", async () => {
  const scope = accountBalanceScope({ baseUrl: "https://wallet.example" })
  const position = balancePosition({
    id: "wallet",
    scope,
    source: {
      adapter: "fixture",
      operation: "balance",
      contractVersion: "1",
      kind: EVIDENCE_KINDS.Reported,
    },
    observedAt: 1e20,
    value: "7",
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
  })
  if (position.amount.status !== OBSERVATION_STATUSES.Known)
    throw new Error("The balance fixture must have a known amount")
  position.amount = {
    ...position.amount,
    status: OBSERVATION_STATUSES.Stale,
    reason: FINANCIAL_OBSERVATION_REASONS.RefreshFailed,
  }
  const user = userEvent.setup()
  render(
    <FinancialBalanceDisplay
      snapshot={accountBalanceSnapshot(
        scope,
        [position],
        Date.now(),
        FINANCIAL_COVERAGE.Partial,
      )}
      disabled={false}
      refreshing={false}
      onRefresh={() => {}}
    />,
    { withUserPreferencesProvider: false, withThemeProvider: false },
  )
  await user.hover(screen.getByText("$7.00", { exact: true }))
  expect(await screen.findByRole("tooltip")).toHaveTextContent("USD 7")
  expect(screen.getByRole("tooltip").querySelector("time")).toBeNull()
})

it("shows the complete known zero balance in its hover and keyboard hint", async () => {
  const scenario = buildDevSiteFinancialScenarios(Date.now(), "zero").find(
    (entry) => entry.siteType === SITE_TYPES.NEW_API,
  )!
  render(
    <FinancialBalanceDisplay
      snapshot={scenario.balance}
      disabled={false}
      refreshing={false}
      onRefresh={() => {}}
    />,
    { withUserPreferencesProvider: false, withThemeProvider: false },
  )
  const user = userEvent.setup()
  const amount = await screen.findByText("$0.00", { exact: true })
  await user.hover(amount)
  const hint = await screen.findByRole("tooltip")
  expect(hint).toHaveTextContent(testI18n.t("account:financial.exactAmount"))
  expect(hint).toHaveTextContent("USD 0")
  expect(
    screen.getByRole("button", { name: /\$0\.00/ }),
  ).toHaveAccessibleDescription(
    testI18n.t("account:list.balance.refreshBalance"),
  )
  await user.unhover(amount)
  await user.tab()
  expect(await screen.findByRole("tooltip")).toHaveTextContent("USD 0")
})

it.each([
  { value: "0", summary: "$0.00", inactive: false },
  { value: "0.000001", summary: "<$0.01", inactive: true },
])(
  "names the $summary allowance amount and preserves its inactive status",
  async ({ value, summary, inactive }) => {
    const now = Date.now()
    const scenario = buildDevSiteFinancialScenarios(now).find(
      (entry) => entry.siteType === SITE_TYPES.SHAREDCHAT,
    )!
    const allowances = structuredClone(scenario.allowances!)
    const entry = allowances.entries[0]!
    entry.constraint.remaining = {
      ...entry.constraint.remaining,
      status: OBSERVATION_STATUSES.Known,
      observedAt: now,
      value,
    }
    entry.constraint.enabled = {
      ...entry.constraint.enabled,
      status: OBSERVATION_STATUSES.Known,
      observedAt: now,
      value: !inactive,
    }
    const i18n = await createResourceTestI18n({
      en: { account: enAccount, balanceHistory: enBalanceHistory, common },
    })
    render(
      <I18nextProvider i18n={i18n}>
        <FinancialBalanceDisplay
          allowances={{ ...allowances, entries: [entry] }}
          disabled={false}
          refreshing={false}
          onRefresh={() => {}}
        />
      </I18nextProvider>,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    const button = await screen.findByRole("button", {
      name: new RegExp(summary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    })
    if (inactive)
      expect(button).toHaveAccessibleName(
        expect.stringContaining(enAccount.stats.subscriptionState.inactive),
      )
    await userEvent.setup().hover(screen.getByText(summary, { exact: true }))
    if (inactive)
      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        enAccount.stats.subscriptionState.inactive,
      )
  },
)

it("abbreviates a large wallet while preserving its exact value and original refresh action", async () => {
  const scenario = buildDevSiteFinancialScenarios(Date.now()).find(
    (entry) => entry.siteType === SITE_TYPES.NEW_API,
  )!
  const snapshot = structuredClone(scenario.balance)
  snapshot.positions[0]!.amount = {
    ...snapshot.positions[0]!.amount,
    status: OBSERVATION_STATUSES.Known,
    value: "1234567.891",
    observedAt: Date.now(),
  }
  const onRefresh = vi.fn()
  render(
    <FinancialBalanceDisplay
      snapshot={snapshot}
      disabled={false}
      refreshing={false}
      onRefresh={onRefresh}
    />,
    { withUserPreferencesProvider: false, withThemeProvider: false },
  )
  const summary = await screen.findByText("$1.23M", { exact: true })
  const user = userEvent.setup()
  await user.hover(summary)
  const hint = await screen.findByRole("tooltip")
  expect(hint).toHaveTextContent("1,234,567.891")
  expect(hint).toHaveTextContent(testI18n.t("account:financial.exactAmount"))
  await user.unhover(summary)
  await user.tab()
  expect(await screen.findByRole("tooltip")).toHaveTextContent("1,234,567.891")
  await userEvent.setup().click(summary)
  expect(onRefresh).toHaveBeenCalledOnce()
  await userEvent.setup().click(
    screen.getByRole("button", {
      name: testI18n.t("account:financial.details"),
    }),
  )
  expect(screen.getByRole("dialog")).toHaveTextContent("1,234,567.891")
})

it("retains keyboard focus when a refreshed balance stops needing abbreviation", async () => {
  const scenario = buildDevSiteFinancialScenarios(Date.now()).find(
    (entry) => entry.siteType === SITE_TYPES.NEW_API,
  )!
  const snapshot = structuredClone(scenario.balance)
  snapshot.positions[0]!.amount = {
    ...snapshot.positions[0]!.amount,
    status: OBSERVATION_STATUSES.Known,
    observedAt: Date.now(),
    value: "1234567.891",
  }
  const props = { disabled: false, refreshing: false, onRefresh: () => {} }
  const view = render(
    <FinancialBalanceDisplay {...props} snapshot={snapshot} />,
    { withUserPreferencesProvider: false, withThemeProvider: false },
  )
  await userEvent.setup().tab()
  const focused = document.activeElement
  const refreshed = structuredClone(snapshot)
  refreshed.positions[0]!.amount = {
    ...refreshed.positions[0]!.amount,
    status: OBSERVATION_STATUSES.Known,
    observedAt: Date.now(),
    value: "20",
  }
  view.rerender(<FinancialBalanceDisplay {...props} snapshot={refreshed} />)
  expect(await screen.findByText("$20.00", { exact: true })).toBeVisible()
  expect(document.activeElement).toBe(focused)
})

it.each(["expired", "reset"] as const)(
  "retains %s allowance warnings in the full-amount hint",
  async (state) => {
    const now = Date.now()
    const scenario = buildDevFinancialScenarios(now)[6]!
    const allowances = structuredClone(scenario.allowances!)
    const entry = allowances.entries[0]!
    entry.constraint.remaining = {
      ...entry.constraint.remaining,
      status: OBSERVATION_STATUSES.Known,
      observedAt: now,
      value: "1234567.891",
    }
    if (state === "expired")
      entry.validity = { kind: BALANCE_VALIDITY_KINDS.Expires, at: now - 1000 }
    else
      entry.constraint.window = {
        kind: BUDGET_WINDOW_KINDS.Periodic,
        period: "day",
        resetsAt: now - 1000,
      }
    const i18n = await createResourceTestI18n({
      en: { account: enAccount, balanceHistory: enBalanceHistory, common },
    })
    render(
      <I18nextProvider i18n={i18n}>
        <FinancialBalanceDisplay
          allowances={{ ...allowances, entries: [entry] }}
          disabled={false}
          refreshing={false}
          onRefresh={() => {}}
        />
      </I18nextProvider>,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    await userEvent
      .setup()
      .hover(await screen.findByText("$1.23M", { exact: true }))
    const hint = await screen.findByRole("tooltip")
    expect(hint).toHaveTextContent("1,234,567.891")
    expect(hint).toHaveTextContent(
      state === "expired"
        ? enBalanceHistory.native.expired
        : enBalanceHistory.native.reset,
    )
  },
)

it("expands the normal M Token display scale without requiring a long integer", async () => {
  const scenario = buildDevSiteFinancialScenarios(Date.now()).find(
    (entry) => entry.siteType === SITE_TYPES.EMRANK,
  )!
  render(
    <FinancialBalanceDisplay
      snapshot={scenario.balance}
      disabled={false}
      refreshing={false}
      onRefresh={() => {}}
    />,
    { withUserPreferencesProvider: false, withThemeProvider: false },
  )
  await userEvent
    .setup()
    .hover(await screen.findByText("2.5 M Token", { exact: true }))
  expect(await screen.findByRole("tooltip")).toHaveTextContent(
    "2,500,000 Token",
  )
})

it.each([false, true])(
  "keeps balance classification in diagnostics with developer mode %s",
  async (devUnlocked) => {
    window.localStorage.removeItem("aah_dev_features_unlocked")
    if (devUnlocked) toggleDevUnlocked()
    onTestFinished(() => {
      window.localStorage.removeItem("aah_dev_features_unlocked")
    })
    const now = Date.now()
    const i18n = await createResourceTestI18n({
      en: { account: enAccount, balanceHistory: enBalanceHistory },
    })
    const scope = accountBalanceScope({
      baseUrl: "https://platform.kimi.com",
      accountId: "kimi-details",
      auth: { authType: "access_token" },
    })
    const data = parseKimiFinancialData(
      { code: 0, data: { cur: -200000, voucher_cur: 1000000 } },
      scope,
      CURRENCIES.CNY,
      KIMI_FINANCIAL_SOURCES.Console,
      now - 4 * 60 * 60 * 1000,
    )
    const snapshot = {
      ...data.balance,
      positions: data.balance.positions.map((position) => ({
        ...position,
        amount:
          position.amount.status === OBSERVATION_STATUSES.Known
            ? {
                ...position.amount,
                status: OBSERVATION_STATUSES.Stale,
                reason: "request-failed",
              }
            : position.amount,
      })),
    }
    const user = userEvent.setup()
    render(
      <I18nextProvider i18n={i18n}>
        <FinancialBalanceDisplay
          snapshot={snapshot}
          disabled={false}
          refreshing={false}
          onRefresh={() => {}}
        />
      </I18nextProvider>,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("account:financial.details"),
      }),
    )
    const dialog = within(screen.getByRole("dialog"))
    expect(dialog.getByText("CNY 8")).toBeVisible()
    expect(dialog.getByText("-CNY 2")).toBeVisible()
    expect(dialog.getByText("CNY 10")).toBeVisible()
    expect(
      dialog.getAllByText(i18n.t("account:financial.lastKnown"))[0],
    ).toBeVisible()
    if (devUnlocked) {
      expect(
        dialog.getByText(i18n.t("account:financial.mixedNature"), {
          exact: false,
        }),
      ).not.toBeVisible()
      for (const label of dialog.getAllByText(
        i18n.t("account:financial.technicalDetails"),
      )) {
        await user.click(label)
      }
      expect(
        dialog.getByText(i18n.t("account:financial.mixedNature"), {
          exact: false,
        }),
      ).toBeVisible()
      expect(
        dialog.getAllByText(i18n.t("account:financial.component"), {
          exact: false,
        })[0],
      ).toBeVisible()
    } else {
      expect(
        dialog.queryByText(i18n.t("account:financial.mixedNature")),
      ).not.toBeInTheDocument()
      expect(
        dialog.queryByText(i18n.t("account:financial.component")),
      ).not.toBeInTheDocument()
      expect(
        dialog.queryByText(i18n.t("account:financial.technicalDetails")),
      ).not.toBeInTheDocument()
    }
  },
)

it.each([0, 100000])(
  "shows a known Kimi component when its full available total is missing: %s",
  async (cur) => {
    const scope = accountBalanceScope({
      baseUrl: "https://platform.moonshot.ai",
      accountId: "partial-kimi",
    })
    const data = parseKimiFinancialData(
      { code: 0, data: { cur } },
      scope,
      CURRENCIES.USD,
      KIMI_FINANCIAL_SOURCES.Console,
    )
    const i18n = await createResourceTestI18n({ en: { account: enAccount } })
    const onRefresh = vi.fn()
    const user = userEvent.setup()
    render(
      <I18nextProvider i18n={i18n}>
        <FinancialBalanceDisplay
          snapshot={data.balance}
          disabled={false}
          refreshing={false}
          onRefresh={onRefresh}
        />
      </I18nextProvider>,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    const amount = cur === 0 ? "$0.00" : "$1.00"
    const row = await screen.findByRole("group", {
      name: new RegExp(amount.replace(/[$.]/g, "\\$&")),
    })
    expect(row).toHaveTextContent(i18n.t("account:financial.ledger"))
    await user.click(row)
    expect(onRefresh).toHaveBeenCalledOnce()
    await user.click(
      screen.getByRole("button", {
        name: i18n.t("account:financial.details"),
      }),
    )
    expect(screen.getByRole("dialog")).toHaveTextContent(
      i18n.t("account:financial.unavailable"),
    )
  },
)

it("names a granted credit component when the full wallet total is missing", async () => {
  const scope = accountBalanceScope({
    baseUrl: "https://freemodel.dev",
    accountId: "partial-credit",
  })
  const source = {
    adapter: "freemodel",
    operation: "/api/billing",
    contractVersion: "credit-cents/v1",
    kind: EVIDENCE_KINDS.Reported,
  }
  const available = balancePosition({
    id: "available",
    scope,
    source,
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
    value: undefined,
    observedAt: Date.now(),
  })
  const granted = balancePosition({
    id: "signup-credit",
    scope,
    source,
    asset: available.asset,
    value: "0.50",
    funding: "granted",
    parentId: available.id,
    relation: BALANCE_RELATIONS.Component,
    observedAt: Date.now(),
  })
  const i18n = await createResourceTestI18n({ en: { account: enAccount } })
  render(
    <I18nextProvider i18n={i18n}>
      <FinancialBalanceDisplay
        snapshot={accountBalanceSnapshot(
          scope,
          [available, granted],
          Date.now(),
          FINANCIAL_COVERAGE.Partial,
        )}
        disabled={false}
        refreshing={false}
        onRefresh={() => {}}
      />
    </I18nextProvider>,
    { withUserPreferencesProvider: false, withThemeProvider: false },
  )
  const row = await screen.findByRole("group", { name: /\$0\.50/ })
  expect(row).toHaveTextContent(i18n.t("account:financial.granted"))
})

it("shows the newly refreshed Kimi component before its retained stale total", async () => {
  const scope = accountBalanceScope({
    baseUrl: "https://platform.moonshot.ai",
    accountId: "partial-refresh",
  })
  const previous = parseKimiFinancialData(
    { code: 0, data: { cur: 200000, voucher_cur: 1000000 } },
    scope,
    CURRENCIES.USD,
    KIMI_FINANCIAL_SOURCES.Console,
    Date.now() - 1000,
  )
  const incoming = parseKimiFinancialData(
    { code: 0, data: { cur: 100000 } },
    scope,
    CURRENCIES.USD,
    KIMI_FINANCIAL_SOURCES.Console,
  )
  const accepted = acceptBalanceRefresh(
    previous.balance,
    incoming.balanceRefreshParts,
    scope.subject,
    Date.now(),
  )
  const i18n = await createResourceTestI18n({ en: { account: enAccount } })
  const user = userEvent.setup()
  render(
    <I18nextProvider i18n={i18n}>
      <FinancialBalanceDisplay
        snapshot={accepted}
        disabled={false}
        refreshing={false}
        onRefresh={() => {}}
      />
    </I18nextProvider>,
    { withUserPreferencesProvider: false, withThemeProvider: false },
  )
  expect(
    await screen.findByRole("group", { name: /\$1\.00/ }),
  ).toHaveTextContent(i18n.t("account:financial.ledger"))
  await user.click(
    screen.getByRole("button", {
      name: i18n.t("account:financial.details"),
    }),
  )
  const details = screen.getByRole("dialog")
  expect(details).toHaveTextContent(/USD\s*12/)
  expect(details).toHaveTextContent(i18n.t("account:financial.lastKnown"))
})

it.each(["expired", "reset"] as const)(
  "marks an %s allowance independently of its last reported amount",
  async (state) => {
    const now = Date.now()
    const scenario = buildDevFinancialScenarios(now)[6]!
    const entry = scenario.allowances!.entries[0]!
    const onRefresh = vi.fn()
    const i18n = await createResourceTestI18n({
      en: { account: enAccount, balanceHistory: enBalanceHistory, common },
    })
    render(
      <I18nextProvider i18n={i18n}>
        <FinancialBalanceDisplay
          allowances={{
            ...scenario.allowances!,
            entries: [
              {
                ...entry,
                validity:
                  state === "expired"
                    ? { kind: BALANCE_VALIDITY_KINDS.Expires, at: now - 1000 }
                    : entry.validity,
                constraint: {
                  ...entry.constraint,
                  window:
                    state === "reset"
                      ? {
                          kind: BUDGET_WINDOW_KINDS.Periodic,
                          period: "day",
                          resetsAt: now - 1000,
                        }
                      : entry.constraint.window,
                },
              },
            ],
          }}
          disabled={false}
          refreshing={false}
          onRefresh={onRefresh}
        />
      </I18nextProvider>,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    const row = await screen.findByRole("group", { name: /Daily plan/ })
    expect(row).toHaveTextContent("$8.00")
    const indicator = within(row).getByRole("img", {
      name:
        state === "expired"
          ? enBalanceHistory.native.expired
          : `${enBalanceHistory.native.reset} · ${enAccount.financial.lastKnown}`,
    })
    expect(indicator).toBeVisible()
    await userEvent.setup().click(indicator)
    expect(onRefresh).toHaveBeenCalledOnce()
  },
)

it.each([
  {
    asset: CURRENCIES.USD,
    value: "8.123456",
    currency: CURRENCIES.USD,
    expected: "$8.12",
  },
  {
    asset: CURRENCIES.USD,
    value: "8",
    currency: CURRENCIES.CNY,
    expected: "¥57.60",
  },
  {
    asset: CURRENCIES.CNY,
    value: "8",
    currency: CURRENCIES.USD,
    expected: "$1.11",
  },
  { asset: CURRENCIES.CNY, value: "8", currency: undefined, expected: "¥8.00" },
  { asset: CURRENCIES.USD, value: "8", currency: undefined, expected: "$8.00" },
  {
    asset: CURRENCIES.USD,
    value: "0",
    currency: CURRENCIES.USD,
    expected: "$0.00",
  },
] as const)(
  "formats a $asset allowance as $expected in the $currency view while preserving native details",
  async ({ asset, value, currency, expected }) => {
    const i18n = await createResourceTestI18n({
      en: { account: enAccount, common },
    })
    const scenario = buildDevFinancialScenarios(Date.now())[6]!
    const entry = scenario.allowances!.entries[0]!
    render(
      <I18nextProvider i18n={i18n}>
        <FinancialBalanceDisplay
          allowances={{
            ...scenario.allowances!,
            entries: [
              {
                ...entry,
                constraint: {
                  ...entry.constraint,
                  asset: { kind: ASSET_KINDS.Currency, code: asset },
                  remaining: observeAmount(
                    value,
                    entry.constraint.remaining.source,
                    Date.now(),
                  ),
                },
              },
            ],
          }}
          currencyType={currency}
          exchangeRate={7.2}
          disabled={false}
          refreshing={false}
          onRefresh={() => {}}
        />
      </I18nextProvider>,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    const row = await screen.findByRole("group", { name: /Daily plan/ })
    expect(row).toHaveTextContent(expected)
    expect(row).not.toHaveTextContent(asset)
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Balance details" }))
    const details = screen.getByRole("dialog", { name: "Balance details" })
    expect(details).toHaveTextContent(asset)
    if (value === "8.123456") expect(details).toHaveTextContent("8.123456")
    if (asset === CURRENCIES.USD && currency === CURRENCIES.CNY)
      expect(within(details).getByText(/^USD\s*8(?:\.00)?$/)).toBeVisible()
  },
)

it.each([SITE_TYPES.NEW_API, SITE_TYPES.NANOGPT, SITE_TYPES.FREEMODEL])(
  "keeps %s account balances compact without repeating generic labels or inline plan descriptions",
  async (siteType) => {
    const scenario = buildDevSiteFinancialScenarios(Date.now(), "stale").find(
      (entry) => entry.siteType === siteType,
    )!
    render(
      <FinancialBalanceDisplay
        snapshot={scenario.balance}
        allowances={scenario.allowances}
        disabled={false}
        refreshing={false}
        onRefresh={() => {}}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    const amount = await screen.findByRole("group", {
      name: /10.00|42.75|17.34/,
    })
    expect(
      within(amount).queryByText(testI18n.t("account:financial.available")),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("group", { name: /5 hours|Daily plan/ }),
    ).not.toBeInTheDocument()
    await userEvent.setup().click(
      screen.getByRole("button", {
        name: testI18n.t("account:financial.details"),
      }),
    )
    expect(screen.getByRole("dialog")).toHaveTextContent(
      testI18n.t("account:financial.available"),
    )
    if (siteType === SITE_TYPES.FREEMODEL)
      expect(screen.getByRole("dialog")).toHaveTextContent("freemodel")
  },
)

it.each([BUDGET_LIMIT_STATES.Finite, BUDGET_LIMIT_STATES.Unlimited])(
  "separates a stale %s allowance's value from its accessible status indicator",
  async (limitState) => {
    const scenario = buildDevFinancialScenarios(Date.now())[6]!
    const entry = scenario.allowances!.entries[0]!
    const constraint = staleBudgetConstraint(
      { ...entry.constraint, limitState },
      FINANCIAL_OBSERVATION_REASONS.RefreshUnavailable,
    )
    render(
      <FinancialBalanceDisplay
        snapshot={scenario.balance}
        allowances={{
          ...scenario.allowances!,
          entries: [{ ...entry, constraint }],
        }}
        disabled={false}
        refreshing={false}
        onRefresh={() => {}}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    const row = await screen.findByRole("group", { name: /Daily plan/ })
    expect(
      within(row).getByRole("img", {
        name: testI18n.t("account:financial.lastKnown"),
      }),
    ).toBeVisible()
    expect(row).not.toHaveTextContent("(keyManagement:financial.stale)")
    expect(row).toHaveTextContent(
      limitState === BUDGET_LIMIT_STATES.Unlimited
        ? "keyManagement:dialog.unlimitedQuota"
        : "$8.00",
    )
    await userEvent.setup().click(
      screen.getByRole("button", {
        name: testI18n.t("account:financial.details"),
      }),
    )
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "keyManagement:financial.stale",
    )
  },
)

it.each(["wallet", "source"] as const)(
  "does not promote a nested amount because another %s has a ledger with the same local parent ID",
  async (identity) => {
    const user = userEvent.setup()
    const now = Date.now()
    const scope = accountBalanceScope({
      baseUrl: "https://funds.example",
      accountId: "funds",
    })
    const source = {
      adapter: "fixture",
      operation: "wallet",
      contractVersion: "1",
      kind: EVIDENCE_KINDS.Reported,
    }
    const parent = balancePosition({
      id: "balance",
      scope: { ...scope, walletId: "wallet-a" },
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
      value: "7",
      source,
      observedAt: now,
    })
    const child = balancePosition({
      ...parent,
      id: "detail",
      label: "Nested available detail",
      parentId: "balance",
      relation: BALANCE_RELATIONS.Summary,
      value: "3",
      source,
      observedAt: now,
    })
    const unrelatedLedger = balancePosition({
      ...parent,
      role: BALANCE_ROLES.Ledger,
      scope:
        identity === "wallet"
          ? { ...parent.scope, walletId: "wallet-b" }
          : parent.scope,
      value: "40",
      source:
        identity === "source" ? { ...source, contractVersion: "2" } : source,
      observedAt: now,
    })
    const snapshot = balanceSnapshotSchema.parse(
      accountBalanceSnapshot(
        scope,
        [parent, child, unrelatedLedger],
        now,
        FINANCIAL_COVERAGE.Complete,
      ),
    )
    render(
      <FinancialBalanceDisplay
        snapshot={snapshot}
        disabled={false}
        refreshing={false}
        onRefresh={() => {}}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    expect(await screen.findByRole("group", { name: /\$7\.00/ })).toBeVisible()
    expect(
      screen.queryByRole("group", { name: /\$3\.00/ }),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole("button", {
        name: testI18n.t("account:financial.details"),
      }),
    )
    expect(
      within(screen.getByRole("dialog")).getByText("Nested available detail"),
    ).toBeVisible()
  },
)

it("shows a missing native asset's saved legacy amount before an unavailable inline slot", async () => {
  const scope = accountBalanceScope({
    baseUrl: "https://nano-gpt.com",
    accountId: "nano-legacy",
  })
  const legacy = readAccountBalance(
    { nativeBalance: { unit: "USD_XNO", total: 10, nanoBalance: 26.71801147 } },
    scope,
    1700000000000,
  ).positions.find((position) => position.id === "legacy-xno")!
  const native = (id: string, asset: typeof legacy.asset, value: unknown) =>
    balancePosition({
      id,
      scope: {
        ...scope,
        authority: "https://api.nano-gpt.com",
        walletId: "nano_test_owner",
      },
      asset,
      value,
      source: {
        adapter: "nanogpt",
        operation: "/api/check-balance",
        contractVersion: "1",
        kind: EVIDENCE_KINDS.Reported,
      },
      observedAt: 1700000010000,
    })
  render(
    <FinancialBalanceDisplay
      snapshot={accountBalanceSnapshot(
        scope,
        [
          legacy,
          native(
            "usd_balance",
            { kind: ASSET_KINDS.Currency, code: "USD" },
            "12",
          ),
          native(
            "nano_balance",
            { kind: ASSET_KINDS.Crypto, id: "XNO" },
            undefined,
          ),
        ],
        1700000010000,
        "partial",
      )}
      disabled={false}
      refreshing={false}
      onRefresh={() => {}}
    />,
    { withUserPreferencesProvider: false, withThemeProvider: false },
  )
  const usd = await screen.findByRole("group", { name: /\$12\.00/ })
  const xno = screen.getByRole("group", { name: /26\.72 XNO/ })
  expect(xno).toHaveTextContent(testI18n.t("account:financial.lastKnown"))
  expect(
    within(xno).getByRole("img", {
      name: testI18n.t("account:financial.lastKnown"),
    }),
  ).toBeVisible()
  expect(within(usd).queryByRole("img")).not.toBeInTheDocument()
  expect(
    usd.compareDocumentPosition(xno) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  await userEvent.setup().click(
    screen.getByRole("button", {
      name: testI18n.t("account:financial.details"),
    }),
  )
  expect(
    within(screen.getByRole("dialog")).getByText(/26\.71801147/),
  ).toBeVisible()
})

it.each(["expired", "reset"] as const)(
  "marks %s native funds while keeping their last observed amount readable",
  async (state) => {
    const now = Date.now()
    const scope = accountBalanceScope({
      baseUrl: "https://funds.example",
      accountId: "funds",
    })
    const position = balancePosition({
      id: "voucher",
      scope,
      value: "100",
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
      observedAt: now - 2000,
      source: {
        adapter: "fixture",
        operation: "wallet",
        contractVersion: "1",
        kind: EVIDENCE_KINDS.Reported,
      },
      validity:
        state === "expired"
          ? { kind: BALANCE_VALIDITY_KINDS.Expires, at: now - 1000 }
          : { kind: BALANCE_VALIDITY_KINDS.NoExpiry },
      ...(state === "reset"
        ? {
            window: {
              start: now - 10000,
              end: now + 10000,
              resetsAt: now - 1000,
              timeZone: "UTC",
            },
          }
        : {}),
    })
    const i18n = await createResourceTestI18n({
      en: { account: enAccount, balanceHistory: enBalanceHistory, common },
    })
    render(
      <I18nextProvider i18n={i18n}>
        <FinancialBalanceDisplay
          snapshot={accountBalanceSnapshot(scope, [position], now, "complete")}
          disabled={false}
          refreshing={false}
          onRefresh={() => {}}
        />
      </I18nextProvider>,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    const label =
      state === "expired"
        ? enBalanceHistory.native.expired
        : enBalanceHistory.native.reset
    expect(screen.getByText(label, { exact: false })).toBeVisible()
    expect(
      screen.getByRole("group", { name: new RegExp(label) }),
    ).toHaveTextContent("100.00")
  },
)

it.each([
  { siteType: SITE_TYPES.NEW_API, exact: "USD 10" },
  { siteType: SITE_TYPES.SUB2API, exact: "USD 12.34" },
])(
  "shows a default $siteType balance without inventing financial metadata or exposing adapter diagnostics",
  async ({ siteType, exact }) => {
    const i18n = await createResourceTestI18n({
      en: { account: enAccount, common },
    })
    const scenario = buildDevSiteFinancialScenarios(1767225600000).find(
      (s) => s.siteType === siteType,
    )!
    render(
      <I18nextProvider i18n={i18n}>
        <FinancialBalanceDisplay
          snapshot={scenario.balance}
          disabled={false}
          refreshing={false}
          onRefresh={() => {}}
        />
      </I18nextProvider>,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Balance details" }))
    const details = screen.getByRole("dialog", { name: "Balance details" })
    expect(within(details).getByText(exact)).toBeVisible()
    expect(details).not.toHaveTextContent(/unverified|@standard-usd|\/api\//i)
    expect(
      within(details).getByTitle(new Date(1767225600000).toLocaleString("en")),
    ).toBeVisible()
    expect(details).not.toHaveTextContent(/Purchased|No expiry|All models/i)
  },
)

it("bounds an inline Token allowance and preserves its precision in details", async () => {
  const user = userEvent.setup()
  const scenario = buildDevFinancialScenarios(Date.now())[6]!
  const entry = scenario.allowances!.entries[0]!
  const allowances = {
    ...scenario.allowances!,
    entries: [
      {
        ...entry,
        constraint: {
          ...entry.constraint,
          asset: {
            kind: ASSET_KINDS.Quota,
            id: "test:tokens",
            label: "Token",
            displayScale: 1000000,
            displayLabel: "M Token",
          } as const,
          remaining: observeAmount(
            "52998325",
            entry.constraint.remaining.source,
            Date.now(),
          ),
        },
      },
    ],
  }
  render(
    <FinancialBalanceDisplay
      allowances={allowances}
      disabled={false}
      refreshing={false}
      onRefresh={() => {}}
    />,
    { withUserPreferencesProvider: false, withThemeProvider: false },
  )
  expect(screen.getByText("53 M Token")).toBeVisible()
  await user.click(
    screen.getByRole("button", {
      name: testI18n.t("account:financial.details"),
    }),
  )
  expect(screen.getByText("52.998325 M Token")).toBeVisible()
})

it("keeps the exact native currency in details while the row uses console display precision", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n({ en: { account: enAccount } })
  const scope = accountBalanceScope({ baseUrl: "https://native.example" })
  const now = Date.now()
  const position = balancePosition({
    id: "available",
    scope,
    source: {
      adapter: "new-api",
      operation: "balance",
      contractVersion: NEW_API_FINANCIAL_CONTRACT_VERSIONS.StandardUsd,
      kind: EVIDENCE_KINDS.Reported,
    },
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
    value: "3671.208938",
    observedAt: now,
  })
  render(
    <I18nextProvider i18n={i18n}>
      <FinancialBalanceDisplay
        snapshot={accountBalanceSnapshot(
          scope,
          [position],
          now,
          FINANCIAL_COVERAGE.Complete,
        )}
        disabled={false}
        refreshing={false}
        onRefresh={() => {}}
        currencyType="CNY"
        exchangeRate={7.2}
      />
    </I18nextProvider>,
    { withUserPreferencesProvider: false, withThemeProvider: false },
  )
  expect(screen.getByText("¥26.4K")).toBeVisible()
  await user.click(screen.getByRole("button", { name: "Balance details" }))
  const details = screen.getByRole("dialog", { name: "Balance details" })
  expect(within(details).getByText(/USD.*3,671\.208938/)).toBeVisible()
})

it.each([true, false])(
  "shows the exact selected manual amount in its own details section (provider facts: %s)",
  async (withProvider) => {
    const now = Date.now()
    const scope = accountBalanceScope({ baseUrl: "https://manual.example" })
    const manual = accountBalanceSnapshot(
      scope,
      [
        balancePosition({
          id: "manual",
          scope,
          source: {
            adapter: "manual",
            operation: "account-editor",
            contractVersion: "1",
            kind: EVIDENCE_KINDS.Manual,
          },
          observedAt: now,
          value: "123456.789",
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        }),
      ],
      now,
      FINANCIAL_COVERAGE.Complete,
    )
    const snapshot = withProvider
      ? accountBalanceSnapshot(
          scope,
          [
            balancePosition({
              id: "reported",
              scope,
              source: {
                adapter: "fixture",
                operation: "balance",
                contractVersion: "1",
                kind: EVIDENCE_KINDS.Reported,
              },
              observedAt: now,
              value: "120.5",
              asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
            }),
          ],
          now,
          FINANCIAL_COVERAGE.Complete,
        )
      : undefined
    const i18n = await createResourceTestI18n({
      en: { account: enAccount, balanceHistory: enBalanceHistory, common },
    })
    const user = userEvent.setup()
    render(
      <I18nextProvider i18n={i18n}>
        <FinancialBalanceDisplay
          snapshot={snapshot}
          manual={manual}
          disabled={false}
          refreshing={false}
          onRefresh={() => {}}
        />
      </I18nextProvider>,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    expect(screen.getByText("$123K", { exact: true })).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: enAccount.financial.details }),
    )
    const details = screen.getByRole("dialog", {
      name: enAccount.financial.details,
    })
    const manualSection = within(details).getByRole("region", {
      name: enAccount.financial.manual,
    })
    expect(within(manualSection).getByText(/USD.*123,456\.789/)).toBeVisible()
    if (withProvider) {
      const providerAmount = within(details).getByText(/USD.*120\.5/)
      expect(providerAmount).toBeVisible()
      expect(
        manualSection.compareDocumentPosition(providerAmount) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
      expect(
        within(details).getByText(enAccount.financial.manualSelection),
      ).toBeVisible()
    } else {
      expect(
        within(details).queryByText(enAccount.financial.manualSelection),
      ).not.toBeInTheDocument()
    }
  },
)

it("identifies each plan's period in its accessible name without repeating it beside the plan name", async () => {
  const scenario = buildDevFinancialScenarios(Date.now())[6]!
  render(
    <FinancialBalanceDisplay
      snapshot={scenario.balance}
      allowances={scenario.allowances}
      disabled={false}
      refreshing={false}
      onRefresh={() => {}}
    />,
    { withUserPreferencesProvider: false, withThemeProvider: false },
  )
  expect(
    await screen.findByRole("group", {
      name: `Daily plan · ${testI18n.t("keyManagement:financial.period.day")} · $8.00`,
    }),
  ).toBeVisible()
  expect(
    screen.getByRole("group", {
      name: `Weekly plan · ${testI18n.t("keyManagement:financial.period.week")} · $65.00`,
    }),
  ).toBeVisible()
})

it("keeps a readable plan inline when the balance has no readable amount", async () => {
  const now = Date.now()
  const scenario = buildDevFinancialScenarios(now)[6]!
  const missing = balancePosition({
    id: "missing",
    scope: scenario.allowances!.entries[0]!.constraint.scope,
    source: scenario.allowances!.entries[0]!.constraint.remaining.source,
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
    value: undefined,
    observedAt: now,
  })
  render(
    <FinancialBalanceDisplay
      snapshot={{ ...scenario.balance, positions: [missing] }}
      allowances={scenario.allowances}
      disabled={false}
      refreshing={false}
      onRefresh={() => {}}
    />,
    { withUserPreferencesProvider: false, withThemeProvider: false },
  )
  expect(
    await screen.findByRole("group", { name: /Daily plan/ }),
  ).toHaveTextContent("$8.00")
})

it("identifies the fund beneath an unavailable amount without repeating its status", async () => {
  const i18n = await createResourceTestI18n({ en: { account: enAccount } })
  const scope = accountBalanceScope({ baseUrl: "https://wallet.example" })
  const position = balancePosition({
    id: "available",
    label: "Wallet credit",
    scope,
    source: {
      adapter: "wallet",
      operation: "balance",
      contractVersion: "1",
      kind: EVIDENCE_KINDS.Reported,
    },
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
    value: "0",
    observedAt: Date.now(),
  })
  position.amount = {
    status: OBSERVATION_STATUSES.Unavailable,
    source: position.amount.source,
    reason: "request failed",
  }
  render(
    <I18nextProvider i18n={i18n}>
      <FinancialBalanceDisplay
        snapshot={accountBalanceSnapshot(
          scope,
          [position],
          Date.now(),
          FINANCIAL_COVERAGE.Partial,
        )}
        disabled={false}
        refreshing={false}
        onRefresh={() => {}}
      />
    </I18nextProvider>,
    { withUserPreferencesProvider: false, withThemeProvider: false },
  )
  const fund = within(
    screen.getByRole("group", { name: /Available credit · Unavailable/ }),
  )
  expect(fund.getAllByText("Unavailable")).toHaveLength(1)
  expect(fund.getByText("Wallet credit")).toBeVisible()
})

it("shows named timed funds and the original zone-less expiry without inventing an instant", async () => {
  const i18n = await createResourceTestI18n({ en: { account: enAccount } })
  const scope = accountBalanceScope({ baseUrl: "https://relayfor.example" })
  const snapshot = accountBalanceSnapshot(
    scope,
    [
      balancePosition({
        id: "grant",
        label: "Weekly gift",
        reportedTiming: { expiresAt: "2027-01-04" },
        scope,
        source: {
          adapter: "relayfor",
          operation: "grants",
          contractVersion: "1",
          kind: EVIDENCE_KINDS.Reported,
        },
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        value: "3",
        observedAt: 100,
        validity: { kind: BALANCE_VALIDITY_KINDS.Unknown },
      }),
    ],
    100,
    FINANCIAL_COVERAGE.Complete,
  )
  render(
    <I18nextProvider i18n={i18n}>
      <FinancialBalanceDisplay
        snapshot={snapshot}
        disabled={false}
        refreshing={false}
        onRefresh={() => {}}
      />
    </I18nextProvider>,
    { withUserPreferencesProvider: false, withThemeProvider: false },
  )
  await userEvent
    .setup()
    .click(
      screen.getByRole("button", { name: i18n.t("account:financial.details") }),
    )
  const dialog = within(screen.getByRole("dialog"))
  expect(dialog.getByText("Weekly gift")).toBeVisible()
  expect(dialog.getByText(/2027-01-04/)).toHaveTextContent(
    i18n.t("account:financial.timingUnknown"),
  )
})

it("identifies Kimi vouchers consistently in account details and sharing without calling console cur cash", async () => {
  const scope = accountBalanceScope({
    baseUrl: "https://platform.kimi.com",
    auth: { authType: "access_token" },
  } as never)
  const snapshot = parseKimiFinancialData(
    { code: 0, data: { cur: -200000, voucher_cur: 1000000 } },
    scope,
    CURRENCIES.CNY,
    KIMI_FINANCIAL_SOURCES.Console,
  ).balance
  const user = userEvent.setup()
  render(
    <FinancialBalanceDisplay
      snapshot={snapshot}
      disabled={false}
      refreshing={false}
      onRefresh={() => {}}
    />,
    { withUserPreferencesProvider: false, withThemeProvider: false },
  )
  await user.click(
    await screen.findByRole("button", {
      name: testI18n.t("account:financial.details"),
    }),
  )
  const dialog = within(screen.getByRole("dialog"))
  expect(
    dialog.getByText(testI18n.t("account:financial.voucher")),
  ).toBeVisible()
  expect(
    dialog.queryByText(testI18n.t("account:financial.cash")),
  ).not.toBeInTheDocument()
  const payload = buildAccountShareSnapshotPayload({
    currencyType: CURRENCIES.USD,
    siteName: "Kimi",
    balanceSnapshot: snapshot,
    includeTodayCashflow: false,
  })
  const caption = generateShareSnapshotCaption(payload)
  expect(caption).toContain("account:financial.voucher")
  expect(caption).not.toContain("account:financial.cash")
  expect(caption).not.toContain("voucher_cur")
})

it("labels each current and stale source on the main card while retaining stale amounts in other assets", async () => {
  const scope = accountBalanceScope({
    baseUrl: "https://platform.kimi.com",
    auth: { authType: "access_token" },
  } as never)
  const source = {
    adapter: "kimi",
    operation: "console/account",
    contractVersion: "2",
    kind: EVIDENCE_KINDS.Reported,
  } as const
  const consolePosition = balancePosition({
    id: "available",
    scope,
    source,
    observedAt: 1700000000000,
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
    value: "8",
  })
  consolePosition.amount = {
    status: OBSERVATION_STATUSES.Stale,
    value: "8",
    source,
    observedAt: 1700000000000,
    reason: "source switched",
  }
  const inferencePosition = balancePosition({
    id: "available",
    scope,
    source: { ...source, operation: "inference/balance" },
    observedAt: 1700000010000,
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
    value: "10",
  })
  const nanoPosition = balancePosition({
    id: "nano",
    scope,
    source: { ...source, operation: "wallet/nano" },
    observedAt: 1700000000000,
    asset: { kind: ASSET_KINDS.Crypto, id: "XNO" },
    value: "3",
  })
  nanoPosition.amount = {
    status: OBSERVATION_STATUSES.Stale,
    value: "3",
    source: { ...source, operation: "wallet/nano" },
    observedAt: 1700000000000,
    reason: "refresh failed",
  }
  render(
    <FinancialBalanceDisplay
      snapshot={accountBalanceSnapshot(
        scope,
        [consolePosition, inferencePosition, nanoPosition],
        1700000010000,
        FINANCIAL_COVERAGE.Partial,
      )}
      disabled={false}
      refreshing={false}
      onRefresh={() => {}}
    />,
    { withUserPreferencesProvider: false, withThemeProvider: false },
  )
  const consoleFact = await screen.findByRole("group", {
    name: /¥8\.00/,
  })
  expect(consoleFact).toHaveTextContent("¥8.00")
  expect(consoleFact).not.toHaveTextContent("console/account")
  expect(consoleFact).toHaveTextContent(
    testI18n.t("account:financial.lastKnown"),
  )
  const inferenceFact = screen.getByRole("group", {
    name: /¥10\.00/,
  })
  expect(inferenceFact).toHaveTextContent("¥10.00")
  expect(inferenceFact).toHaveAccessibleName(
    expect.stringContaining(testI18n.t("account:financial.available")),
  )
  expect(inferenceFact).not.toHaveTextContent(
    testI18n.t("account:financial.lastKnown"),
  )
  expect(screen.queryByRole("group", { name: /XNO/ })).not.toBeInTheDocument()
  const detailsButton = screen.getByRole("button", {
    name: testI18n.t("account:financial.details"),
  })
  expect(detailsButton).toHaveTextContent("+1")
  await userEvent.setup().click(detailsButton)
  expect(within(screen.getByRole("dialog")).getByText(/XNO/)).toBeVisible()
})

it("shows relative observation time beside the amount while preserving its exact timestamp", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] })
  onTestFinished(() => {
    vi.useRealTimers()
  })
  const now = Date.parse("2026-11-18T04:00:00Z")
  vi.setSystemTime(now)
  const observedAt = now - 5 * 60_000
  const scope = accountBalanceScope({ baseUrl: "https://wallet.example" })
  const position = balancePosition({
    id: "wallet",
    scope,
    source: {
      adapter: "fixture",
      operation: "balance",
      contractVersion: "1",
      kind: EVIDENCE_KINDS.Reported,
    },
    observedAt,
    value: "7",
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
  })
  render(
    <FinancialBalanceDisplay
      snapshot={accountBalanceSnapshot(
        scope,
        [position],
        observedAt,
        FINANCIAL_COVERAGE.Complete,
      )}
      disabled={false}
      refreshing={false}
      onRefresh={() => {}}
    />,
    { withUserPreferencesProvider: false, withThemeProvider: false },
  )
  await userEvent.setup().click(
    screen.getByRole("button", {
      name: testI18n.t("account:financial.details"),
    }),
  )
  const time = within(screen.getByRole("dialog")).getByText("5 minutes ago")
  expect(time.tagName).toBe("TIME")
  expect(time).toHaveAttribute("datetime", new Date(observedAt).toISOString())
  expect(time).toHaveAttribute(
    "title",
    new Date(observedAt).toLocaleString("en"),
  )
  expect(time).toHaveAttribute("tabindex", "0")
  act(() => time.focus())
  expect(screen.getByRole("tooltip")).toHaveTextContent(
    new Date(observedAt).toLocaleString("en"),
  )
  act(() => vi.advanceTimersByTime(60_000))
  expect(time).toHaveTextContent("6 minutes ago")
  await userEvent.setup().keyboard("{Escape}")
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
  expect(screen.getByRole("dialog")).toBeVisible()
})

it("shows the observation window and its reset separately from expiry in details and sharing", async () => {
  const scope = accountBalanceScope({
    baseUrl: "https://example.com",
    auth: { authType: "access_token" },
  } as never)
  const position = balancePosition({
    id: "allowance",
    scope,
    role: BALANCE_ROLES.Allowance,
    source: {
      adapter: "test",
      operation: "allowance",
      contractVersion: "2",
      kind: EVIDENCE_KINDS.Reported,
    },
    observedAt: 1767225600000,
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
    value: "5",
    validity: { kind: BALANCE_VALIDITY_KINDS.Expires, at: 1767484800000 },
  })
  position.window = {
    start: 1767225600000,
    end: 1767312000000,
    resetsAt: 1767398400000,
    timeZone: "Asia/Shanghai",
  }
  const snapshot = accountBalanceSnapshot(
    scope,
    [position],
    1767225600000,
    FINANCIAL_COVERAGE.Complete,
  )
  const user = userEvent.setup()
  render(
    <FinancialBalanceDisplay
      snapshot={snapshot}
      disabled={false}
      refreshing={false}
      onRefresh={() => {}}
    />,
    { withUserPreferencesProvider: false, withThemeProvider: false },
  )
  await user.click(
    await screen.findByRole("button", {
      name: testI18n.t("account:financial.details"),
    }),
  )
  const dialog = screen.getByRole("dialog")
  expect(dialog).toHaveTextContent(testI18n.t("account:financial.window"))
  expect(dialog).toHaveTextContent(testI18n.t("account:financial.resetsAt"))
  expect(dialog).toHaveTextContent("Asia/Shanghai")
  expect(dialog).toHaveTextContent("1/3/2026, 8:00:00 AM")
  const caption = generateShareSnapshotCaption(
    buildAccountShareSnapshotPayload({
      currencyType: CURRENCIES.USD,
      siteName: "Example",
      balanceSnapshot: snapshot,
      includeTodayCashflow: false,
    }),
  )
  expect(caption).toContain("account:financial.window")
  expect(caption).toContain("account:financial.resetsAt")
  expect(caption).toContain("account:financial.expires")
  expect(caption).toContain("Asia/Shanghai")
  expect(caption).toContain("1/3/2026, 8:00:00 AM")
})

it("keeps balance composition readable and reveals source contracts only after developer unlock", async () => {
  toggleDevUnlocked()
  onTestFinished(() => {
    toggleDevUnlocked()
  })
  const scope = accountBalanceScope({ baseUrl: "https://wallet.example" })
  const position = balancePosition({
    id: "available",
    scope,
    source: {
      adapter: "fixture",
      operation: "wallet-contract",
      contractVersion: "2",
      kind: EVIDENCE_KINDS.Reported,
    },
    observedAt: 1767225600000,
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
    value: "93",
    nature: BALANCE_NATURES.Mixed,
    validity: { kind: BALANCE_VALIDITY_KINDS.NoExpiry },
  })
  const user = userEvent.setup()
  render(
    <FinancialBalanceDisplay
      snapshot={accountBalanceSnapshot(
        scope,
        [position],
        1767225600000,
        FINANCIAL_COVERAGE.Complete,
      )}
      disabled={false}
      refreshing={false}
      onRefresh={() => {}}
    />,
    { withUserPreferencesProvider: false, withThemeProvider: false },
  )
  await user.click(
    await screen.findByRole("button", {
      name: testI18n.t("account:financial.details"),
    }),
  )
  const dialog = within(screen.getByRole("dialog"))
  expect(dialog.getByText("USD 93")).toBeVisible()
  expect(dialog.getByText(/fixture\/wallet-contract@2/)).not.toBeVisible()
  await user.click(
    dialog.getByText(testI18n.t("account:financial.technicalDetails")),
  )
  expect(dialog.getByText(/fixture\/wallet-contract@2/)).toBeVisible()
  expect(
    dialog.getByTitle(new Date(1767225600000).toLocaleString("en")),
  ).toBeVisible()
})
