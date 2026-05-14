import {
  type ProductAnalyticsActionId,
  type ProductAnalyticsEntrypoint,
  type ProductAnalyticsFeatureId,
  type ProductAnalyticsSurfaceId,
} from "~/services/productAnalytics/events"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ProductAnalyticsActionConfig")

export type ProductAnalyticsActionContext = {
  featureId: ProductAnalyticsFeatureId
  actionId: ProductAnalyticsActionId
  surfaceId?: ProductAnalyticsSurfaceId
  entrypoint: ProductAnalyticsEntrypoint
}

export type ProductAnalyticsScopedActionConfig =
  | ProductAnalyticsActionId
  | {
      featureId?: ProductAnalyticsFeatureId
      feature_id?: ProductAnalyticsFeatureId
      actionId?: ProductAnalyticsActionId
      action_id?: ProductAnalyticsActionId
      surfaceId?: ProductAnalyticsSurfaceId
      surface_id?: ProductAnalyticsSurfaceId
      entrypoint?: ProductAnalyticsEntrypoint
    }

type ProductAnalyticsActionScope = Partial<
  Pick<ProductAnalyticsActionContext, "featureId" | "surfaceId" | "entrypoint">
>

type NormalizedProductAnalyticsScopedActionConfig =
  Partial<ProductAnalyticsActionContext>

/**
 * Resolves a scoped analytics action into the existing camelCase action context.
 */
export function resolveProductAnalyticsActionContext(
  analyticsAction: ProductAnalyticsScopedActionConfig | undefined,
  scope: ProductAnalyticsActionScope,
): ProductAnalyticsActionContext | undefined {
  if (!analyticsAction) return undefined

  const scopedAction: NormalizedProductAnalyticsScopedActionConfig =
    typeof analyticsAction === "string"
      ? { actionId: analyticsAction }
      : normalizeScopedActionConfig(analyticsAction)

  const featureId = scopedAction.featureId ?? scope.featureId
  const actionId = scopedAction.actionId
  const surfaceId = scopedAction.surfaceId ?? scope.surfaceId
  const entrypoint = scopedAction.entrypoint ?? scope.entrypoint

  if (!featureId || !actionId || !entrypoint) {
    logUnresolvedScopedAction()
    return undefined
  }

  return {
    featureId,
    actionId,
    surfaceId,
    entrypoint,
  }
}

/**
 * Accepts legacy snake_case config fields only at the resolver boundary.
 */
function normalizeScopedActionConfig(
  analyticsAction: Exclude<ProductAnalyticsScopedActionConfig, string>,
): NormalizedProductAnalyticsScopedActionConfig {
  return {
    featureId: analyticsAction.featureId ?? analyticsAction.feature_id,
    actionId: analyticsAction.actionId ?? analyticsAction.action_id,
    surfaceId: analyticsAction.surfaceId ?? analyticsAction.surface_id,
    entrypoint: analyticsAction.entrypoint,
  }
}

/**
 * Emits a development-only diagnostic when a provided action is incomplete.
 */
function logUnresolvedScopedAction() {
  if (import.meta.env.DEV) {
    logger.debug("Product analytics action config could not be resolved")
  }
}
