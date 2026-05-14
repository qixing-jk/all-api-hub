import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  ProductAnalyticsScope,
  useProductAnalyticsScope,
} from "~/contexts/ProductAnalyticsScopeContext"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"

function ScopeProbe() {
  const scope = useProductAnalyticsScope()

  return <div data-testid="scope">{JSON.stringify(scope)}</div>
}

describe("ProductAnalyticsScope", () => {
  it("merges parent entrypoint with child feature and surface", () => {
    render(
      <ProductAnalyticsScope entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}>
        <ProductAnalyticsScope
          featureId={PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement}
          surfaceId={PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage}
        >
          <ScopeProbe />
        </ProductAnalyticsScope>
      </ProductAnalyticsScope>,
    )

    expect(screen.getByTestId("scope")).toHaveTextContent(
      JSON.stringify({
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
      }),
    )
  })

  it("lets child scopes override parent fields", () => {
    render(
      <ProductAnalyticsScope
        entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Popup}
        featureId={PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement}
      >
        <ProductAnalyticsScope
          entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Sidepanel}
          featureId={PRODUCT_ANALYTICS_FEATURE_IDS.UsageAnalytics}
        >
          <ScopeProbe />
        </ProductAnalyticsScope>
      </ProductAnalyticsScope>,
    )

    expect(screen.getByTestId("scope")).toHaveTextContent(
      JSON.stringify({
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Sidepanel,
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.UsageAnalytics,
      }),
    )
  })
})
