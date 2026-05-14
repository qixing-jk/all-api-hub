import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

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

vi.mock("~/services/productAnalytics/actions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/actions")>()

  return {
    ...actual,
    trackProductAnalyticsActionStarted: trackStartedMock,
  }
})

describe("useProductAnalyticsActionTracking", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    trackStartedMock.mockResolvedValue(undefined)
  })

  it("tracks only fixed enum values for a controlled click", async () => {
    const { useProductAnalyticsActionTracking } = await import(
      "~/hooks/useProductAnalyticsActionTracking"
    )

    function Harness() {
      const analytics = useProductAnalyticsActionTracking({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })

      return (
        <button
          {...analytics.getActionTrackingProps()}
          data-url="https://private.example/account"
          value="secret-form-value"
        >
          Refresh private account for Alice
        </button>
      )
    }

    render(<Harness />)
    fireEvent.click(screen.getByRole("button"))

    expect(trackStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("does not track disabled controlled actions", async () => {
    const { useProductAnalyticsActionTracking } = await import(
      "~/hooks/useProductAnalyticsActionTracking"
    )

    function Harness() {
      const analytics = useProductAnalyticsActionTracking({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        disabled: true,
      })

      return <button {...analytics.getActionTrackingProps()}>Refresh</button>
    }

    render(<Harness />)
    fireEvent.click(screen.getByRole("button"))

    expect(trackStartedMock).not.toHaveBeenCalled()
  })

  it("resolves an action id from the nearest product analytics scope", async () => {
    const { useProductAnalyticsActionTracking } = await import(
      "~/hooks/useProductAnalyticsActionTracking"
    )

    function Harness() {
      const analytics = useProductAnalyticsActionTracking({
        analyticsAction: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
      })

      return <button {...analytics.getActionTrackingProps()}>Refresh</button>
    }

    render(
      <ProductAnalyticsScope
        entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
        featureId={PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement}
        surfaceId={
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions
        }
      >
        <Harness />
      </ProductAnalyticsScope>,
    )
    fireEvent.click(screen.getByRole("button"))

    expect(trackStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("lets action object fields override the current product analytics scope", async () => {
    const { useProductAnalyticsActionTracking } = await import(
      "~/hooks/useProductAnalyticsActionTracking"
    )

    function Harness() {
      const analytics = useProductAnalyticsActionTracking({
        analyticsAction: {
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunQuickCheckin,
        },
      })

      return <button {...analytics.getActionTrackingProps()}>Run</button>
    }

    render(
      <ProductAnalyticsScope
        entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
        featureId={PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement}
        surfaceId={
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions
        }
      >
        <Harness />
      </ProductAnalyticsScope>,
    )
    fireEvent.click(screen.getByRole("button"))

    expect(trackStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunQuickCheckin,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("does not track when scoped action required fields cannot be resolved", async () => {
    const { useProductAnalyticsActionTracking } = await import(
      "~/hooks/useProductAnalyticsActionTracking"
    )

    function Harness() {
      const analytics = useProductAnalyticsActionTracking({
        analyticsAction: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
      })

      return <button {...analytics.getActionTrackingProps()}>Refresh</button>
    }

    render(
      <ProductAnalyticsScope
        featureId={PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement}
      >
        <Harness />
      </ProductAnalyticsScope>,
    )
    fireEvent.click(screen.getByRole("button"))

    expect(trackStartedMock).not.toHaveBeenCalled()
  })
})
