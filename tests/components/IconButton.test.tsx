import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { IconButton } from "~/components/ui/IconButton"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
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

describe("IconButton", () => {
  beforeEach(() => {
    trackStartedMock.mockClear()
    trackStartedMock.mockResolvedValue(undefined)
  })

  it("tracks controlled analytics action without reading button content", () => {
    const onClick = vi.fn()

    render(
      <IconButton
        aria-label="Copy private profile"
        onClick={onClick}
        analyticsAction={{
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialBundle,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        }}
      >
        <span>private profile secret text</span>
      </IconButton>,
    )

    fireEvent.click(
      screen.getByRole("button", { name: "Copy private profile" }),
    )

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(trackStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialBundle,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("tracks scoped analytics action ids from context", () => {
    render(
      <ProductAnalyticsScope
        entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
        featureId={PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles}
        surfaceId={
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesPage
        }
      >
        <IconButton
          aria-label="Copy private profile"
          analyticsAction={PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialBundle}
        >
          <span>private profile secret text</span>
        </IconButton>
      </ProductAnalyticsScope>,
    )

    fireEvent.click(
      screen.getByRole("button", { name: "Copy private profile" }),
    )

    expect(trackStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialBundle,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("does not track controlled analytics action when disabled", () => {
    render(
      <IconButton
        aria-label="Disabled action"
        disabled
        analyticsAction={{
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialBundle,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        }}
      >
        <span>Copy</span>
      </IconButton>,
    )

    fireEvent.click(screen.getByRole("button", { name: "Disabled action" }))

    expect(trackStartedMock).not.toHaveBeenCalled()
  })

  it("does not track when the click handler prevents the default action", () => {
    render(
      <IconButton
        aria-label="Prevented action"
        onClick={(event) => {
          event.preventDefault()
        }}
        analyticsAction={{
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialBundle,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        }}
      >
        <span>Copy</span>
      </IconButton>,
    )

    fireEvent.click(screen.getByRole("button", { name: "Prevented action" }))

    expect(trackStartedMock).not.toHaveBeenCalled()
  })
})
