import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RedemptionAccountSelectToast } from "~/entrypoints/content/redemptionAssist/components/RedemptionAccountSelectToast"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"

const { trackStartedMock } = vi.hoisted(() => ({
  trackStartedMock: vi.fn(),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionStarted: trackStartedMock,
}))

describe("RedemptionAccountSelectToast", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    trackStartedMock.mockResolvedValue(undefined)
  })

  it("tracks fixed analytics metadata for account selection actions", async () => {
    const user = userEvent.setup()

    render(
      <RedemptionAccountSelectToast
        accounts={[
          {
            id: "account-a",
            name: "Private Account",
            baseUrl: "https://private.example",
          } as any,
        ]}
        onSelect={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "redemptionAssist:accountSelect.confirm",
      }),
    )

    expect(trackStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CancelRedemptionAccountSelection,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionAccountSelectToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })
    expect(trackStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ConfirmRedemptionAccountSelection,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionAccountSelectToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })
  })
})
