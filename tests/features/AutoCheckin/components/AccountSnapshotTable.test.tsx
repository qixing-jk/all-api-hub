import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import AccountSnapshotTable from "~/features/AutoCheckin/components/AccountSnapshotTable"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
  type AutoCheckinAccountSnapshot,
} from "~/types/autoCheckin"
import { render } from "~~/tests/test-utils/render"

vi.mock("~/components/AccountLinkButton", () => ({
  default: ({ accountName }: { accountName: string }) => (
    <button type="button">{accountName}</button>
  ),
}))

const renderSnapshotTable = (snapshots: AutoCheckinAccountSnapshot[]) =>
  render(<AccountSnapshotTable snapshots={snapshots} />, {
    withReleaseUpdateStatusProvider: false,
    withThemeProvider: false,
    withUserPreferencesProvider: false,
  })

describe("AutoCheckin AccountSnapshotTable", () => {
  it("sorts snapshots from the updated column header", async () => {
    const user = userEvent.setup()
    renderSnapshotTable([
      {
        accountId: "older",
        accountName: "Alpha Older",
        siteType: "new-api",
        detectionEnabled: true,
        autoCheckinEnabled: true,
        providerAvailable: true,
        lastResult: {
          accountId: "older",
          accountName: "Alpha Older",
          status: CHECKIN_RESULT_STATUS.SUCCESS,
          timestamp: 1,
        },
      },
      {
        accountId: "newer",
        accountName: "Zulu Newer",
        siteType: "new-api",
        detectionEnabled: true,
        autoCheckinEnabled: true,
        providerAvailable: true,
        lastResult: {
          accountId: "newer",
          accountName: "Zulu Newer",
          status: CHECKIN_RESULT_STATUS.SUCCESS,
          timestamp: 2,
        },
      },
    ])

    await user.click(
      screen.getByRole("button", {
        name: "autoCheckin:snapshot.table.lastResult",
      }),
    )

    const rows = screen.getAllByRole("row")
    expect(rows[1]).toHaveTextContent("Zulu Newer")
  })

  it("sorts snapshots by whether automatic check-in is enabled", async () => {
    const user = userEvent.setup()
    renderSnapshotTable([
      {
        accountId: "enabled",
        accountName: "Enabled Account",
        siteType: "new-api",
        detectionEnabled: true,
        autoCheckinEnabled: true,
        providerAvailable: true,
      },
      {
        accountId: "disabled",
        accountName: "Disabled Account",
        siteType: "new-api",
        detectionEnabled: true,
        autoCheckinEnabled: false,
        providerAvailable: true,
      },
    ])

    await user.click(
      screen.getByRole("button", {
        name: "autoCheckin:snapshot.table.autoCheckin",
      }),
    )

    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Enabled Account")
  })

  it("paginates long readiness lists", async () => {
    const user = userEvent.setup()
    renderSnapshotTable(
      Array.from({ length: 26 }, (_, index) => ({
        accountId: `snapshot-${index + 1}`,
        accountName: `Snapshot ${index + 1}`,
        siteType: "new-api",
        detectionEnabled: true,
        autoCheckinEnabled: true,
        providerAvailable: true,
      })),
    )

    expect(screen.getByText("Snapshot 1")).toBeVisible()
    expect(screen.queryByText("Snapshot 26")).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "autoCheckin:execution.pagination.next",
      }),
    )

    expect(screen.getByText("Snapshot 26")).toBeVisible()

    await user.click(
      screen.getByRole("combobox", {
        name: "autoCheckin:execution.pagination.rowsPerPage",
      }),
    )
    await user.click(screen.getByRole("option", { name: "10" }))

    expect(screen.getByText("Snapshot 1")).toBeVisible()
    expect(screen.queryByText("Snapshot 26")).not.toBeInTheDocument()
  })

  it("renders sorted snapshot rows with status badges and skip reasons", () => {
    const snapshots: AutoCheckinAccountSnapshot[] = [
      {
        accountId: "snapshot-beta",
        accountName: "Beta Snapshot",
        siteType: "new-api",
        detectionEnabled: false,
        autoCheckinEnabled: true,
        providerAvailable: true,
        lastResult: {
          accountId: "snapshot-beta",
          accountName: "Beta Snapshot",
          status: CHECKIN_RESULT_STATUS.SUCCESS,
          message: "ok",
          timestamp: Date.UTC(2026, 4, 13, 1, 0, 0),
        },
      },
      {
        accountId: "snapshot-alpha",
        accountName: "Alpha Snapshot",
        siteType: "new-api",
        detectionEnabled: true,
        autoCheckinEnabled: false,
        providerAvailable: false,
        skipReason: AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED,
      },
    ]

    renderSnapshotTable(snapshots)

    const rows = screen.getAllByRole("row")

    expect(within(rows[1]).getByText("Alpha Snapshot")).toBeInTheDocument()
    expect(
      within(rows[1]).getByText("autoCheckin:snapshot.badges.methodSelected"),
    ).toBeVisible()
    expect(
      within(rows[1]).getByText("autoCheckin:snapshot.badges.disabled"),
    ).toBeInTheDocument()
    expect(
      within(rows[1]).getByText(
        "autoCheckin:skipReasons.auto_checkin_disabled",
      ),
    ).toBeInTheDocument()
    expect(within(rows[2]).getByText("Beta Snapshot")).toBeInTheDocument()
    expect(
      within(rows[2]).getByText(
        "autoCheckin:snapshot.badges.methodNotSelected",
      ),
    ).toBeVisible()
    expect(
      within(rows[2]).getByText("autoCheckin:execution.status.success"),
    ).toBeInTheDocument()
    expect(within(rows[2]).getAllByRole("cell").at(-1)).not.toHaveTextContent(
      "-",
    )
  })

  it("filters snapshots by execution readiness", async () => {
    const user = userEvent.setup()
    const snapshots: AutoCheckinAccountSnapshot[] = [
      {
        accountId: "ready",
        accountName: "Ready Account",
        siteType: "new-api",
        detectionEnabled: true,
        autoCheckinEnabled: true,
        providerAvailable: true,
      },
      {
        accountId: "attention",
        accountName: "Needs Attention Account",
        siteType: "new-api",
        detectionEnabled: false,
        autoCheckinEnabled: true,
        providerAvailable: true,
      },
    ]

    renderSnapshotTable(snapshots)

    await user.click(
      screen.getByRole("combobox", {
        name: "autoCheckin:snapshot.filters.readinessLabel",
      }),
    )
    await user.click(
      screen.getByRole("option", {
        name: "autoCheckin:snapshot.filters.readinessSetupRequired",
      }),
    )

    expect(screen.getByText("Needs Attention Account")).toBeVisible()
    expect(screen.queryByText("Ready Account")).not.toBeInTheDocument()
  })

  it("filters snapshots by their latest displayed status", async () => {
    const user = userEvent.setup()
    const snapshots: AutoCheckinAccountSnapshot[] = [
      {
        accountId: "skipped",
        accountName: "Skipped Account",
        siteType: "new-api",
        detectionEnabled: true,
        autoCheckinEnabled: false,
        providerAvailable: true,
        skipReason: AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED,
      },
      {
        accountId: "pending",
        accountName: "Pending Account",
        siteType: "new-api",
        detectionEnabled: true,
        autoCheckinEnabled: true,
        providerAvailable: true,
      },
    ]

    renderSnapshotTable(snapshots)

    await user.click(
      screen.getByRole("combobox", {
        name: "autoCheckin:snapshot.filters.statusLabel",
      }),
    )
    await user.click(
      screen.getByRole("option", {
        name: "autoCheckin:execution.status.skipped",
      }),
    )

    expect(screen.getByText("Skipped Account")).toBeVisible()
    expect(screen.queryByText("Pending Account")).not.toBeInTheDocument()
  })

  it("searches snapshots by localized skip reason", async () => {
    const user = userEvent.setup()
    const snapshots: AutoCheckinAccountSnapshot[] = [
      {
        accountId: "disabled",
        accountName: "Disabled Account",
        siteType: "new-api",
        detectionEnabled: true,
        autoCheckinEnabled: false,
        providerAvailable: true,
        skipReason: AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED,
      },
      {
        accountId: "ready",
        accountName: "Ready Account",
        siteType: "new-api",
        detectionEnabled: true,
        autoCheckinEnabled: true,
        providerAvailable: true,
      },
    ]

    renderSnapshotTable(snapshots)

    await user.type(
      screen.getByRole("textbox", {
        name: "autoCheckin:snapshot.filters.searchLabel",
      }),
      "autoCheckin:skipReasons.auto_checkin_disabled",
    )

    expect(screen.getByText("Disabled Account")).toBeVisible()
    expect(screen.queryByText("Ready Account")).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "common:actions.clear" }),
    )

    expect(screen.getByText("Ready Account")).toBeVisible()
  })

  it("searches snapshots by the latest classified failure reason", async () => {
    const user = userEvent.setup()
    const snapshots: AutoCheckinAccountSnapshot[] = [
      {
        accountId: "network",
        accountName: "Network Account",
        siteType: "new-api",
        detectionEnabled: true,
        autoCheckinEnabled: true,
        providerAvailable: true,
        lastResult: {
          accountId: "network",
          accountName: "Network Account",
          status: CHECKIN_RESULT_STATUS.FAILED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR,
          timestamp: 1,
        },
      },
      {
        accountId: "ready",
        accountName: "Ready Account",
        siteType: "new-api",
        detectionEnabled: true,
        autoCheckinEnabled: true,
        providerAvailable: true,
      },
    ]

    renderSnapshotTable(snapshots)

    await user.type(
      screen.getByRole("textbox", {
        name: "autoCheckin:snapshot.filters.searchLabel",
      }),
      "autoCheckin:skipReasons.network_error",
    )

    expect(screen.getByText("Network Account")).toBeVisible()
    expect(screen.queryByText("Ready Account")).not.toBeInTheDocument()
  })

  it("shows the matching count and clears filters from the no-match state", async () => {
    const user = userEvent.setup()
    const snapshots: AutoCheckinAccountSnapshot[] = [
      {
        accountId: "alpha",
        accountName: "Alpha Account",
        siteType: "new-api",
        detectionEnabled: true,
        autoCheckinEnabled: true,
        providerAvailable: true,
      },
      {
        accountId: "beta",
        accountName: "Beta Account",
        siteType: "new-api",
        detectionEnabled: false,
        autoCheckinEnabled: true,
        providerAvailable: true,
      },
    ]

    renderSnapshotTable(snapshots)

    await user.type(
      screen.getByRole("textbox", {
        name: "autoCheckin:snapshot.filters.searchLabel",
      }),
      "missing account",
    )

    expect(
      screen.getByText("autoCheckin:snapshot.filters.countFiltered"),
    ).toBeVisible()
    expect(
      screen.getByText("autoCheckin:snapshot.filters.noMatches"),
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", {
        name: "autoCheckin:snapshot.filters.clearAll",
      }),
    )

    expect(screen.getByText("Alpha Account")).toBeVisible()
    expect(screen.getByText("Beta Account")).toBeVisible()
  })

  it("combines readiness and latest-status filters", async () => {
    const user = userEvent.setup()
    const snapshots: AutoCheckinAccountSnapshot[] = [
      {
        accountId: "skipped-attention",
        accountName: "Skipped Attention Account",
        siteType: "new-api",
        detectionEnabled: true,
        autoCheckinEnabled: false,
        providerAvailable: true,
        skipReason: AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED,
      },
      {
        accountId: "pending-attention",
        accountName: "Pending Attention Account",
        siteType: "new-api",
        detectionEnabled: false,
        autoCheckinEnabled: true,
        providerAvailable: true,
      },
    ]

    renderSnapshotTable(snapshots)

    await user.click(
      screen.getByRole("combobox", {
        name: "autoCheckin:snapshot.filters.readinessLabel",
      }),
    )
    await user.click(
      screen.getByRole("option", {
        name: "autoCheckin:snapshot.filters.readinessSetupRequired",
      }),
    )
    await user.click(
      screen.getByRole("combobox", {
        name: "autoCheckin:snapshot.filters.statusLabel",
      }),
    )
    await user.click(
      screen.getByRole("option", {
        name: "autoCheckin:snapshot.badges.pending",
      }),
    )

    expect(screen.getByText("Pending Attention Account")).toBeVisible()
    expect(
      screen.queryByText("Skipped Attention Account"),
    ).not.toBeInTheDocument()
  })
})
