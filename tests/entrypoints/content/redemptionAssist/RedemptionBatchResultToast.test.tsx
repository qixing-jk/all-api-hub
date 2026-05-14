import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RedemptionBatchResultToast } from "~/entrypoints/content/redemptionAssist/components/RedemptionBatchResultToast"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"

const { trackStartedMock, startActionMock, completeActionMock } = vi.hoisted(
  () => ({
    trackStartedMock: vi.fn(),
    startActionMock: vi.fn(),
    completeActionMock: vi.fn(),
  }),
)

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: startActionMock,
  trackProductAnalyticsActionStarted: trackStartedMock,
}))

describe("RedemptionBatchResultToast", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    startActionMock.mockReturnValue({
      complete: completeActionMock,
    })
    trackStartedMock.mockResolvedValue(undefined)
  })

  it("tracks fixed analytics metadata for closing and retrying batch results", async () => {
    const user = userEvent.setup()

    render(
      <RedemptionBatchResultToast
        results={[
          {
            code: "code-a",
            preview: "AA**",
            success: false,
            message: "Failed",
          },
        ]}
        onRetry={vi.fn().mockResolvedValue({
          code: "code-a",
          preview: "AA**",
          success: true,
          message: "Redeemed",
        })}
        onClose={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.close" }),
    )
    await user.click(
      screen.getByRole("button", { name: "common:actions.retry" }),
    )

    expect(trackStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CloseRedemptionBatchResult,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionBatchResultToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })
    expect(startActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RetryRedemptionCode,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionBatchResultToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })
    expect(completeActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
  })
})
