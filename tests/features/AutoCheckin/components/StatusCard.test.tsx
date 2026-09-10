import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import StatusCard from "~/features/AutoCheckin/components/StatusCard"
import {
  CHECKIN_RESULT_STATUS,
  type AutoCheckinPreferences,
} from "~/types/autoCheckin"
import { render } from "~~/tests/test-utils/render"

const preferences: AutoCheckinPreferences = {
  globalEnabled: true,
  pretriggerDailyOnUiOpen: true,
  notifyUiOnCompletion: true,
  windowStart: "08:00",
  windowEnd: "10:00",
  scheduleMode: "deterministic",
  deterministicTime: "09:00",
  retryStrategy: {
    enabled: false,
    intervalMinutes: 30,
    maxAttemptsPerDay: 3,
  },
}

describe("AutoCheckin StatusCard", () => {
  it("derives distinct success counts when persisted account results have no summary", () => {
    render(
      <StatusCard
        preferences={preferences}
        status={{
          perAccount: {
            success: {
              accountId: "success",
              accountName: "Success",
              status: CHECKIN_RESULT_STATUS.SUCCESS,
              timestamp: 1,
            },
            already: {
              accountId: "already",
              accountName: "Already",
              status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
              timestamp: 1,
            },
          },
        }}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )
    expect(
      screen.getByText("autoCheckin:status.summary.success").parentElement,
    ).toHaveTextContent("1")
    expect(
      screen.getByText("autoCheckin:status.summary.alreadyChecked")
        .parentElement,
    ).toHaveTextContent("1")
  })

  it("shows successful, already-checked, and pending-confirmation counts separately", () => {
    render(
      <StatusCard
        preferences={preferences}
        status={{
          summary: {
            totalEligible: 5,
            executed: 4,
            successCount: 2,
            alreadyCheckedCount: 1,
            failedCount: 1,
            uncertainCount: 1,
            skippedCount: 1,
            needsRetry: true,
          },
        }}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    const expectSummaryValue = (key: string, value: string) =>
      expect(screen.getByText(key).parentElement).toHaveTextContent(value)

    expectSummaryValue("autoCheckin:status.summary.success", "1")
    expectSummaryValue("autoCheckin:status.summary.alreadyChecked", "1")
    expectSummaryValue("autoCheckin:status.summary.failed", "1")
    expectSummaryValue("autoCheckin:status.summary.uncertain", "1")
    expectSummaryValue("autoCheckin:status.summary.skipped", "1")
  })
})
