import { fireEvent, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import ResultsTable from "~/features/AutoCheckin/components/ResultsTable"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import {
  CHECKIN_RESULT_STATUS,
  type CheckinAccountResult,
} from "~/types/autoCheckin"
import { render } from "~~/tests/test-utils/render"

vi.mock("~/components/AccountLinkButton", () => ({
  default: ({ accountName }: { accountName: string }) => (
    <button type="button">{accountName}</button>
  ),
}))

vi.mock("~/components/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/components/ui")>()
  const toAnalyticsActionAttribute = (analyticsAction: unknown) => {
    if (!analyticsAction) return undefined
    if (typeof analyticsAction === "object") {
      const action = analyticsAction as {
        featureId?: string
        actionId?: string
        surfaceId?: string
        entrypoint?: string
      }
      return `${action.featureId}:${action.actionId}:${action.surfaceId}:${action.entrypoint}`
    }

    if (
      analyticsAction ===
      PRODUCT_ANALYTICS_ACTION_IDS.OpenAutoCheckinManualSignIn
    ) {
      return `${PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin}:${analyticsAction}:${PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinResultsTable}:${PRODUCT_ANALYTICS_ENTRYPOINTS.Options}`
    }

    return `${PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement}:${analyticsAction}:${PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinResultsTable}:${PRODUCT_ANALYTICS_ENTRYPOINTS.Options}`
  }

  return {
    ...actual,
    Button: ({
      analyticsAction,
      children,
      leftIcon,
      rightIcon,
      loading: _loading,
      ...props
    }: any) => (
      <button
        type="button"
        data-analytics-action={toAnalyticsActionAttribute(analyticsAction)}
        {...props}
      >
        {leftIcon}
        {children}
        {rightIcon}
      </button>
    ),
    Card: ({ children }: any) => <div>{children}</div>,
  }
})

const failedResult: CheckinAccountResult = {
  accountId: "account-private-id",
  accountName: "Private Account",
  status: CHECKIN_RESULT_STATUS.FAILED,
  messageKey: "autoCheckin:providerFallback.checkinFailed",
  timestamp: Date.UTC(2026, 4, 13, 1, 0, 0),
}

describe("AutoCheckin ResultsTable", () => {
  it("sorts results from the account column header", async () => {
    const user = userEvent.setup()
    render(
      <ResultsTable
        results={[
          {
            accountId: "beta",
            accountName: "Beta Account",
            status: CHECKIN_RESULT_STATUS.SUCCESS,
            timestamp: 2,
          },
          {
            accountId: "alpha",
            accountName: "Alpha Account",
            status: CHECKIN_RESULT_STATUS.SUCCESS,
            timestamp: 1,
          },
        ]}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    const table = screen.getByRole("table")
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent(
      "Beta Account",
    )

    const accountSort = screen.getByRole("button", {
      name: "autoCheckin:execution.table.accountName",
    })
    await user.click(accountSort)

    expect(within(table).getAllByRole("row")[1]).toHaveTextContent(
      "Alpha Account",
    )
    expect(accountSort.closest("th")).toHaveAttribute("aria-sort", "ascending")
  })

  it("paginates long result lists so later accounts stay reachable", () => {
    const results = Array.from({ length: 26 }, (_, index) => ({
      accountId: `account-${index + 1}`,
      accountName: `Account ${index + 1}`,
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      timestamp: 1,
    }))

    render(<ResultsTable results={results} />, {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    expect(screen.getByRole("button", { name: "Account 1" })).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "Account 26" }),
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "autoCheckin:execution.pagination.next",
      }),
    )

    expect(screen.getByRole("button", { name: "Account 26" })).toBeVisible()
    expect(
      screen.getByText("autoCheckin:execution.pagination.summary"),
    ).toBeVisible()
  })

  it("changes page size and clamps the current page when results shrink", () => {
    const createResults = (length: number) =>
      Array.from({ length }, (_, index) => ({
        accountId: `account-${index + 1}`,
        accountName: `Account ${index + 1}`,
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        timestamp: 1,
      }))
    const view = render(<ResultsTable results={createResults(26)} />, {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    fireEvent.click(
      screen.getByRole("combobox", {
        name: "autoCheckin:execution.pagination.rowsPerPage",
      }),
    )
    const pageSizeOptions = screen
      .getAllByRole("option")
      .map((option) => option.textContent)
    expect(pageSizeOptions).toEqual(expect.arrayContaining(["10", "25"]))
    fireEvent.click(screen.getByRole("option", { name: "10" }))

    expect(screen.getByRole("button", { name: "Account 10" })).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "Account 11" }),
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "autoCheckin:execution.pagination.next",
      }),
    )
    expect(screen.getByRole("button", { name: "Account 11" })).toBeVisible()

    view.rerender(<ResultsTable results={createResults(5)} />)

    expect(screen.getByRole("button", { name: "Account 1" })).toBeVisible()
    expect(
      screen.queryByText("autoCheckin:execution.pagination.summary"),
    ).not.toBeInTheDocument()
  })

  it("shows a localized structured reason when a skipped row has no message key", async () => {
    render(
      <ResultsTable
        results={[
          {
            accountId: "skipped-account",
            accountName: "Skipped Account",
            status: CHECKIN_RESULT_STATUS.SKIPPED,
            reasonCode: "status_unavailable",
            timestamp: 1,
          },
        ]}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    expect(
      await screen.findByText("autoCheckin:skipReasons.status_unavailable"),
    ).toBeVisible()
  })

  it("shows an explicit uncertain outcome and pending-confirmation guidance", async () => {
    render(
      <ResultsTable
        results={[
          {
            accountId: "uncertain-account",
            accountName: "Uncertain Account",
            status: CHECKIN_RESULT_STATUS.UNCERTAIN,
            reconciliation: "unknown",
            timestamp: 1,
          },
        ]}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    expect(
      await screen.findByText("autoCheckin:execution.status.uncertain"),
    ).toBeVisible()
    expect(
      screen.getByText(
        "autoCheckin:providerFallback.resultPendingConfirmation",
      ),
    ).toBeVisible()
  })

  it("offers a retry when status discovery was temporarily unavailable", async () => {
    const user = userEvent.setup()
    render(
      <ResultsTable
        results={[
          {
            accountId: "status-unavailable",
            accountName: "Status Unavailable",
            status: CHECKIN_RESULT_STATUS.SKIPPED,
            reasonCode: "status_unavailable",
            timestamp: 1,
          },
        ]}
        onRetryAccount={vi.fn()}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    expect(
      await screen.findByRole("button", {
        name: "autoCheckin:execution.actions.retryAccount",
      }),
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    expect(
      screen.getByRole("menuitem", {
        name: "autoCheckin:execution.actions.retryAccount",
      }),
    ).toBeVisible()
  })

  it("offers status verification for uncertain results without a retry", async () => {
    const user = userEvent.setup()
    const onVerifyAccountStatus = vi.fn()
    render(
      <ResultsTable
        results={[
          {
            accountId: "uncertain-account",
            accountName: "Uncertain Account",
            status: CHECKIN_RESULT_STATUS.UNCERTAIN,
            reconciliation: "unknown",
            timestamp: 1,
          },
        ]}
        onRetryAccount={vi.fn()}
        onVerifyAccountStatus={onVerifyAccountStatus}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    expect(
      await screen.findByRole("button", {
        name: "autoCheckin:execution.actions.verifyStatus",
      }),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", {
        name: "autoCheckin:execution.actions.retryAccount",
      }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "autoCheckin:execution.actions.verifyStatus",
      }),
    )
    expect(onVerifyAccountStatus).toHaveBeenCalledWith("uncertain-account")
  })

  it("does not attach automatic analytics metadata to explicit-tracked row actions", async () => {
    const user = userEvent.setup()
    render(
      <ResultsTable
        results={[failedResult]}
        onRetryAccount={vi.fn()}
        onOpenManualSignIn={vi.fn()}
        onDisableAccount={vi.fn()}
        onDeleteAccount={vi.fn()}
        onOpenAccountSite={vi.fn()}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    expect(
      screen.getByRole("button", {
        name: "autoCheckin:execution.actions.retryAccount",
      }),
    ).not.toHaveAttribute("data-analytics-action")
    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    expect(
      screen.getByRole("menuitem", {
        name: "autoCheckin:execution.actions.openManual",
      }),
    ).not.toHaveAttribute("data-analytics-action")
    expect(
      screen.getByRole("menuitem", {
        name: "account:actions.disableAccount",
      }),
    ).not.toHaveAttribute("data-analytics-action")
    expect(
      screen.getByRole("menuitem", {
        name: "account:actions.delete",
      }),
    ).not.toHaveAttribute("data-analytics-action")
    expect(
      screen.getByRole("menuitem", {
        name: "autoCheckin:execution.actions.openSite",
      }),
    ).not.toHaveAttribute("data-analytics-action")
  })
})
