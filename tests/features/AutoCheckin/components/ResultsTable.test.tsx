import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import ResultsTable from "~/features/AutoCheckin/components/ResultsTable"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
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
  it("declares controlled analytics metadata for row action buttons", () => {
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

    const autoCheckinAction = (actionId: string) =>
      `${PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin}:${actionId}:${PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinResultsTable}:${PRODUCT_ANALYTICS_ENTRYPOINTS.Options}`
    const accountAction = (actionId: string) =>
      `${PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement}:${actionId}:${PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinResultsTable}:${PRODUCT_ANALYTICS_ENTRYPOINTS.Options}`

    expect(
      screen.getByRole("button", {
        name: "autoCheckin:execution.actions.retryAccount",
      }),
    ).not.toHaveAttribute("data-analytics-action")
    expect(
      screen.getByRole("button", {
        name: "autoCheckin:execution.actions.openManual",
      }),
    ).toHaveAttribute(
      "data-analytics-action",
      autoCheckinAction(
        PRODUCT_ANALYTICS_ACTION_IDS.OpenAutoCheckinManualSignIn,
      ),
    )
    expect(
      screen.getByRole("button", {
        name: "account:actions.disableAccount",
      }),
    ).toHaveAttribute(
      "data-analytics-action",
      accountAction(PRODUCT_ANALYTICS_ACTION_IDS.DisableAutoCheckinAccount),
    )
    expect(
      screen.getByRole("button", {
        name: "account:actions.delete",
      }),
    ).toHaveAttribute(
      "data-analytics-action",
      accountAction(PRODUCT_ANALYTICS_ACTION_IDS.DeleteAutoCheckinAccount),
    )
    expect(
      screen.getByRole("button", {
        name: "autoCheckin:execution.actions.openSite",
      }),
    ).toHaveAttribute(
      "data-analytics-action",
      accountAction(PRODUCT_ANALYTICS_ACTION_IDS.OpenAutoCheckinAccountSite),
    )
  })
})
