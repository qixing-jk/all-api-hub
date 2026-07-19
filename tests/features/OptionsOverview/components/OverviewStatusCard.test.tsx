import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { describe, expect, it, vi } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { OverviewStatusSummary } from "~/features/OptionsOverview/components/OverviewStatusCard"
import { OPTIONS_OVERVIEW_STATUS_CARD_IDS } from "~/features/OptionsOverview/ids"
import type { OptionsOverviewStatusCard } from "~/features/OptionsOverview/types"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

describe("OverviewStatusSummary", () => {
  it("opens partial coverage from the status button's only tab stop and closes on blur", async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    const target = { menuItemId: MENU_ITEM_IDS.ACCOUNT }
    const item: OptionsOverviewStatusCard = {
      id: OPTIONS_OVERVIEW_STATUS_CARD_IDS.todayUsage,
      value: "5",
      severity: "info",
      target,
      coverage: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
        completeCount: 1,
        partialCount: 1,
        eligibleCount: 3,
        legacyUnclassifiedCount: 0,
      },
    }
    const t = ((key: string) => key) as TFunction

    render(
      <>
        <OverviewStatusSummary items={[item]} t={t} onNavigate={onNavigate} />
        <button type="button">After summary</button>
      </>,
      {
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    const statusButton = screen.getByRole("button", {
      name: /optionsOverview:status\.todayUsage\.label.*5.*todayMetricAvailability\.coverage/,
    })
    await user.tab()
    expect(statusButton).toHaveFocus()
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "optionsOverview:todayMetricAvailability.coverage",
    )

    await user.keyboard("{Enter}")
    expect(onNavigate).toHaveBeenCalledWith(target)

    await user.tab()
    expect(screen.getByRole("button", { name: "After summary" })).toHaveFocus()
    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
    })
  })

  it.each([
    {
      status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
      expectedHelpKey: "coverageWithRefresh",
      expectedVisibleKey: "includesPendingRefresh",
    },
    {
      status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
      expectedHelpKey: "pendingRefreshHelp",
      expectedVisibleKey: "pendingRefresh",
    },
  ])(
    "shows visible legacy $status status coverage",
    ({ status, expectedHelpKey, expectedVisibleKey }) => {
      const item: OptionsOverviewStatusCard = {
        id: OPTIONS_OVERVIEW_STATUS_CARD_IDS.todayUsage,
        value: status === ACCOUNT_TODAY_METRIC_STATUSES.Unavailable ? "—" : "5",
        severity: "info",
        target: { menuItemId: MENU_ITEM_IDS.ACCOUNT },
        coverage: {
          status,
          completeCount:
            status === ACCOUNT_TODAY_METRIC_STATUSES.Partial ? 1 : 0,
          partialCount:
            status === ACCOUNT_TODAY_METRIC_STATUSES.Partial ? 1 : 0,
          eligibleCount: 3,
          legacyUnclassifiedCount: 1,
        },
      }
      const t = ((key: string) => key) as TFunction

      render(
        <OverviewStatusSummary items={[item]} t={t} onNavigate={vi.fn()} />,
        {
          withThemeProvider: false,
          withUserPreferencesProvider: false,
        },
      )

      const statusButton = screen.getByRole("button", {
        name: new RegExp(`todayMetricAvailability\\.${expectedHelpKey}`),
      })
      expect(statusButton).toHaveTextContent(
        `optionsOverview:todayMetricAvailability.${expectedVisibleKey}`,
      )
      if (status === ACCOUNT_TODAY_METRIC_STATUSES.Unavailable) {
        expect(statusButton).not.toHaveTextContent("—")
      }
    },
  )

  it("keeps a navigable generic unavailable dash out of the accessible name", () => {
    const item: OptionsOverviewStatusCard = {
      id: OPTIONS_OVERVIEW_STATUS_CARD_IDS.todayUsage,
      value: "—",
      severity: "warning",
      target: { menuItemId: MENU_ITEM_IDS.ACCOUNT },
      coverage: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        completeCount: 0,
        partialCount: 0,
        eligibleCount: 1,
        legacyUnclassifiedCount: 0,
      },
    }
    const t = ((key: string) => key) as TFunction

    render(
      <OverviewStatusSummary items={[item]} t={t} onNavigate={vi.fn()} />,
      {
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    const statusButton = screen.getByRole("button", {
      name: /optionsOverview:todayMetricAvailability\.unavailable/,
    })
    expect(statusButton).toHaveTextContent("—")
    expect(statusButton).not.toHaveAccessibleName(/—/)
  })

  it("includes the value, visible qualifier, and coverage in a static partial accessible name", () => {
    const item: OptionsOverviewStatusCard = {
      id: OPTIONS_OVERVIEW_STATUS_CARD_IDS.todayUsage,
      value: "5",
      severity: "info",
      coverage: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
        completeCount: 1,
        partialCount: 1,
        eligibleCount: 3,
        legacyUnclassifiedCount: 1,
      },
    }
    const t = ((key: string) => key) as TFunction

    render(
      <OverviewStatusSummary items={[item]} t={t} onNavigate={vi.fn()} />,
      {
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    const statusValue = screen.getByLabelText(
      /5.*optionsOverview:todayMetricAvailability\.includesPendingRefresh.*optionsOverview:todayMetricAvailability\.coverageWithRefresh/,
    )
    expect(statusValue).toHaveTextContent("5")
    expect(statusValue).toHaveTextContent(
      "optionsOverview:todayMetricAvailability.includesPendingRefresh",
    )
  })

  it("shows legacy status refresh guidance when the status card receives keyboard focus", async () => {
    const user = userEvent.setup()
    const item: OptionsOverviewStatusCard = {
      id: OPTIONS_OVERVIEW_STATUS_CARD_IDS.todayUsage,
      value: "—",
      severity: "warning",
      coverage: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        completeCount: 0,
        partialCount: 0,
        eligibleCount: 1,
        legacyUnclassifiedCount: 1,
      },
    }
    const t = ((key: string) => key) as TFunction

    render(
      <OverviewStatusSummary items={[item]} t={t} onNavigate={vi.fn()} />,
      {
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    const statusValue = screen.getByLabelText(
      "optionsOverview:todayMetricAvailability.pendingRefreshHelp",
    )
    expect(statusValue).toHaveTextContent(
      "optionsOverview:todayMetricAvailability.pendingRefresh",
    )
    await user.tab()
    expect(statusValue).toHaveFocus()
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "optionsOverview:todayMetricAvailability.pendingRefreshHelp",
    )
  })
})
