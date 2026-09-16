import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import AutoCheckinDataWorkspace from "~/features/AutoCheckin/components/AutoCheckinDataWorkspace"
import {
  CHECKIN_RESULT_STATUS,
  type CheckinAccountResult,
} from "~/types/autoCheckin"
import { render } from "~~/tests/test-utils/render"

describe("AutoCheckinDataWorkspace", () => {
  it("marks accounts needing configuration with a warning in the readiness tab", () => {
    render(
      <AutoCheckinDataWorkspace
        hasHistory={false}
        results={[]}
        snapshots={[
          {
            accountId: "setup",
            accountName: "Setup",
            siteType: "new-api",
            detectionEnabled: false,
            autoCheckinEnabled: true,
            providerAvailable: true,
          },
        ]}
        resultsContent={<div>Results</div>}
        readinessContent={<div>Readiness</div>}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )
    const tab = screen.getByRole("tab", { name: /autoCheckin:snapshot.title/ })
    expect(tab).toHaveAttribute("aria-selected", "true")
    expect(tab.querySelector("svg")).toHaveClass("text-warning-indicator")
    expect(
      screen.getByLabelText(
        "autoCheckin:snapshot.filters.readinessSetupRequired: 1",
      ),
    ).toBeVisible()
    expect(screen.getByText("Readiness")).toBeVisible()
  })

  it("uses the same needs-attention categories as the result filter", () => {
    const results: CheckinAccountResult[] = [
      {
        accountId: "failed",
        accountName: "Failed",
        status: CHECKIN_RESULT_STATUS.FAILED,
        timestamp: 3,
      },
      {
        accountId: "uncertain",
        accountName: "Uncertain",
        status: CHECKIN_RESULT_STATUS.UNCERTAIN,
        reconciliation: "unknown",
        timestamp: 2,
      },
      {
        accountId: "skipped",
        accountName: "Skipped",
        status: CHECKIN_RESULT_STATUS.SKIPPED,
        timestamp: 1,
      },
    ]

    render(
      <AutoCheckinDataWorkspace
        hasHistory
        results={results}
        snapshots={[]}
        resultsContent={<div>Results</div>}
        readinessContent={<div>Readiness</div>}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    expect(
      screen.getByLabelText("autoCheckin:execution.filters.needsAttention: 3"),
    ).toBeVisible()
  })
})
