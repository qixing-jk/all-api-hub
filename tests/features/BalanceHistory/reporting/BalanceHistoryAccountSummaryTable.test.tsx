import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { CURRENCIES } from "~/constants/money"
import BalanceHistoryAccountSummaryTable, {
  type BalanceHistoryAccountSummaryRow,
} from "~/features/BalanceHistory/reporting/BalanceHistoryAccountSummaryTable"
import { accountBalanceScope } from "~/services/accounts/balanceSnapshot"
import { balancePosition } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import { FINANCIAL_HISTORY_ACTIVITY_KINDS } from "~/services/history/dailyBalanceHistory/constants"
import { render, screen, within } from "~~/tests/test-utils/render"

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      i18n: { language: "en" },
      t: (
        key: string,
        options?: {
          covered?: number
          total?: number
        },
      ) =>
        key === "table.coverageFormat"
          ? `${options?.covered}/${options?.total}`
          : `balanceHistory:${key}`,
    }),
  }
})

vi.mock("~/components/AccountLinkButton", () => ({
  default: ({ accountName }: { accountName: string }) => (
    <button type="button" data-testid="account-link">
      {accountName}
    </button>
  ),
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  UserPreferencesProvider: ({ children }: { children: ReactNode }) => children,
  useUserPreferencesContext: () => ({}),
}))

const { useIsMobile } = vi.hoisted(() => ({ useIsMobile: vi.fn(() => false) }))
vi.mock("~/hooks/useMediaQuery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/hooks/useMediaQuery")>()),
  useIsMobile,
}))

const buildRow = (
  overrides: Partial<BalanceHistoryAccountSummaryRow> = {},
): BalanceHistoryAccountSummaryRow => ({
  id: "account-1",
  label: "Account",
  startBalance: 10,
  endBalance: 12,
  netTotal: 2,
  incomeTotal: 4,
  estimatedIncomeTotal: null,
  outcomeTotal: 2,
  snapshotDays: 3,
  cashflowDays: 2,
  estimatedIncomeDays: 0,
  totalDays: 4,
  ...overrides,
})

const getAccountOrder = () =>
  screen.getAllByTestId("account-link").map((element) => element.textContent)

describe("BalanceHistoryAccountSummaryTable", () => {
  it("sorts exact native decimals, keeps missing values last and omits single-account metrics", async () => {
    const user = userEvent.setup()
    const rows = [
      buildRow({
        id: "alpha",
        label: "Alpha",
        nativeActivity: [
          {
            key: "USD-spend",
            label: "Spending",
            amount: "1 USD",
            value: "1.000000000000000001",
            kind: FINANCIAL_HISTORY_ACTIVITY_KINDS.Consumption,
          },
        ],
      }),
      buildRow({
        id: "beta",
        label: "Beta",
        nativeActivity: [
          {
            key: "USD-spend",
            label: "Spending",
            amount: "1 USD",
            value: "1.000000000000000002",
            kind: FINANCIAL_HISTORY_ACTIVITY_KINDS.Consumption,
          },
          {
            key: "one-off",
            label: "One-off",
            amount: "5 CNY",
            value: "5",
            kind: FINANCIAL_HISTORY_ACTIVITY_KINDS.Income,
          },
        ],
      }),
      buildRow({ id: "gamma", label: "Gamma" }),
    ]
    render(
      <BalanceHistoryAccountSummaryTable
        rows={rows}
        isLoading={false}
        currencySymbol="$"
      />,
    )
    await user.click(
      screen.getByRole("button", { name: /account:list.sortMenu/ }),
    )
    expect(
      screen.queryByRole("menuitemradio", { name: "One-off" }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("menuitemradio", { name: "Spending" }))
    expect(getAccountOrder()).toEqual(["Beta", "Alpha", "Gamma"])
    await user.click(
      screen.getByRole("button", {
        name: "balanceHistory:account:list.toggleSortOrder",
      }),
    )
    expect(getAccountOrder()).toEqual(["Alpha", "Beta", "Gamma"])
  })

  it.each([false, true])(
    "keeps archive-only row amounts and activity readable beside native records (mobile: %s)",
    async (mobile) => {
      useIsMobile.mockReturnValue(mobile)
      const user = userEvent.setup()
      const archived = buildRow({
        id: "archive",
        label: "Archived",
        endBalance: 123.45,
        incomeTotal: 4.5,
        outcomeTotal: 2.25,
      })
      const native = buildRow({
        id: "native",
        label: "Native",
        endBalance: 999,
        incomeTotal: 888,
        outcomeTotal: 777,
        nativeActivity: [
          {
            key: "income",
            label: "Recorded income",
            amount: "11.22 USD",
            kind: "income",
          },
          {
            key: "consumption",
            label: "Recorded spending",
            amount: "6.33 USD",
            kind: "consumption",
          },
        ],
      })
      const at = Date.now()
      const position = balancePosition({
        id: "wallet",
        scope: accountBalanceScope({
          baseUrl: "https://native.example",
          accountId: "native",
        }),
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        value: "7",
        observedAt: at,
        source: {
          adapter: "fixture",
          operation: "balance",
          contractVersion: "1",
          kind: EVIDENCE_KINDS.Reported,
        },
      })
      try {
        const { rerender } = render(
          <BalanceHistoryAccountSummaryTable
            rows={[archived]}
            isLoading={false}
            currencySymbol="$"
          />,
        )
        expect(screen.getByText("$123.45")).toBeVisible()
        rerender(
          <BalanceHistoryAccountSummaryTable
            rows={[archived, native]}
            isLoading={false}
            currencySymbol="$"
            financialSeries={[
              {
                key: "native-wallet",
                accountId: "native",
                position,
                values: ["7"],
                observations: [
                  {
                    at,
                    observedAt: at,
                    value: "7",
                    status: OBSERVATION_STATUSES.Known,
                  },
                ],
              },
            ]}
          />,
        )
        expect(screen.getByText("$123.45")).toBeVisible()
        expect(screen.getByText("$4.50")).toBeVisible()
        expect(screen.getByText("$2.25")).toBeVisible()
        expect(
          screen.getByText(
            "balanceHistory:legacy.title · balanceHistory:table.columns.endBalance",
          ),
        ).toBeVisible()
        expect(
          screen.getByText(
            "balanceHistory:legacy.title · balanceHistory:table.columns.incomeTotal",
          ),
        ).toBeVisible()
        expect(screen.getAllByText("7 USD")).toHaveLength(1)
        expect(screen.queryByText("$999.00")).not.toBeInTheDocument()
        expect(screen.queryByText("$888.00")).not.toBeInTheDocument()
        expect(screen.getAllByText("11.22 USD")).toHaveLength(1)
        await user.click(
          screen.getByRole("checkbox", {
            name: mobile
              ? "balanceHistory:legacy.accountDetails"
              : "balanceHistory:legacy.showColumns",
          }),
        )
        expect(screen.getAllByText("$123.45")).toHaveLength(1)
      } finally {
        useIsMobile.mockReturnValue(false)
      }
    },
  )

  it.each([false, true])(
    "ranks comparable native amounts (mobile: %s)",
    async (mobile) => {
      useIsMobile.mockReturnValueOnce(mobile)
      useIsMobile.mockReturnValue(mobile)
      const user = userEvent.setup()
      const rows = [
        buildRow({
          id: "alpha",
          label: "Alpha",
          nativeActivity: [
            {
              key: "USD-spend",
              label: "Recorded spending",
              amount: "2 USD",
              value: "2",
              kind: "consumption",
            },
          ],
        }),
        buildRow({
          id: "beta",
          label: "Beta",
          nativeActivity: [
            {
              key: "USD-spend",
              label: "Recorded spending",
              amount: "12 USD",
              value: "12",
              kind: "consumption",
            },
          ],
        }),
      ]
      try {
        render(
          <BalanceHistoryAccountSummaryTable
            rows={rows}
            isLoading={false}
            currencySymbol="$"
          />,
        )
        await user.click(
          screen.getByRole("button", { name: /account:list.sortMenu/ }),
        )
        await user.click(
          screen.getByRole("menuitemradio", { name: /Recorded spending/ }),
        )
        expect(getAccountOrder()).toEqual(["Beta", "Alpha"])
        await user.click(
          screen.getByRole("button", {
            name: "balanceHistory:account:list.toggleSortOrder",
          }),
        )
        expect(getAccountOrder()).toEqual(["Alpha", "Beta"])
      } finally {
        useIsMobile.mockReturnValue(false)
      }
    },
  )

  it("keeps missing converted end balances below recorded balances in either mobile sort direction", async () => {
    useIsMobile.mockReturnValue(true)
    const user = userEvent.setup()
    try {
      render(
        <BalanceHistoryAccountSummaryTable
          rows={[
            buildRow({ id: "missing", label: "Missing", endBalance: null }),
            buildRow({ id: "low", label: "Low", endBalance: 1 }),
            buildRow({ id: "high", label: "High", endBalance: 20 }),
          ]}
          isLoading={false}
          currencySymbol="$"
          showReferenceColumns
        />,
      )
      await user.click(
        screen.getByRole("button", { name: /account:list.sortMenu/ }),
      )
      await user.click(
        screen.getByRole("menuitemradio", { name: /table.columns.endBalance/ }),
      )
      expect(getAccountOrder()).toEqual(["High", "Low", "Missing"])
      await user.click(
        screen.getByRole("button", { name: /account:list.toggleSortOrder/ }),
      )
      expect(getAccountOrder()).toEqual(["Low", "High", "Missing"])
    } finally {
      useIsMobile.mockReturnValue(false)
    }
  })

  it("shows the loading state when there are no rows yet", () => {
    render(
      <BalanceHistoryAccountSummaryTable
        rows={[]}
        isLoading={true}
        currencySymbol="$"
      />,
    )

    expect(screen.getByText("balanceHistory:table.loading")).toBeInTheDocument()
    expect(screen.queryByText("balanceHistory:table.empty")).toBeNull()
    expect(screen.queryByTestId("account-link")).toBeNull()
  })

  it("keeps rendered rows visible while a refresh is in flight", () => {
    render(
      <BalanceHistoryAccountSummaryTable
        rows={[buildRow({ label: "Primary Account" })]}
        isLoading={true}
        currencySymbol="$"
      />,
    )

    expect(
      screen.getByRole("button", { name: "Primary Account" }),
    ).toBeInTheDocument()
    expect(screen.queryByText("balanceHistory:table.loading")).toBeNull()
  })

  it("shows the empty state when loading has finished without any rows", () => {
    render(
      <BalanceHistoryAccountSummaryTable
        rows={[]}
        isLoading={false}
        currencySymbol="$"
      />,
    )

    expect(screen.getByText("balanceHistory:table.empty")).toBeInTheDocument()
    expect(screen.queryByText("balanceHistory:table.loading")).toBeNull()
  })

  it("shows available converted columns by default for archive-only rows", async () => {
    const user = userEvent.setup()
    render(
      <BalanceHistoryAccountSummaryTable
        rows={[
          buildRow({
            id: "bravo",
            label: "Bravo",
            startBalance: 20,
            endBalance: 25.4,
            netTotal: 5.4,
            incomeTotal: 9.9,
            outcomeTotal: 4.5,
            snapshotDays: 2,
            cashflowDays: 1,
            totalDays: 2,
          }),
          buildRow({
            id: "alpha",
            label: "Alpha",
            startBalance: null,
            endBalance: 12.345,
            netTotal: 2.5,
            incomeTotal: 5,
            outcomeTotal: 3,
            snapshotDays: 4,
            cashflowDays: 3,
            totalDays: 5,
          }),
        ]}
        isLoading={false}
        currencySymbol="$"
      />,
    )

    expect(getAccountOrder()).toEqual(["Alpha", "Bravo"])
    expect(
      screen.getByRole("columnheader", {
        name: "balanceHistory:table.columns.account",
      }),
    ).toHaveAttribute("aria-sort", "ascending")

    const alphaRow = screen.getByRole("button", { name: "Alpha" }).closest("tr")
    expect(alphaRow).not.toBeNull()

    const alphaRowScope = within(alphaRow!)
    expect(alphaRowScope.getByText("$12.35")).toBeInTheDocument()
    expect(alphaRowScope.getByText("4/5")).toBeInTheDocument()
    const references = screen.getByRole("checkbox", {
      name: "balanceHistory:legacy.showColumns",
    })
    expect(references).toBeChecked()
    expect(alphaRowScope.getByText("$5.00")).toBeInTheDocument()
    await user.click(references)
    expect(references).not.toBeChecked()
    expect(alphaRowScope.queryByText("$5.00")).not.toBeInTheDocument()
    await user.click(references)
    expect(references).toBeChecked()
    expect(getAccountOrder()).toEqual(["Alpha", "Bravo"])
    expect(alphaRowScope.getByText("-")).toBeInTheDocument()
    expect(alphaRowScope.getByText("$2.50")).toBeInTheDocument()
    expect(alphaRowScope.getByText("$5.00")).toBeInTheDocument()
    expect(alphaRowScope.getByText("$3.00")).toBeInTheDocument()
    expect(alphaRowScope.getByText("3/5")).toBeInTheDocument()
  })

  it("defaults to showing converted figures when filtering mixed results to archive-only", async () => {
    const user = userEvent.setup()
    const archived = buildRow({ id: "archive", incomeTotal: 5 })
    const native = buildRow({
      id: "native",
      nativeActivity: [
        {
          key: "income",
          label: "Native income",
          amount: "7 CNY",
          kind: "income",
        },
      ],
    })
    const { rerender } = render(
      <BalanceHistoryAccountSummaryTable
        rows={[archived, native]}
        isLoading={false}
        currencySymbol="$"
      />,
    )
    const references = screen.getByRole("checkbox", {
      name: "balanceHistory:legacy.showColumns",
    })
    expect(references).not.toBeChecked()
    await user.click(references)
    expect(references).toBeChecked()
    await user.click(references)
    rerender(
      <BalanceHistoryAccountSummaryTable
        rows={[archived]}
        isLoading={false}
        currencySymbol="$"
      />,
    )
    expect(references).toBeChecked()
    expect(screen.getByText("$5.00")).toBeVisible()
  })

  it("omits empty converted columns from archive-only results", () => {
    render(
      <BalanceHistoryAccountSummaryTable
        rows={[
          buildRow({
            startBalance: null,
            netTotal: null,
            incomeTotal: null,
            outcomeTotal: null,
            cashflowDays: 0,
          }),
        ]}
        isLoading={false}
        currencySymbol="$"
      />,
    )
    expect(
      screen.getByRole("columnheader", {
        name: "balanceHistory:table.columns.endBalance",
      }),
    ).toBeVisible()
    expect(
      screen.queryByRole("columnheader", {
        name: "balanceHistory:table.columns.startBalance",
      }),
    ).not.toBeInTheDocument()
  })

  it("renders estimated income column only when enabled", () => {
    const rows = [
      buildRow({
        estimatedIncomeTotal: 3,
        estimatedIncomeDays: 1,
      }),
    ]

    const { rerender } = render(
      <BalanceHistoryAccountSummaryTable
        rows={rows}
        isLoading={false}
        currencySymbol="$"
        showEstimatedIncome={false}
      />,
    )

    expect(
      screen.queryByText("balanceHistory:table.columns.estimatedIncomeTotal"),
    ).not.toBeInTheDocument()

    rerender(
      <BalanceHistoryAccountSummaryTable
        rows={rows}
        isLoading={false}
        currencySymbol="$"
        showEstimatedIncome
      />,
    )

    expect(
      screen.getByText("balanceHistory:table.columns.estimatedIncomeTotal"),
    ).toBeInTheDocument()
    expect(screen.getByText("$3.00")).toBeInTheDocument()
  })

  it("toggles nullable numeric sorting from descending to ascending while keeping null balances observable", async () => {
    const user = userEvent.setup()

    render(
      <BalanceHistoryAccountSummaryTable
        rows={[
          buildRow({
            id: "null-balance",
            label: "Zulu",
            startBalance: null,
          }),
          buildRow({
            id: "high-balance",
            label: "Alpha",
            startBalance: 25,
          }),
          buildRow({
            id: "low-balance",
            label: "Mike",
            startBalance: 5,
          }),
        ]}
        isLoading={false}
        currencySymbol="$"
      />,
    )

    await user.click(
      screen.getByRole("button", {
        name: "balanceHistory:table.columns.startBalance",
      }),
    )

    expect(getAccountOrder()).toEqual(["Zulu", "Alpha", "Mike"])
    const startBalanceHeader = screen.getByRole("columnheader", {
      name: "balanceHistory:table.columns.startBalance",
    })
    expect(startBalanceHeader).toHaveAttribute("aria-sort", "descending")

    await user.click(
      screen.getByRole("button", {
        name: "balanceHistory:table.columns.startBalance",
      }),
    )

    expect(getAccountOrder()).toEqual(["Mike", "Alpha", "Zulu"])
    expect(startBalanceHeader).toHaveAttribute("aria-sort", "ascending")

    await user.click(
      screen.getByRole("checkbox", {
        name: "balanceHistory:legacy.showColumns",
      }),
    )
    expect(getAccountOrder()).toEqual(["Alpha", "Mike", "Zulu"])
  })

  it("sorts snapshot coverage using zero for rows without total days while preserving the displayed counts", async () => {
    const user = userEvent.setup()

    render(
      <BalanceHistoryAccountSummaryTable
        rows={[
          buildRow({
            id: "partial-coverage",
            label: "Zulu",
            snapshotDays: 1,
            totalDays: 2,
          }),
          buildRow({
            id: "zero-total",
            label: "Alpha",
            snapshotDays: 7,
            totalDays: 0,
          }),
          buildRow({
            id: "full-coverage",
            label: "Mike",
            snapshotDays: 4,
            totalDays: 4,
          }),
        ]}
        isLoading={false}
        currencySymbol="$"
      />,
    )

    const snapshotCoverageHeader = screen.getByRole("button", {
      name: "balanceHistory:table.columns.snapshotCoverage",
    })

    await user.click(snapshotCoverageHeader)

    expect(getAccountOrder()).toEqual(["Mike", "Zulu", "Alpha"])

    const zeroCoverageRow = screen
      .getByRole("button", { name: "Alpha" })
      .closest("tr")
    expect(zeroCoverageRow).not.toBeNull()
    expect(within(zeroCoverageRow!).getByText("7/0")).toBeInTheDocument()

    expect(getAccountOrder()).toEqual(["Mike", "Zulu", "Alpha"])

    await user.click(snapshotCoverageHeader)

    expect(getAccountOrder()).toEqual(["Alpha", "Zulu", "Mike"])
  })
})
