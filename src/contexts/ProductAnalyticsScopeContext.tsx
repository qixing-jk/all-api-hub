import { createContext, useContext, type ReactNode } from "react"

import type {
  ProductAnalyticsEntrypoint,
  ProductAnalyticsFeatureId,
  ProductAnalyticsSurfaceId,
} from "~/services/productAnalytics/events"

type ProductAnalyticsScopeValue = {
  entrypoint?: ProductAnalyticsEntrypoint
  featureId?: ProductAnalyticsFeatureId
  surfaceId?: ProductAnalyticsSurfaceId
}

type ProductAnalyticsScopeProps = ProductAnalyticsScopeValue & {
  children: ReactNode
}

const ProductAnalyticsScopeContext = createContext<ProductAnalyticsScopeValue>(
  {},
)

/**
 * Provides scoped product analytics metadata to descendant action handlers.
 */
export function ProductAnalyticsScope({
  children,
  entrypoint,
  featureId,
  surfaceId,
}: ProductAnalyticsScopeProps) {
  const parentScope = useContext(ProductAnalyticsScopeContext)
  const value: ProductAnalyticsScopeValue = {
    ...parentScope,
    ...(entrypoint === undefined ? {} : { entrypoint }),
    ...(featureId === undefined ? {} : { featureId }),
    ...(surfaceId === undefined ? {} : { surfaceId }),
  }

  return (
    <ProductAnalyticsScopeContext.Provider value={value}>
      {children}
    </ProductAnalyticsScopeContext.Provider>
  )
}

/**
 * Returns the nearest merged product analytics scope metadata.
 */
export function useProductAnalyticsScope(): ProductAnalyticsScopeValue {
  return useContext(ProductAnalyticsScopeContext)
}
