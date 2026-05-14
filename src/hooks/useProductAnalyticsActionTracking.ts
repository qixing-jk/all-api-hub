import { useCallback, type MouseEventHandler } from "react"

import { useProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import {
  resolveProductAnalyticsActionContext,
  type ProductAnalyticsActionContext,
  type ProductAnalyticsScopedActionConfig,
} from "~/services/productAnalytics/actionConfig"
import { trackProductAnalyticsActionStarted } from "~/services/productAnalytics/actions"
import type { ProductAnalyticsActionId } from "~/services/productAnalytics/events"

type ProductAnalyticsActionTrackingParams = {
  analyticsAction?: ProductAnalyticsScopedActionConfig
  featureId?: ProductAnalyticsActionContext["featureId"]
  actionId?: ProductAnalyticsActionId
  surfaceId?: ProductAnalyticsActionContext["surfaceId"]
  entrypoint?: ProductAnalyticsActionContext["entrypoint"]
  disabled?: boolean
}

type ProductAnalyticsActionTrackingProps = {
  onClick: MouseEventHandler
}

/**
 * Provides controlled click analytics without reading DOM text, URLs, or form values.
 */
export function useProductAnalyticsActionTracking({
  analyticsAction,
  featureId,
  actionId,
  surfaceId,
  entrypoint,
  disabled = false,
}: ProductAnalyticsActionTrackingParams) {
  const scope = useProductAnalyticsScope()

  const handleClick = useCallback<MouseEventHandler>(() => {
    if (disabled) return

    const resolvedAction = resolveProductAnalyticsActionContext(
      analyticsAction ??
        (actionId
          ? {
              featureId,
              actionId,
              surfaceId,
              entrypoint,
            }
          : undefined),
      scope,
    )

    if (!resolvedAction) return

    void trackProductAnalyticsActionStarted(resolvedAction)
  }, [
    actionId,
    analyticsAction,
    disabled,
    entrypoint,
    featureId,
    scope,
    surfaceId,
  ])

  const getActionTrackingProps =
    useCallback((): ProductAnalyticsActionTrackingProps => {
      return {
        onClick: handleClick,
      }
    }, [handleClick])

  return { getActionTrackingProps }
}
