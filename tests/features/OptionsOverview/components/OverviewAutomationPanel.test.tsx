import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { describe, expect, it, vi } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { OverviewAutomationPanel } from "~/features/OptionsOverview/components/OverviewAutomationPanel"
import {
  OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS,
  OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES,
  OPTIONS_OVERVIEW_AUTOMATION_ACTION_IDS,
  OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS,
  OPTIONS_OVERVIEW_AUTOMATION_STATUS_LABELS,
  OPTIONS_OVERVIEW_AUTOMATION_SUMMARY_ROW_IDS,
} from "~/features/OptionsOverview/ids"
import type {
  OptionsOverviewAutoCheckinPanel,
  OptionsOverviewAutomationItem,
  OptionsOverviewAutomationOverview,
} from "~/features/OptionsOverview/types"
import { render, screen } from "~~/tests/test-utils/render"

const t = ((key: string) => key) as TFunction

function createAutoCheckinItem(): OptionsOverviewAutomationItem {
  const panel: OptionsOverviewAutoCheckinPanel = {
    status: OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES.partial,
    severity: "warning",
    totalEligible: 5,
    executed: 5,
    successCount: 4,
    failedCount: 1,
    skippedCount: 0,
    needsRetry: true,
    lastRunAt: "2026-09-17T17:16:38.000Z",
    nextRunAt: "2026-09-18T15:16:38.000Z",
    actions: [
      {
        id: OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS.openAutoCheckin,
        target: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
        isVisible: true,
      },
      {
        id: OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS.retryFailed,
        target: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
        isVisible: true,
      },
    ],
  }

  return {
    id: OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.autoCheckin,
    status: "warning",
    statusLabel: OPTIONS_OVERVIEW_AUTOMATION_STATUS_LABELS.enabled,
    primaryTarget: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
    summaryRows: [
      {
        id: OPTIONS_OVERVIEW_AUTOMATION_SUMMARY_ROW_IDS.lastRun,
        value: panel.lastRunAt ?? "",
        valueType: "datetime",
      },
      {
        id: OPTIONS_OVERVIEW_AUTOMATION_SUMMARY_ROW_IDS.nextRun,
        value: panel.nextRunAt ?? "",
        valueType: "datetime",
      },
    ],
    actions: [
      {
        id: OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS.openAutoCheckin,
        target: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
      },
    ],
    defaultExpanded: false,
    autoCheckinPanel: panel,
  }
}

function createNotRunAutoCheckinItem(): OptionsOverviewAutomationItem {
  const item = createAutoCheckinItem()
  const panel: OptionsOverviewAutoCheckinPanel = {
    ...item.autoCheckinPanel!,
    status: OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES.notRun,
    severity: "info",
    totalEligible: 0,
    executed: 0,
    successCount: 0,
    failedCount: 0,
    skippedCount: 0,
    needsRetry: false,
    lastRunAt: undefined,
    nextRetryAt: undefined,
    actions: [
      {
        id: OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS.openAutoCheckin,
        target: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
        isVisible: true,
      },
    ],
  }

  return {
    ...item,
    status: "info",
    summaryRows: [
      {
        id: OPTIONS_OVERVIEW_AUTOMATION_SUMMARY_ROW_IDS.lastRun,
        value: "",
        valueType: "datetime",
      },
      {
        id: OPTIONS_OVERVIEW_AUTOMATION_SUMMARY_ROW_IDS.nextRun,
        value: panel.nextRunAt ?? "",
        valueType: "datetime",
      },
    ],
    actions: [
      {
        id: OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS.openAutoCheckin,
        target: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
      },
    ],
    autoCheckinPanel: panel,
  }
}
function createDisabledSiteAnnouncementsItem(): OptionsOverviewAutomationItem {
  return {
    id: OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.siteAnnouncements,
    status: "info",
    statusLabel: OPTIONS_OVERVIEW_AUTOMATION_STATUS_LABELS.disabled,
    primaryTarget: { menuItemId: MENU_ITEM_IDS.BASIC },
    summaryRows: [
      {
        id: OPTIONS_OVERVIEW_AUTOMATION_SUMMARY_ROW_IDS.interval,
        value: "360",
      },
      {
        id: OPTIONS_OVERVIEW_AUTOMATION_SUMMARY_ROW_IDS.records,
        value: "0",
      },
      {
        id: OPTIONS_OVERVIEW_AUTOMATION_SUMMARY_ROW_IDS.unread,
        value: "0",
      },
    ],
    actions: [
      {
        id: OPTIONS_OVERVIEW_AUTOMATION_ACTION_IDS.openAnnouncements,
        target: { menuItemId: MENU_ITEM_IDS.SITE_ANNOUNCEMENTS },
      },
    ],
    defaultExpanded: false,
  }
}

function createOverview(
  items: OptionsOverviewAutomationItem[],
): OptionsOverviewAutomationOverview {
  return { items }
}

function renderPanel(
  item: OptionsOverviewAutomationItem,
  onNavigate = vi.fn(),
) {
  render(
    <OverviewAutomationPanel
      overview={createOverview([item])}
      t={t}
      onNavigate={onNavigate}
    />,
    {
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    },
  )

  return onNavigate
}

describe("OverviewAutomationPanel", () => {
  it("shows the latest run fact on the collapsed auto check-in row", () => {
    renderPanel(createAutoCheckinItem())

    expect(
      screen.getByText(/^optionsOverview:autoCheckin\.lastRun:/),
    ).toBeInTheDocument()
  })

  it("keeps disabled rows compact and offers the enable action when expanded", async () => {
    const user = userEvent.setup()
    const onNavigate = renderPanel(createDisabledSiteAnnouncementsItem())

    expect(
      screen.queryByText(
        "optionsOverview:automation.items.siteAnnouncements.interval",
      ),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "optionsOverview:automation.items.siteAnnouncements.label",
      }),
    )

    expect(
      screen.getByText(
        "optionsOverview:automation.empty.siteAnnouncements.disabled",
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        "optionsOverview:automation.items.siteAnnouncements.interval",
      ),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "optionsOverview:automation.items.siteAnnouncements.openPage",
      }),
    )
    expect(onNavigate).toHaveBeenCalledWith({
      menuItemId: MENU_ITEM_IDS.SITE_ANNOUNCEMENTS,
    })
  })

  it("keeps a never-run auto check-in compact and surfaces the next plan", async () => {
    const user = userEvent.setup()
    renderPanel(createNotRunAutoCheckinItem())

    await user.click(
      screen.getByRole("button", {
        name: "optionsOverview:automation.items.autoCheckin.label",
      }),
    )

    expect(
      screen.getByText("optionsOverview:autoCheckin.empty.notRun.description"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("optionsOverview:autoCheckin.metrics.success"),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText("optionsOverview:autoCheckin.nextRun"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "optionsOverview:autoCheckin.actions.open",
      }),
    ).toBeInTheDocument()
  })
  it("navigates from the row shortcut and expands the auto check-in details once", async () => {
    const user = userEvent.setup()
    const item = createAutoCheckinItem()
    const onNavigate = renderPanel(item)

    await user.click(
      screen.getByRole("button", {
        name: "optionsOverview:automation.openItem",
      }),
    )
    expect(onNavigate).toHaveBeenCalledWith(item.primaryTarget)

    expect(
      screen.queryByText("optionsOverview:autoCheckin.metrics.success"),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "optionsOverview:automation.items.autoCheckin.label",
      }),
    )

    expect(
      screen.getByText("optionsOverview:autoCheckin.metrics.success"),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText("optionsOverview:autoCheckin.status.partial"),
    ).toHaveLength(1)
  })
})
