import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import AutoCheckinDataWorkspace from "~/features/AutoCheckin/components/AutoCheckinDataWorkspace"
import {
  AUTO_CHECKIN_SKIP_REASON,
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

  it("keeps routine skips out of the needs-attention badge", () => {
    const results: CheckinAccountResult[] = [
      {
        accountId: "success",
        accountName: "Success",
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        timestamp: 3,
      },
      {
        accountId: "already-checked",
        accountName: "Already checked",
        status: CHECKIN_RESULT_STATUS.SKIPPED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.ALREADY_CHECKED_TODAY,
        timestamp: 2,
      },
      {
        accountId: "disabled",
        accountName: "Disabled",
        status: CHECKIN_RESULT_STATUS.SKIPPED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED,
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
      screen.getByLabelText(/autoCheckin:execution\.filters\.countTotal/),
    ).toBeVisible()
  })

  it("counts only actionable results in the needs-attention badge", () => {
    const results: CheckinAccountResult[] = [
      {
        accountId: "failed",
        accountName: "Failed",
        status: CHECKIN_RESULT_STATUS.FAILED,
        timestamp: 5,
      },
      {
        accountId: "uncertain",
        accountName: "Uncertain",
        status: CHECKIN_RESULT_STATUS.UNCERTAIN,
        reconciliation: "unknown",
        timestamp: 4,
      },
      {
        accountId: "skipped-action",
        accountName: "Skipped action",
        status: CHECKIN_RESULT_STATUS.SKIPPED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
        timestamp: 3,
      },
      {
        accountId: "skipped-routine",
        accountName: "Skipped routine",
        status: CHECKIN_RESULT_STATUS.SKIPPED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.ALREADY_CHECKED_TODAY,
        timestamp: 2,
      },
      {
        accountId: "skipped-waiting",
        accountName: "Skipped waiting",
        status: CHECKIN_RESULT_STATUS.SKIPPED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.TIMEOUT,
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
