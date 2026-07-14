import { beforeEach, describe, expect, it, vi } from "vitest"

import { Button } from "~/components/ui/button"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

const { trackStartedMock } = vi.hoisted(() => ({
  trackStartedMock: vi.fn(),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionStarted: trackStartedMock,
}))

describe("Button", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    trackStartedMock.mockResolvedValue(undefined)
  })

  it("renders leftIcon when not loading", async () => {
    render(<Button leftIcon={<span data-testid="left-icon" />}>Save</Button>)

    expect(
      await screen.findByRole("button", { name: "Save" }),
    ).toBeInTheDocument()
    expect(screen.getByTestId("left-icon")).toBeInTheDocument()
    expect(
      screen.queryByRole("status", { name: "common:status.loading" }),
    ).not.toBeInTheDocument()
  })

  it("keeps caller pending content and exposes the loading state", async () => {
    render(
      <Button
        loading
        aria-busy={false}
        leftIcon={<span data-testid="left-icon" />}
      >
        Saving changes
      </Button>,
    )

    const button = await screen.findByRole("button", {
      name: /Saving changes/,
    })

    expect(button).toHaveTextContent("Saving changes")
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("aria-busy", "true")
    expect(screen.queryByTestId("left-icon")).not.toBeInTheDocument()
    expect(
      screen.getAllByRole("status", { name: "common:status.loading" }),
    ).toHaveLength(1)
  })

  it("locks a loading slotted link and exposes its busy state", async () => {
    const onButtonClick = vi.fn()
    const onLinkClick = vi.fn()

    render(
      <Button asChild loading onClick={onButtonClick}>
        <a href="/settings" aria-busy={false} onClick={onLinkClick}>
          Saving changes
        </a>
      </Button>,
    )

    const anchor = await screen.findByRole("link", {
      name: /Saving changes/,
    })

    expect(anchor.tagName).toBe("A")
    expect(anchor).toHaveAttribute("href", "/settings")
    expect(anchor).toHaveTextContent("Saving changes")
    expect(anchor).toHaveAttribute("aria-busy", "true")
    expect(anchor).toHaveAttribute("aria-disabled", "true")
    expect(anchor).toHaveAttribute("tabindex", "-1")
    expect(anchor).not.toHaveAttribute("disabled")

    expect(fireEvent.click(anchor)).toBe(false)

    expect(onLinkClick).not.toHaveBeenCalled()
    expect(onButtonClick).not.toHaveBeenCalled()
  })

  it("preserves native disabled semantics for a slotted button", async () => {
    const onButtonClick = vi.fn()
    const onChildClick = vi.fn()

    render(
      <Button asChild disabled onClick={onButtonClick}>
        <button type="button" disabled={false} onClick={onChildClick}>
          Save
        </button>
      </Button>,
    )

    const button = await screen.findByRole("button", { name: "Save" })

    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("aria-disabled", "true")
    expect(button).toHaveAttribute("tabindex", "-1")

    fireEvent.click(button)

    expect(onChildClick).not.toHaveBeenCalled()
    expect(onButtonClick).not.toHaveBeenCalled()
  })

  it("preserves an explicit aria-busy value when not loading", async () => {
    render(<Button aria-busy="true">Save</Button>)

    expect(await screen.findByRole("button", { name: "Save" })).toHaveAttribute(
      "aria-busy",
      "true",
    )
  })

  it("renders Spinner when loading without leftIcon", async () => {
    render(<Button loading>Save</Button>)

    expect(
      await screen.findByRole("button", { name: /Save/ }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole("status", { name: "common:status.loading" }),
    ).toHaveLength(1)
  })

  it("disables user interaction while loading", async () => {
    const onClick = vi.fn()

    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    )

    const button = await screen.findByRole("button", { name: /Save/ })
    expect(button).toBeDisabled()

    fireEvent.click(button)

    expect(onClick).not.toHaveBeenCalled()
  })

  it("tracks controlled analytics action without reading button text", async () => {
    const onClick = vi.fn()

    render(
      <Button
        onClick={onClick}
        analyticsAction={{
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        }}
      >
        Refresh private account for Alice
      </Button>,
    )

    await screen.findByRole("button", {
      name: "Refresh private account for Alice",
    })
    fireEvent.click(screen.getByRole("button"))

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(trackStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("tracks scoped analytics action ids from context", async () => {
    render(
      <ProductAnalyticsScope
        entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
        featureId={PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement}
        surfaceId={PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementHeader}
      >
        <Button analyticsAction={PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount}>
          Refresh private account for Alice
        </Button>
      </ProductAnalyticsScope>,
    )

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Refresh private account for Alice",
      }),
    )

    expect(trackStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementHeader,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("does not track controlled analytics action when disabled", async () => {
    render(
      <Button
        disabled
        analyticsAction={{
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        }}
      >
        Refresh
      </Button>,
    )

    const button = await screen.findByRole("button", { name: "Refresh" })
    fireEvent.click(button)

    expect(trackStartedMock).not.toHaveBeenCalled()
  })
})
