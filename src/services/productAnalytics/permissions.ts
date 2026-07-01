import {
  OPTIONAL_PERMISSION_IDS,
  type ManifestOptionalPermissions,
} from "~/services/permissions/permissionManager"

import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS,
  PRODUCT_ANALYTICS_PERMISSION_IDS,
  PRODUCT_ANALYTICS_PERMISSION_OPERATIONS,
  PRODUCT_ANALYTICS_PERMISSION_OUTCOMES,
  PRODUCT_ANALYTICS_RESULTS,
  type ProductAnalyticsPermissionFailureReason,
  type ProductAnalyticsPermissionId,
  type ProductAnalyticsPermissionOperation,
  type ProductAnalyticsPermissionOutcome,
} from "./contracts"
import { trackProductAnalyticsEvent } from "./dispatch"

const PRODUCT_ANALYTICS_PERMISSION_ID_BY_OPTIONAL_PERMISSION: Record<
  ManifestOptionalPermissions,
  ProductAnalyticsPermissionId
> = {
  [OPTIONAL_PERMISSION_IDS.Cookies]: PRODUCT_ANALYTICS_PERMISSION_IDS.Cookies,
  [OPTIONAL_PERMISSION_IDS.declarativeNetRequestWithHostAccess]:
    PRODUCT_ANALYTICS_PERMISSION_IDS.DeclarativeNetRequestWithHostAccess,
  [OPTIONAL_PERMISSION_IDS.WebRequest]:
    PRODUCT_ANALYTICS_PERMISSION_IDS.WebRequest,
  [OPTIONAL_PERMISSION_IDS.WebRequestBlocking]:
    PRODUCT_ANALYTICS_PERMISSION_IDS.WebRequestBlocking,
  [OPTIONAL_PERMISSION_IDS.ClipboardRead]:
    PRODUCT_ANALYTICS_PERMISSION_IDS.ClipboardRead,
  [OPTIONAL_PERMISSION_IDS.Notifications]:
    PRODUCT_ANALYTICS_PERMISSION_IDS.Notifications,
  [OPTIONAL_PERMISSION_IDS.Bookmarks]:
    PRODUCT_ANALYTICS_PERMISSION_IDS.Bookmarks,
}

/**
 * Reports an optional browser permission request/removal outcome without action-specific context.
 */
export function trackOptionalPermissionResult(
  permissionId: ManifestOptionalPermissions,
  params: {
    operation: ProductAnalyticsPermissionOperation
    outcome: ProductAnalyticsPermissionOutcome
    failureReason?: ProductAnalyticsPermissionFailureReason
    wasGrantedBefore: boolean
    wasGrantedAfter: boolean
  },
) {
  void trackProductAnalyticsEvent(PRODUCT_ANALYTICS_EVENTS.PermissionResult, {
    permission_id:
      PRODUCT_ANALYTICS_PERMISSION_ID_BY_OPTIONAL_PERMISSION[permissionId],
    result: getPermissionAnalyticsResult(
      params.outcome === PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.Granted ||
        params.outcome === PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.Revoked,
    ),
    operation: params.operation,
    outcome: params.outcome,
    ...(params.failureReason ? { failure_reason: params.failureReason } : {}),
    was_granted_before: params.wasGrantedBefore,
    was_granted_after: params.wasGrantedAfter,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  })
}

/**
 * Reports an optional browser permission request outcome using the shared taxonomy.
 */
export function trackOptionalPermissionRequestResult(
  permissionId: ManifestOptionalPermissions,
  params: {
    success: boolean
    failureReason?: unknown
    wasGrantedBefore: boolean
    wasGrantedAfter: boolean
  },
) {
  trackOptionalPermissionResult(permissionId, {
    operation: PRODUCT_ANALYTICS_PERMISSION_OPERATIONS.Request,
    outcome: params.failureReason
      ? PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.ApiError
      : getPermissionRequestOutcome(params.success),
    failureReason: params.failureReason
      ? PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS.ApiException
      : params.success
        ? undefined
        : PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS.UserDenied,
    wasGrantedBefore: params.wasGrantedBefore,
    wasGrantedAfter: params.wasGrantedAfter,
  })
}

/**
 * Converts a browser permission boolean outcome into the shared analytics result enum.
 */
function getPermissionAnalyticsResult(success: boolean) {
  return success
    ? PRODUCT_ANALYTICS_RESULTS.Success
    : PRODUCT_ANALYTICS_RESULTS.Failure
}

/**
 * Converts a permission request boolean into a user-facing permission outcome.
 */
function getPermissionRequestOutcome(success: boolean) {
  return success
    ? PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.Granted
    : PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.Denied
}

/**
 * Converts a permission removal boolean into a revocation outcome.
 */
export function getPermissionRemoveOutcome(success: boolean) {
  return success
    ? PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.Revoked
    : PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.RevokeFailed
}

export {
  PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS,
  PRODUCT_ANALYTICS_PERMISSION_OPERATIONS,
  PRODUCT_ANALYTICS_PERMISSION_OUTCOMES,
}
