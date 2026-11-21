import userEvent from "@testing-library/user-event"
import { I18nextProvider, useTranslation } from "react-i18next"
import { describe, expect, it, onTestFinished } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { FinancialHistoryAmounts } from "~/features/BalanceHistory/reporting/FinancialHistoryAmounts"
import { getFinancialHistoryPresentation } from "~/features/BalanceHistory/reporting/financialHistoryPresentation"
import { FinancialHistoryRecords } from "~/features/BalanceHistory/reporting/FinancialHistoryRecords"
import accountLocale from "~/locales/en/account.json"
import balanceHistoryLocale from "~/locales/en/balanceHistory.json"
import commonLocale from "~/locales/en/common.json"
import keyManagementLocale from "~/locales/en/keyManagement.json"
import {
  accountAllowanceObservation,
  ALLOWANCE_IDENTITY_KINDS,
} from "~/services/accounts/allowances"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import { balancePosition, staleObservation } from "~/services/amounts/balance"
import { budgetConstraint } from "~/services/amounts/budgets"
import {
  ASSET_KINDS,
  BALANCE_VALIDITY_KINDS,
  BUDGET_ENFORCEMENT,
  BUDGET_LIMIT_STATES,
  BUDGET_PERIODS,
  BUDGET_WINDOW_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_ENUMERATION,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import { NEW_API_FINANCIAL_CONTRACT_VERSIONS } from "~/services/apiService/newApiFamily/financialContractVersions"
import {
  buildFinancialHistorySeries,
  type FinancialHistorySeries,
} from "~/services/history/dailyBalanceHistory/selectors"
import { DAILY_BALANCE_HISTORY_CAPTURE_SOURCES } from "~/types/dailyBalanceHistory"
import { formatAllowanceLabel } from "~/utils/core/budgetPresentation"
import { toggleDevUnlocked } from "~/utils/core/devMode"
import { createResourceTestI18n, testI18n } from "~~/tests/test-utils/i18n"
import {
  buildNetInflow,
  buildNetInflowItem,
} from "~~/tests/test-utils/netInflow"
import { render, screen, within } from "~~/tests/test-utils/render"

/** Exercise the records as shown inside each account-summary dialog. */
function RecordsFixture({
  series,
  showNetInflow,
}: {
  series: FinancialHistorySeries[]
  showNetInflow: boolean
}) {
  const { t } = useTranslation("balanceHistory")
  const item = series[0]!
  const title = item.allowance
    ? formatAllowanceLabel(item.allowance, t)
    : "Account history"
  return (
    <>
      <h2>{title}</h2>
      <FinancialHistoryRecords
        item={item}
        title={title}
        showNetInflow={showNetInflow}
      />
    </>
  )
}

it("uses the console's M Token scale in the observation table", async () => {
  const scope = accountBalanceScope({
    baseUrl: "https://inference.dahl.global",
    accountId: "tokens",
  })
  const position = balancePosition({
    id: "pool",
    scope,
    asset: {
      kind: ASSET_KINDS.Quota,
      id: "dahl:token",
      label: "Token",
      displayScale: 1000000,
      displayLabel: "M Token",
    },
    value: "2500000",
    observedAt: 1767225600000,
    source: {
      adapter: "dahl",
      operation: "pool",
      contractVersion: "1",
      kind: EVIDENCE_KINDS.Reported,
    },
  })
  render(
    <RecordsFixture
      showNetInflow={false}
      series={[
        {
          key: "pool",
          accountId: "tokens",
          position,
          values: ["2500000"],
          observations: [
            {
              at: 1767139200000,
              value: "2000000",
              status: OBSERVATION_STATUSES.Known,
            },
            {
              at: 1767225600000,
              value: "2500000",
              status: OBSERVATION_STATUSES.Known,
            },
          ],
        },
      ]}
    />,
  )
  expect(await screen.findByRole("cell", { name: "2.5 M Token" })).toBeVisible()
  expect(screen.getByText("balanceHistory:native.firstRecord")).toBeVisible()
  expect(screen.getByText("0.5 M Token", { exact: true })).toBeVisible()
  expect(screen.queryByText(/dahl\/pool@1/)).not.toBeInTheDocument()
  expect(
    screen.queryAllByText(testI18n.t("account:financial.scopeUnknown")),
  ).toHaveLength(0)
})

describe("financial history interval disclosure", () => {
  it("shows retained stale balances and their original time without deriving a fresh range change", async () => {
    const i18n = await createResourceTestI18n({
      en: {
        balanceHistory: balanceHistoryLocale,
        account: accountLocale,
        common: commonLocale,
        keyManagement: keyManagementLocale,
      },
    })
    const at = new Date(2026, 0, 1, 12).getTime()
    const scope = accountBalanceScope({
      baseUrl: "https://wallet.invalid",
      accountId: "wallet",
    })
    const position = balancePosition({
      id: "wallet",
      scope,
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
      value: "5",
      observedAt: at + 86400000,
      source: {
        adapter: "new-api",
        operation: "/api/user/self:quota",
        contractVersion: NEW_API_FINANCIAL_CONTRACT_VERSIONS.StandardUsd,
        kind: EVIDENCE_KINDS.Reported,
      },
    })
    const stale = { ...position, amount: staleObservation(position.amount) }
    const { series } = buildFinancialHistorySeries({
      asOf: at + 2 * 86400000,
      accountIds: ["wallet"],
      startDayKey: "2026-01-01",
      endDayKey: "2026-01-03",
      store: {
        schemaVersion: 4,
        referenceSnapshotsByAccountId: {},
        financialSnapshotsByAccountId: {
          wallet: [
            {
              source: "refresh",
              balance: accountBalanceSnapshot(
                scope,
                [
                  {
                    ...position,
                    amount: {
                      status: OBSERVATION_STATUSES.Known,
                      source: position.amount.source,
                      value: "4",
                      observedAt: at,
                    },
                  },
                ],
                at,
                "complete",
              ),
            },
            {
              source: "refresh",
              balance: accountBalanceSnapshot(
                scope,
                [position],
                at + 86400000,
                "complete",
              ),
            },
            {
              source: "refresh",
              balance: accountBalanceSnapshot(
                scope,
                [stale],
                at + 2 * 86400000,
                "partial",
              ),
            },
          ],
        },
      },
    })
    expect(series[0]?.values).toEqual(["4", "5", null])
    render(
      <I18nextProvider i18n={i18n}>
        <FinancialHistoryAmounts
          items={series}
          presentation={getFinancialHistoryPresentation(
            series,
            i18n.t.bind(i18n),
            "en",
          )}
          onOpen={() => {}}
        />
        <RecordsFixture series={series} showNetInflow={false} />
      </I18nextProvider>,
    )
    const row = await screen.findByRole("button")
    expect(row).toHaveTextContent("5 USD")
    expect(row).toHaveTextContent(i18n.t("account:financial.lastKnown"))
    expect(row).toHaveAttribute(
      "title",
      new Date(at + 86400000).toLocaleString("en"),
    )
    const table = screen.getByRole("table", { name: "Account history" })
    const staleRow = within(table)
      .getByText(i18n.t("account:financial.lastKnown"))
      .closest("tr")!
    expect(staleRow).toHaveTextContent("5 USD")
    expect(staleRow).toHaveTextContent(
      i18n.t("balanceHistory:native.originalObservation", {
        date: new Date(at + 86400000).toLocaleString("en"),
      }),
    )
    expect(
      screen.queryByText(i18n.t("balanceHistory:metrics.net")),
    ).not.toBeInTheDocument()
  })
  it("retains known limits, usage, reservation, stale status, reset and expiry in ordinary history", async () => {
    const i18n = await createResourceTestI18n({
      en: {
        balanceHistory: balanceHistoryLocale,
        account: accountLocale,
        common: commonLocale,
        keyManagement: keyManagementLocale,
      },
    })
    const at = new Date(2026, 0, 1, 12).getTime()
    const scope = accountBalanceScope({
      baseUrl: "https://plans.example",
      accountId: "plan",
    })
    const source = {
      adapter: "fixture",
      operation: "plans",
      contractVersion: "1",
      kind: EVIDENCE_KINDS.Reported,
    }
    const constraint = budgetConstraint({
      scope,
      source,
      observedAt: at,
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
      limitState: BUDGET_LIMIT_STATES.Finite,
      limit: "30",
      used: "10",
      remaining: "20",
      reserved: "0",
      enforcement: BUDGET_ENFORCEMENT.Hard,
      includesByok: true,
      window: {
        kind: BUDGET_WINDOW_KINDS.Rolling,
        period: BUDGET_PERIODS.Day,
        resetsAt: at + 86400000,
      },
    })
    constraint.limit = {
      status: OBSERVATION_STATUSES.Stale,
      value: "30",
      observedAt: at - 1000,
      source,
      reason: "last-known",
    }
    const allowance = {
      id: "plan",
      identityKind: ALLOWANCE_IDENTITY_KINDS.Upstream,
      collectionKey: "plans",
      label: "Plan",
      validity: { kind: BALANCE_VALIDITY_KINDS.Expires, at: at + 7 * 86400000 },
      constraint,
    }
    const position = balancePosition({
      id: "plan",
      scope,
      source,
      observedAt: at,
      asset: constraint.asset,
      value: "20",
    })
    render(
      <I18nextProvider i18n={i18n}>
        <RecordsFixture
          showNetInflow={false}
          series={[
            {
              key: "plan",
              accountId: "plan",
              position,
              allowance,
              values: ["20"],
              observations: [
                {
                  at,
                  value: "20",
                  status: OBSERVATION_STATUSES.Known,
                  allowance,
                },
              ],
            },
          ]}
        />
      </I18nextProvider>,
    )
    const summary = await screen.findByText(/Limit: USD 30/)
    expect(summary).toHaveTextContent(i18n.t("keyManagement:financial.stale"))
    expect(summary).toHaveTextContent("Used: USD 10")
    expect(summary).toHaveTextContent("Reserved: USD 0")
    expect(summary).toHaveTextContent(i18n.t("keyManagement:financial.reset"))
    expect(summary).toHaveTextContent(
      i18n.t("keyManagement:financial.hardLimit"),
    )
    expect(summary).toHaveTextContent(
      i18n.t("keyManagement:financial.includesByok"),
    )
    expect(screen.getByText(/Expires:/)).toBeVisible()
  })

  it.each([
    [BUDGET_PERIODS.Day, false],
    [BUDGET_PERIODS.Week, false],
    [BUDGET_PERIODS.Day, true],
  ] as const)(
    "shows reported remaining and period without optional unknown details (%s, debug=%s)",
    async (period, unlocked) => {
      if (unlocked) {
        toggleDevUnlocked()
        onTestFinished(() => {
          toggleDevUnlocked()
        })
      }
      const user = userEvent.setup()
      const i18n = await createResourceTestI18n({
        en: {
          balanceHistory: balanceHistoryLocale,
          account: accountLocale,
          common: commonLocale,
          keyManagement: keyManagementLocale,
        },
      })
      const at = new Date(2026, 0, 1, 12).getTime()
      const scope = accountBalanceScope({
        baseUrl: "https://plans.example",
        accountId: "plan",
      })
      const source = {
        adapter: "fixture",
        operation: "plans",
        contractVersion: "1",
        kind: EVIDENCE_KINDS.Reported,
      }
      const allowance = {
        id: "plan",
        identityKind: ALLOWANCE_IDENTITY_KINDS.Upstream,
        collectionKey: "plans",
        label: "Plan",
        validity: { kind: BALANCE_VALIDITY_KINDS.Unknown },
        constraint: budgetConstraint({
          scope,
          source,
          observedAt: at,
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          limitState: BUDGET_LIMIT_STATES.Finite,
          remaining: "20",
          window: { kind: BUDGET_WINDOW_KINDS.Unknown, period },
        }),
      }
      const position = balancePosition({
        id: "plan",
        scope,
        source,
        observedAt: at,
        asset: allowance.constraint.asset,
        value: "20",
      })
      render(
        <I18nextProvider i18n={i18n}>
          <RecordsFixture
            showNetInflow
            series={[
              {
                key: "plan",
                accountId: "plan",
                position,
                allowance,
                values: ["20"],
                observations: [
                  {
                    at,
                    value: "20",
                    status: OBSERVATION_STATUSES.Known,
                    allowance,
                  },
                ],
              },
            ]}
          />
        </I18nextProvider>,
      )
      expect(
        await screen.findByRole("cell", { name: /USD\s*20/ }),
      ).toBeVisible()
      expect(screen.getByRole("heading")).toHaveTextContent(
        period === BUDGET_PERIODS.Day ? "Daily" : "Weekly",
      )
      if (unlocked) {
        expect(screen.getByText(/N\/A|Window unknown/)).not.toBeVisible()
        await user.click(screen.getByText("Technical details (debug)"))
        expect(screen.getByText(/N\/A|Window unknown/)).toBeVisible()
        expect(screen.getByText("Validity unverified")).toBeVisible()
      } else {
        expect(
          screen.queryByText(/N\/A|Window unknown/),
        ).not.toBeInTheDocument()
      }
      expect(
        screen.queryByRole("columnheader", { name: "Estimated net inflow" }),
      ).not.toBeInTheDocument()
    },
  )

  it("shows unlimited plan state without a numeric chart point or a net-inflow column", async () => {
    const at = new Date(2026, 0, 1, 12).getTime()
    const scope = accountBalanceScope({
      baseUrl: "https://plans.example",
      accountId: "plan",
    })
    const source = {
      adapter: "fixture",
      operation: "plans",
      contractVersion: "1",
      kind: EVIDENCE_KINDS.Reported,
    }
    const allowances = accountAllowanceObservation(
      scope,
      [
        {
          source,
          collectionKey: "plans",
          enumeration: FINANCIAL_ENUMERATION.Complete,
          entries: [
            {
              id: "unlimited",
              identityKind: ALLOWANCE_IDENTITY_KINDS.Upstream,
              collectionKey: "plans",
              label: "Unlimited plan",
              validity: { kind: BALANCE_VALIDITY_KINDS.Unknown },
              constraint: budgetConstraint({
                scope,
                source,
                observedAt: at,
                asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
                limitState: BUDGET_LIMIT_STATES.Unlimited,
                window: {
                  kind: BUDGET_WINDOW_KINDS.Periodic,
                  period: BUDGET_PERIODS.Month,
                },
              }),
            },
          ],
        },
      ],
      at,
    ).allowances
    const report = buildFinancialHistorySeries({
      store: {
        schemaVersion: 4,
        referenceSnapshotsByAccountId: {},
        financialSnapshotsByAccountId: {
          plan: [
            {
              allowances,
              source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
            },
          ],
        },
      },
      accountIds: ["plan"],
      asOf: at,
      startDayKey: "2026-01-01",
      endDayKey: "2026-01-01",
    })
    render(
      <RecordsFixture
        {...report}

        showNetInflow
      />,
    )
    expect(
      await screen.findByRole("heading", { name: /Unlimited plan/ }),
    ).toBeVisible()
    expect(
      screen.getByRole("cell", { name: "keyManagement:dialog.unlimitedQuota" }),
    ).toBeVisible()
    expect(
      screen.queryByRole("columnheader", {
        name: "balanceHistory:native.netInflow",
      }),
    ).not.toBeInTheDocument()
    expect(report.series[0]?.values).toEqual([null])
    expect(
      screen.getByText(
        "keyManagement:dialog.unlimitedQuota · keyManagement:financial.period.month",
      ),
    ).toBeVisible()
  })

  it.each(["UTC", "Asia/Shanghai"])(
    "shows the net inflow billing timezone %s",
    async (timeZone) => {
      const estimate = buildNetInflow()
      estimate.window.timeZone = timeZone
      const item = buildNetInflowItem(estimate)
      render(
        <RecordsFixture
          showNetInflow
          series={[
            {
              key: item.seriesKey,
              accountId: "account",
              position: item.position,
              values: ["50"],
              observations: [
                {
                  at: estimate.window.end,
                  observedAt: estimate.window.end,
                  value: "50",
                  status: OBSERVATION_STATUSES.Known,
                  netInflow: estimate,
                },
              ],
            },
          ]}
        />,
      )
      expect(
        await screen.findByRole("cell", { name: /-5 CNY/ }),
      ).toHaveTextContent(timeZone)
    },
  )
})
