import {
  OPTIONAL_PERMISSION_IDS,
  type ManifestOptionalPermissions,
} from "~/services/permissions/permissionManager"

import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_PERMISSION_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  trackProductAnalyticsEvent,
  type ProductAnalyticsPermissionId,
  type ProductAnalyticsResult,
} from "./events"

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
}

/**
 * Reports an optional browser permission request/removal outcome without action-specific context.
 */
export function trackOptionalPermissionResult(
  permissionId: ManifestOptionalPermissions,
  result: ProductAnalyticsResult,
) {
  void trackProductAnalyticsEvent(PRODUCT_ANALYTICS_EVENTS.PermissionResult, {
    permission_id:
      PRODUCT_ANALYTICS_PERMISSION_ID_BY_OPTIONAL_PERMISSION[permissionId],
    result,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  })
}

/**
 * Converts a browser permission boolean outcome into the shared analytics result enum.
 */
export function getPermissionAnalyticsResult(success: boolean) {
  return success
    ? PRODUCT_ANALYTICS_RESULTS.Success
    : PRODUCT_ANALYTICS_RESULTS.Failure
}
