import { fireEvent, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_DEBUG_ACTIONS } from "~/features/AutoCheckin/actionState"
import ActionBar from "~/features/AutoCheckin/components/ActionBar"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { render } from "~~/tests/test-utils/render"

const { trackStartedMock } = vi.hoisted(() => ({
  trackStartedMock: vi.fn(),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionStarted: trackStartedMock,
}))

describe("AutoCheckin ActionBar", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    trackStartedMock.mockResolvedValue(undefined)
  })

  it("does not attach automatic analytics metadata to explicit-tracked toolbar actions", () => {
    render(
      <ActionBar
        isRunning={false}
        canOpenFailedManualSignIns
        onRunNow={vi.fn()}
        onRefresh={vi.fn()}
        onOpenFailedManualSignIns={vi.fn()}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    fireEvent.click(
      screen.getByRole("button", { name: "autoCheckin:execution.runNow" }),
    )
    fireEvent.click(
      screen.getByRole("button", { name: "autoCheckin:execution.refresh" }),
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "autoCheckin:execution.actions.openFailedManual",
      }),
    )

    expect(trackStartedMock).not.toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAutoCheckinStatus,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinActionBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(trackStartedMock).not.toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenFailedAutoCheckinManualSignIns,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinActionBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(trackStartedMock).not.toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunAutoCheckinNow,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinActionBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("does not track disabled toolbar actions", () => {
    render(
      <ActionBar
        isRunning
        canOpenFailedManualSignIns
        onRunNow={vi.fn()}
        onRefresh={vi.fn()}
        onOpenFailedManualSignIns={vi.fn()}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "autoCheckin:messages.loading.running",
      }),
    )

    expect(trackStartedMock).not.toHaveBeenCalled()
    expect(
      screen.getByRole("button", {
        name: "autoCheckin:messages.loading.running",
      }),
    ).toHaveAttribute("aria-busy", "true")
    expect(
      screen.getByRole("button", { name: "autoCheckin:execution.refresh" }),
    ).not.toHaveAttribute("aria-busy")
  })

  it.each([
    [
      AUTO_CHECKIN_DEBUG_ACTIONS.TRIGGER_DAILY_ALARM,
      "autoCheckin:messages.loading.triggeringDailyAlarm",
    ],
    [
      AUTO_CHECKIN_DEBUG_ACTIONS.TRIGGER_RETRY_ALARM,
      "autoCheckin:messages.loading.triggeringRetryAlarm",
    ],
    [
      AUTO_CHECKIN_DEBUG_ACTIONS.SCHEDULE_DAILY_ALARM,
      "autoCheckin:messages.loading.schedulingDailyAlarmForToday",
    ],
    [
      AUTO_CHECKIN_DEBUG_ACTIONS.EVALUATE_UI_OPEN_PRETRIGGER,
      "autoCheckin:messages.loading.evaluatingUiOpenPretrigger",
    ],
    [
      AUTO_CHECKIN_DEBUG_ACTIONS.TRIGGER_UI_OPEN_PRETRIGGER,
      "autoCheckin:messages.loading.triggeringUiOpenPretrigger",
    ],
    [
      AUTO_CHECKIN_DEBUG_ACTIONS.RESET_LAST_DAILY_RUN_DAY,
      "autoCheckin:messages.loading.resettingLastDailyRunDay",
    ],
  ])(
    "marks only debug action %s busy while locking sibling actions",
    (activeDebugAction, pendingName) => {
      render(
        <ActionBar
          isRunning={false}
          activeDebugAction={activeDebugAction}
          onRunNow={vi.fn()}
          onRefresh={vi.fn()}
          showDebugButtons
          onDebugTriggerDailyAlarmNow={vi.fn()}
          onDebugTriggerRetryAlarmNow={vi.fn()}
          onDebugScheduleDailyAlarmForToday={vi.fn()}
          onDebugEvaluateUiOpenPretrigger={vi.fn()}
          onDebugTriggerUiOpenPretrigger={vi.fn()}
          onDebugResetLastDailyRunDay={vi.fn()}
        />,
        {
          withReleaseUpdateStatusProvider: false,
          withThemeProvider: false,
          withUserPreferencesProvider: false,
        },
      )

      const activeButton = screen.getByRole("button", { name: pendingName })
      expect(activeButton).toBeDisabled()
      expect(activeButton).toHaveAttribute("aria-busy", "true")

      const runNowButton = screen.getByRole("button", {
        name: "autoCheckin:execution.runNow",
      })
      expect(runNowButton).toBeDisabled()
      expect(runNowButton).not.toHaveAttribute("aria-busy")

      const debugButtons = screen
        .getAllByRole("button")
        .filter((button) => button.textContent?.includes("execution.debug"))
      expect(debugButtons).toHaveLength(5)
      for (const siblingButton of debugButtons) {
        expect(siblingButton).toBeDisabled()
        expect(siblingButton).not.toHaveAttribute("aria-busy")
      }
    },
  )
})
