import { screen, within } from "@testing-library/react"
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

describe("AutoCheckin AccountSnapshotTable", () => {
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

    render(<AccountSnapshotTable snapshots={snapshots} />, {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    const rows = screen.getAllByRole("row")

    expect(within(rows[1]).getByText("Alpha Snapshot")).toBeInTheDocument()
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
      within(rows[2]).getByText("autoCheckin:execution.status.success"),
    ).toBeInTheDocument()
    expect(within(rows[2]).getAllByRole("cell").at(-1)).not.toHaveTextContent(
      "-",
    )
  })
})
