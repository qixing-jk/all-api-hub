import { describe, expect, it } from "vitest"

import { buildAutoCheckinPanel } from "~/features/OptionsOverview/autoCheckinPanel"
import {
  OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS,
  OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES,
} from "~/features/OptionsOverview/ids"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import { AUTO_CHECKIN_RUN_RESULT } from "~/types/autoCheckin"

describe("auto check-in overview panel builder", () => {
  it("marks the panel disabled when auto check-in is globally disabled", () => {
    const panel = buildAutoCheckinPanel({
      preferences: {
        ...DEFAULT_PREFERENCES,
        autoCheckin: {
          ...DEFAULT_PREFERENCES.autoCheckin,
          globalEnabled: false,
        },
      },
      status: {
        lastRunResult: AUTO_CHECKIN_RUN_RESULT.SUCCESS,
      },
    })

    expect(panel).toMatchObject({
      status: OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES.disabled,
      severity: "info",
      needsRetry: false,
    })
    expect(panel.actions.map((action) => action.id)).toEqual([
      OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS.openAutoCheckin,
    ])
  })

  it("uses not-run status before any persisted execution result exists", () => {
    const panel = buildAutoCheckinPanel({
      preferences: DEFAULT_PREFERENCES,
      status: null,
    })

    expect(panel).toMatchObject({
      status: OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES.notRun,
      severity: "info",
      totalEligible: 0,
      executed: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
    })
  })

  it("maps persisted run results to panel statuses and severities", () => {
    expect(
      buildAutoCheckinPanel({
        preferences: DEFAULT_PREFERENCES,
        status: { lastRunResult: AUTO_CHECKIN_RUN_RESULT.SUCCESS },
      }),
    ).toMatchObject({
      status: OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES.success,
      severity: "success",
    })
    expect(
      buildAutoCheckinPanel({
        preferences: DEFAULT_PREFERENCES,
        status: { lastRunResult: AUTO_CHECKIN_RUN_RESULT.PARTIAL },
      }),
    ).toMatchObject({
      status: OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES.partial,
      severity: "warning",
    })
    expect(
      buildAutoCheckinPanel({
        preferences: DEFAULT_PREFERENCES,
        status: { lastRunResult: AUTO_CHECKIN_RUN_RESULT.FAILED },
      }),
    ).toMatchObject({
      status: OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES.failed,
      severity: "error",
    })
  })

  it("copies run summary and exposes retry action when retry is pending", () => {
    const panel = buildAutoCheckinPanel({
      preferences: DEFAULT_PREFERENCES,
      status: {
        lastRunAt: "2026-06-03T01:30:00.000Z",
        nextDailyScheduledAt: "2026-06-04T01:30:00.000Z",
        nextRetryScheduledAt: "2026-06-03T02:00:00.000Z",
        lastRunResult: AUTO_CHECKIN_RUN_RESULT.PARTIAL,
        summary: {
          totalEligible: 5,
          executed: 4,
          successCount: 3,
          failedCount: 1,
          skippedCount: 1,
          needsRetry: true,
        },
      },
    })

    expect(panel).toMatchObject({
      totalEligible: 5,
      executed: 4,
      successCount: 3,
      failedCount: 1,
      skippedCount: 1,
      needsRetry: true,
      lastRunAt: "2026-06-03T01:30:00.000Z",
      nextRunAt: "2026-06-04T01:30:00.000Z",
      nextRetryAt: "2026-06-03T02:00:00.000Z",
    })
    expect(panel.actions.map((action) => action.id)).toEqual([
      OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS.openAutoCheckin,
      OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS.retryFailed,
    ])
  })

  it("uses legacy pending retry and next scheduled fields as fallbacks", () => {
    const panel = buildAutoCheckinPanel({
      preferences: DEFAULT_PREFERENCES,
      status: {
        nextScheduledAt: "2026-06-04T01:30:00.000Z",
        pendingRetry: true,
      },
    })

    expect(panel.nextRunAt).toBe("2026-06-04T01:30:00.000Z")
    expect(panel.needsRetry).toBe(true)
    expect(panel.actions.map((action) => action.id)).toEqual([
      OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS.openAutoCheckin,
      OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS.retryFailed,
    ])
  })
})
