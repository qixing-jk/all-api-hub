import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { IconButton } from "~/components/ui/IconButton"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"

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

  it("uses responsive icon button sizes with shadcn-aligned desktop targets", () => {
    render(
      <>
        <IconButton aria-label="Default icon">
          <span />
        </IconButton>
        <IconButton aria-label="Small icon" size="sm">
          <span />
        </IconButton>
      </>,
    )

    expect(screen.getByRole("button", { name: "Default icon" })).toHaveClass(
      "h-8",
      "w-8",
      "sm:h-9",
      "sm:w-9",
    )
    expect(screen.getByRole("button", { name: "Small icon" })).toHaveClass(
      "h-6",
      "w-6",
      "sm:h-8",
      "sm:w-8",
    )
  })

  it("uses aria-label as the fallback title for icon-only discovery", () => {
    render(
      <IconButton aria-label="Refresh profiles">
        <span />
      </IconButton>,
    )

    expect(
      screen.getByRole("button", { name: "Refresh profiles" }),
    ).toHaveAttribute("title", "Refresh profiles")
  })

  it("keeps an explicit title when it differs from the accessible name", () => {
    render(
      <IconButton aria-label="Refresh profiles" title="Refresh the list">
        <span />
      </IconButton>,
    )

    expect(
      screen.getByRole("button", { name: "Refresh profiles" }),
    ).toHaveAttribute("title", "Refresh the list")
  })

  it("can disable automatic title fallback for tooltip-managed buttons", () => {
    render(
      <IconButton aria-label="Refresh profiles" disableAutoTitle>
        <span />
      </IconButton>,
    )

    expect(
      screen.getByRole("button", { name: "Refresh profiles" }),
    ).not.toHaveAttribute("title")
  })

  it("preserves its accessible identity and disables interaction while loading", () => {
    const onClick = vi.fn()

    render(
      <IconButton
        aria-label="Refresh profiles"
        aria-busy={false}
        loading
        onClick={onClick}
      >
        <span data-testid="refresh-icon" />
      </IconButton>,
    )

    const button = screen.getByRole("button", { name: "Refresh profiles" })

    expect(button).toHaveAttribute("title", "Refresh profiles")
    expect(button).toHaveAttribute("aria-busy", "true")
    expect(button).toBeDisabled()
    expect(screen.queryByTestId("refresh-icon")).not.toBeInTheDocument()
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true")

    fireEvent.click(button)

    expect(onClick).not.toHaveBeenCalled()
  })

  it("preserves an explicit aria-busy value when not loading", () => {
    render(
      <IconButton aria-label="Refresh profiles" aria-busy="true">
        <span />
      </IconButton>,
    )

    expect(
      screen.getByRole("button", { name: "Refresh profiles" }),
    ).toHaveAttribute("aria-busy", "true")
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
