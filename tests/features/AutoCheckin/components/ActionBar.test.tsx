import { fireEvent, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ActionBar from "~/features/AutoCheckin/components/ActionBar"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
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

  it("tracks controlled analytics metadata for started-only toolbar actions", () => {
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

    expect(trackStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAutoCheckinStatus,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinActionBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(trackStartedMock).toHaveBeenCalledWith({
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
      screen.getByRole("button", { name: "autoCheckin:execution.runNow" }),
    )

    expect(trackStartedMock).not.toHaveBeenCalled()
  })
})
