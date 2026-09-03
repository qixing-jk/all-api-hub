import type { AutoDetectErrorCode } from "~/constants/autoDetect"
import { AUTO_DETECT_ERROR_CODES } from "~/constants/autoDetect"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import {
  completeAutoDetectedAccount,
  getAutoDetectCompletionFailureReason,
} from "~/services/accounts/autoDetectCompletion/completion"
import {
  analyzeAutoDetectError,
  AUTO_DETECT_FAILURE_REASONS,
  AutoDetectErrorType,
  getAutoDetectErrorByCode,
  type AutoDetectAnalyticsContext,
  type AutoDetectFailureReason,
} from "~/services/accounts/utils/autoDetectUtils"
import { isCanonicalOpenRouterUrl } from "~/services/accountSiteDefinitions/identifiers"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { autoDetectSmart } from "~/services/siteDetection/autoDetectService"
import { type AuthTypeEnum } from "~/types"
import type { AccountAutoDetectResponse } from "~/types/serviceResponse"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

const logger = createLogger("AccountOperations")

/** Pins analytics metadata to the final site type selected for account handling. */
function withFinalAutoDetectSiteType(
  autoDetectContext: AutoDetectAnalyticsContext | undefined,
  siteType: AccountSiteType,
): AutoDetectAnalyticsContext {
  return {
    ...(autoDetectContext ?? {}),
    siteType,
  }
}

/** Maps machine-readable auto-detect service errors into analytics-safe failure reasons. */
function getAutoDetectFailureReasonByErrorCode(
  errorCode?: AutoDetectErrorCode,
): AutoDetectFailureReason | undefined {
  switch (errorCode) {
    case AUTO_DETECT_ERROR_CODES.CURRENT_TAB_CONTENT_SCRIPT_UNAVAILABLE:
      return AUTO_DETECT_FAILURE_REASONS.CurrentTabContentScriptUnavailable
    case AUTO_DETECT_ERROR_CODES.SITE_TYPE_DETECTION_FAILED:
      return AUTO_DETECT_FAILURE_REASONS.SiteTypeDetectionFailed
    default:
      return undefined
  }
}

/** Returns local user-facing guidance for known completion failures. */
function getAutoDetectCompletionFailureMessage(
  reason: AutoDetectFailureReason,
  fallbackErrorMessage: string,
) {
  switch (reason) {
    case AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed:
    case AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing:
      return t("messages:operations.detection.getAccessTokenFailedDetailed")
    case AUTO_DETECT_FAILURE_REASONS.SiteStatusFetchFailed:
      return t("messages:operations.detection.getSiteStatusFailedDetailed")
    case AUTO_DETECT_FAILURE_REASONS.UsernameMissing:
      return t("messages:operations.detection.getUsernameFailedDetailed")
    default:
      return t("accountDialog:messages.autoDetectFailed", {
        error: fallbackErrorMessage,
      })
  }
}

/** Preserves invalid-response details for completion validation failures. */
function getAutoDetectCompletionDetailedError(
  error: unknown,
  reason: AutoDetectFailureReason,
  message: string,
) {
  switch (reason) {
    case AUTO_DETECT_FAILURE_REASONS.UsernameMissing:
    case AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing:
      return {
        type: AutoDetectErrorType.INVALID_RESPONSE,
        message,
      }
    default:
      return analyzeAutoDetectError(error)
  }
}

/** Builds an OpenRouter failure response from controlled local copy only. */
function getControlledOpenRouterFailure(
  message: string,
  reason: AutoDetectFailureReason,
) {
  return {
    message,
    detailedError: {
      ...getAutoDetectCompletionDetailedError(message, reason, message),
      message,
    },
  }
}

/** Returns local manual-entry guidance without exposing OpenRouter detection details. */
function getOpenRouterReadOnlyDetectionFailure(
  reason: AutoDetectFailureReason,
) {
  return getControlledOpenRouterFailure(
    t("messages:openrouter.managementKeyRequired"),
    reason,
  )
}

/** Detects account information using the available browser and API strategies. */
export async function autoDetectAccount(
  url: string,
  authType: AuthTypeEnum,
  protectionBypassExecution?: ProtectionBypassExecution,
  cookieAuthSessionCookie?: string,
): Promise<AccountAutoDetectResponse> {
  if (!url.trim()) {
    return {
      kind: "detected",
      success: false,
      message: t("messages:errors.validation.urlRequired"),
    }
  }

  let autoDetectContext: AutoDetectAnalyticsContext | undefined
  const normalizedUrl = url.trim()
  const isCanonicalOpenRouter = isCanonicalOpenRouterUrl(normalizedUrl)

  try {
    try {
      await sendRuntimeMessage({
        action: RuntimeActionIds.CookieInterceptorTrackUrl,
        url: normalizedUrl,
      })
    } catch (error) {
      logger.warn(
        "Failed to track cookie interceptor url",
        isCanonicalOpenRouter
          ? {
              siteType: SITE_TYPES.OPENROUTER,
              status: "tracking_failed",
            }
          : {
              url: normalizedUrl,
              error: getErrorMessage(error),
            },
      )
    }

    const detectResult = await autoDetectSmart(
      normalizedUrl,
      protectionBypassExecution,
    )
    autoDetectContext = detectResult.autoDetectContext

    if (!detectResult.success || !detectResult.data) {
      const autoDetectFailureReason =
        getAutoDetectFailureReasonByErrorCode(detectResult.errorCode) ??
        AUTO_DETECT_FAILURE_REASONS.UserDataMissing

      if (isCanonicalOpenRouter) {
        return {
          kind: "detected",
          success: false,
          ...getOpenRouterReadOnlyDetectionFailure(autoDetectFailureReason),
          autoDetectContext,
          autoDetectFailureReason,
        }
      }

      const errorMsg =
        detectResult.error || t("messages:operations.detection.failed")
      const detailedError =
        getAutoDetectErrorByCode(detectResult.errorCode) ??
        analyzeAutoDetectError(errorMsg)
      return {
        kind: "detected",
        success: false,
        message: detailedError.message || errorMsg,
        detailedError,
        autoDetectContext,
        autoDetectFailureReason,
      }
    }

    const { userId, siteType } = detectResult.data
    autoDetectContext = withFinalAutoDetectSiteType(
      detectResult.autoDetectContext,
      siteType,
    )

    if (!userId) {
      return {
        kind: "detected",
        success: false,
        message: t("messages:operations.detection.getUserIdFailedDetailed"),
        detailedError: {
          type: AutoDetectErrorType.INVALID_RESPONSE,
          message: t("messages:operations.detection.getUserIdFailedDetailed"),
        },
        autoDetectContext,
        autoDetectFailureReason: AUTO_DETECT_FAILURE_REASONS.UserIdMissing,
      }
    }

    const completed = await completeAutoDetectedAccount({
      url: normalizedUrl,
      requestedAuthType: authType,
      cookieAuthSessionCookie,
      detected: detectResult.data,
      autoDetectContext,
      protectionBypassExecution,
    })

    return {
      kind: "detected",
      success: true,
      message: t("accountDialog:messages.autoDetectSuccess"),
      data: completed,
    }
  } catch (error) {
    const autoDetectFailureReason = getAutoDetectCompletionFailureReason(error)

    if (isCanonicalOpenRouter) {
      const failure = getOpenRouterReadOnlyDetectionFailure(
        autoDetectFailureReason,
      )
      logger.error("OpenRouter account detection failed", {
        siteType: SITE_TYPES.OPENROUTER,
        status: "failed",
        reason: autoDetectFailureReason,
      })
      return {
        kind: "detected",
        success: false,
        ...failure,
        autoDetectContext,
        autoDetectFailureReason,
      }
    }

    const errorMessage = getErrorMessage(error)
    const message = getAutoDetectCompletionFailureMessage(
      autoDetectFailureReason,
      errorMessage,
    )
    logger.error(
      t("messages:autodetect.failed", { error: errorMessage }),
      error,
    )
    const detailedError = getAutoDetectCompletionDetailedError(
      error,
      autoDetectFailureReason,
      message,
    )
    return {
      kind: "detected",
      success: false,
      message,
      detailedError,
      autoDetectContext,
      autoDetectFailureReason,
    }
  }
}
