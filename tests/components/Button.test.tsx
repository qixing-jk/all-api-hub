import { beforeEach, describe, expect, it, vi } from "vitest"

import { Button } from "~/components/ui/button"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
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

  it("replaces leftIcon with Spinner when loading", async () => {
    render(
      <Button loading leftIcon={<span data-testid="left-icon" />}>
        Save
      </Button>,
    )

    expect(
      await screen.findByRole("button", { name: /Save/ }),
    ).toBeInTheDocument()
    expect(screen.queryByTestId("left-icon")).not.toBeInTheDocument()
    expect(
      screen.getAllByRole("status", { name: "common:status.loading" }),
    ).toHaveLength(1)
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
