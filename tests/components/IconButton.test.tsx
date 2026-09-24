import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import Tooltip from "~/components/Tooltip"
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
      "h-(--density-control-sm)",
      "w-(--density-control-sm)",
      "sm:h-(--density-control)",
      "sm:w-(--density-control)",
    )
    expect(screen.getByRole("button", { name: "Small icon" })).toHaveClass(
      "h-(--density-control-xs)",
      "w-(--density-control-xs)",
      "sm:h-(--density-control-sm)",
      "sm:w-(--density-control-sm)",
    )
  })

  it("renders destructive row actions without a persistent filled background", () => {
    render(
      <IconButton aria-label="Delete item" variant="destructiveGhost">
        <span />
      </IconButton>,
    )

    expect(screen.getByRole("button", { name: "Delete item" })).toHaveClass(
      "bg-transparent",
      "text-destructive-text",
      "hover:bg-destructive/10",
    )
  })

  it("uses an accessible tooltip for icon-only discovery by default", async () => {
    const user = userEvent.setup()

    render(
      <IconButton aria-label="Refresh profiles">
        <span />
      </IconButton>,
    )

    const button = screen.getByRole("button", { name: "Refresh profiles" })
    expect(button).not.toHaveAttribute("title")
    expect(button.id).toMatch(/^tooltip-/)
    expect(button.parentElement).not.toHaveAttribute("id", button.id)
    await user.tab()
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Refresh profiles",
    )
  })

  it("uses an explicit title as the default tooltip content", async () => {
    const user = userEvent.setup()

    render(
      <IconButton aria-label="Refresh profiles" title="Refresh the list">
        <span />
      </IconButton>,
    )

    const button = screen.getByRole("button", { name: "Refresh profiles" })
    expect(button).not.toHaveAttribute("title")
    await user.tab()
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Refresh the list",
    )
  })

  it("renders an opt-in tooltip without a native title", async () => {
    const user = userEvent.setup()

    render(
      <IconButton aria-label="Refresh profiles" tooltip="Refresh now">
        <span />
      </IconButton>,
    )

    const button = screen.getByRole("button", { name: "Refresh profiles" })
    expect(button).not.toHaveAttribute("title")

    await user.tab()
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Refresh now")
  })

  it("can disable automatic tooltip and retain native title fallback", () => {
    render(
      <IconButton aria-label="Refresh profiles" disableAutoTooltip>
        <span />
      </IconButton>,
    )

    expect(
      screen.getByRole("button", { name: "Refresh profiles" }),
    ).toHaveAttribute("title", "Refresh profiles")
  })

  it("does not add a second tooltip inside an explicit tooltip wrapper", async () => {
    const user = userEvent.setup()

    render(
      <Tooltip content="Outer description" anchorAsChild>
        <IconButton aria-label="Refresh profiles">
          <span />
        </IconButton>
      </Tooltip>,
    )

    await user.tab()
    expect(
      screen.getByRole("button", { name: "Refresh profiles" }),
    ).not.toHaveAttribute("title")
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Outer description",
    )
    expect(screen.getAllByRole("tooltip")).toHaveLength(1)
  })

  it("keeps a nested button's own tooltip inside a wrapper anchor", async () => {
    const user = userEvent.setup()

    render(
      <Tooltip content="Outer description">
        <div>
          <IconButton aria-label="Nested action">
            <span />
          </IconButton>
        </div>
      </Tooltip>,
    )

    await user.tab()

    expect(screen.getByRole("button", { name: "Nested action" })).toHaveFocus()
    const tooltipText = (await screen.findAllByRole("tooltip")).map(
      (tooltip) => tooltip.textContent,
    )
    expect(tooltipText).toEqual(
      expect.arrayContaining(["Nested action", "Outer description"]),
    )
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

    expect(button).not.toHaveAttribute("title")
    expect(button).toHaveAttribute("aria-busy", "true")
    expect(button).toBeDisabled()
    expect(screen.queryByTestId("refresh-icon")).not.toBeInTheDocument()
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true")

    fireEvent.click(button)

    expect(onClick).not.toHaveBeenCalled()
  })

  it("keeps a loading button at full strength instead of fading it", () => {
    render(
      <>
        <IconButton aria-label="Busy refresh" loading>
          <span />
        </IconButton>
        <IconButton aria-label="Inert refresh" disabled>
          <span />
        </IconButton>
      </>,
    )

    const busy = screen.getByRole("button", { name: "Busy refresh" })
    const inert = screen.getByRole("button", { name: "Inert refresh" })

    // Loading disables input, but the control is doing the most visible work on
    // screen, so it must not also read as inert.
    expect(busy).toHaveAttribute("aria-busy", "true")
    expect(busy).toBeDisabled()
    expect(busy).toHaveClass("disabled:not-aria-busy:opacity-50")
    expect(busy).not.toHaveClass("disabled:opacity-50")

    expect(inert).not.toHaveAttribute("aria-busy")
    expect(inert).toHaveClass("disabled:not-aria-busy:opacity-50")
    expect(inert).toBeDisabled()
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
