import type { PreferenceWriteFailure } from "~/services/preferences/userPreferences"
import {
  resolveProductAnalyticsErrorCategoryFromError,
  type ProductAnalyticsActionContext,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"

export const webDavSettingsSurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsWebDavSettings

/**
 * Wraps failures from local WebDAV settings persistence so analytics can
 * distinguish save-before-action failures from remote WebDAV execution.
 */
export class PersistWebdavConfigError extends Error {
  readonly preferenceFailure?: PreferenceWriteFailure

  constructor(cause?: unknown, options?: { failure?: PreferenceWriteFailure }) {
    super("Failed to persist WebDAV settings", { cause })
    this.name = "PersistWebdavConfigError"
    this.preferenceFailure = options?.failure
    ;(this as Error & { cause?: unknown }).cause = cause
  }
}

export const webDavAnalyticsContext = (
  actionId:
    | typeof PRODUCT_ANALYTICS_ACTION_IDS.DecryptImportWebDavBackup
    | typeof PRODUCT_ANALYTICS_ACTION_IDS.DownloadImportWebDavBackup
    | typeof PRODUCT_ANALYTICS_ACTION_IDS.UpdateWebDavConfig
    | typeof PRODUCT_ANALYTICS_ACTION_IDS.UploadWebDavBackup
    | typeof PRODUCT_ANALYTICS_ACTION_IDS.VerifyWebDavConnection,
  surfaceId: ProductAnalyticsActionContext["surfaceId"] = webDavSettingsSurface,
): ProductAnalyticsActionContext => ({
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebDavSync,
  actionId,
  surfaceId,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
})

/** Classify WebDAV validation failures without exposing raw error details. */
export function getWebdavAnalyticsErrorCategory(error: unknown) {
  if (error instanceof PersistWebdavConfigError) {
    return error.cause
      ? resolveProductAnalyticsErrorCategoryFromError(error.cause)
      : PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
  }

  return resolveProductAnalyticsErrorCategoryFromError(error)
}

/** Classify which WebDAV phase failed without exposing raw connection details. */
export function getWebdavAnalyticsFailureStage(error: unknown) {
  if (error instanceof PersistWebdavConfigError) {
    return PRODUCT_ANALYTICS_FAILURE_STAGES.Persist
  }

  return PRODUCT_ANALYTICS_FAILURE_STAGES.Execute
}
