import type { AutoDetectErrorCode } from "~/constants/autoDetect"
import { AUTO_DETECT_ERROR_CODES } from "~/constants/autoDetect"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { isAccountSiteType, type AccountSiteType } from "~/constants/siteType"
import {
  findSavedAccountAccessTokens,
  getExistingAccountAccessToken,
  type AccountAutoDetectExistingAccount,
} from "~/services/accounts/autoDetect/existingCredentials"
import {
  createDetectedAccountRecoveryData,
  mergeAccountAutoDetectRecoveryData,
  type AccountAutoDetectRecoveryData,
} from "~/services/accounts/autoDetect/recovery"
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
import type { AccountDetectionPrivacyPolicy } from "~/services/accountSiteOnboarding/contracts"
import { getAccountDetectionPrivacyPolicy } from "~/services/accountSiteOnboarding/registry"
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
    case AUTO_DETECT_FAILURE_REASONS.AccessTokenVerificationRequired:
      return t("accountDialog:accessTokenVerification.description")
    case AUTO_DETECT_FAILURE_REASONS.AccountIdentityMismatch:
      return t("accountDialog:messages.autoDetectIdentityMismatch")
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
    case AUTO_DETECT_FAILURE_REASONS.AccessTokenVerificationRequired:
      return {
        type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
        message,
      }
    case AUTO_DETECT_FAILURE_REASONS.UsernameMissing:
    case AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing:
    case AUTO_DETECT_FAILURE_REASONS.AccountIdentityMismatch:
      return {
        type: AutoDetectErrorType.INVALID_RESPONSE,
        message,
      }
    default:
      return analyzeAutoDetectError(error)
  }
}

/** Builds a failure from provider-owned local copy, excluding upstream details. */
function getPrivateDetectionFailure(
  policy: AccountDetectionPrivacyPolicy,
  reason: AutoDetectFailureReason,
) {
  const message = policy.getFailureMessage()
  return {
    message,
    detailedError: {
      ...getAutoDetectCompletionDetailedError(message, reason, message),
      message,
    },
  }
}

/** Detects account information using the available browser and API strategies. */
export async function autoDetectAccount(
  url: string,
  authType: AuthTypeEnum,
  protectionBypassExecution?: ProtectionBypassExecution,
  cookieAuthSessionCookie?: string,
  options?: { existingAccount?: AccountAutoDetectExistingAccount },
): Promise<AccountAutoDetectResponse> {
  if (!url.trim()) {
    return {
      kind: "detected",
      success: false,
      message: t("messages:errors.validation.urlRequired"),
    }
  }

  const normalizedUrl = url.trim()
  const detectionPrivacy = getAccountDetectionPrivacyPolicy(normalizedUrl)
  let autoDetectContext: AutoDetectAnalyticsContext | undefined
  let recoveryData: AccountAutoDetectRecoveryData | undefined = {
    ...(detectionPrivacy ? { siteType: detectionPrivacy.siteType } : {}),
    authType,
    ...(cookieAuthSessionCookie?.trim()
      ? { cookieAuthSessionCookie: cookieAuthSessionCookie.trim() }
      : {}),
  }

  try {
    try {
      await sendRuntimeMessage({
        action: RuntimeActionIds.CookieInterceptorTrackUrl,
        url: normalizedUrl,
      })
    } catch (error) {
      logger.warn(
        "Failed to track cookie interceptor url",
        detectionPrivacy
          ? {
              siteType: detectionPrivacy.siteType,
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
    recoveryData = mergeAccountAutoDetectRecoveryData(
      recoveryData,
      isAccountSiteType(autoDetectContext?.siteType)
        ? { siteType: autoDetectContext.siteType }
        : undefined,
    )

    if (!detectResult.success || !detectResult.data) {
      const autoDetectFailureReason =
        getAutoDetectFailureReasonByErrorCode(detectResult.errorCode) ??
        AUTO_DETECT_FAILURE_REASONS.UserDataMissing

      if (detectionPrivacy) {
        return {
          kind: "detected",
          success: false,
          ...getPrivateDetectionFailure(
            detectionPrivacy,
            autoDetectFailureReason,
          ),
          autoDetectContext,
          autoDetectFailureReason,
          recoveryData,
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
        recoveryData,
      }
    }

    const { userId, siteType } = detectResult.data
    const existingAccessToken = userId
      ? getExistingAccountAccessToken(
          normalizedUrl,
          detectResult.data,
          options?.existingAccount,
        )
      : undefined
    recoveryData = mergeAccountAutoDetectRecoveryData(
      recoveryData,
      createDetectedAccountRecoveryData({
        detected: detectResult.data,
        requestedAuthType: authType,
        cookieAuthSessionCookie,
      }),
    )
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
        recoveryData,
      }
    }

    const completed = await completeAutoDetectedAccount({
      url: normalizedUrl,
      requestedAuthType: authType,
      existingAccessToken,
      loadSavedAccessTokens: () =>
        findSavedAccountAccessTokens(normalizedUrl, { userId, siteType }),
      cookieAuthSessionCookie,
      detected: detectResult.data,
      autoDetectContext,
      protectionBypassExecution,
      onRecoveryData(nextRecoveryData) {
        recoveryData = mergeAccountAutoDetectRecoveryData(
          recoveryData,
          nextRecoveryData,
        )
      },
    })

    return {
      kind: "detected",
      success: true,
      message: t("accountDialog:messages.autoDetectSuccess"),
      data: completed,
    }
  } catch (error) {
    const autoDetectFailureReason = getAutoDetectCompletionFailureReason(error)

    if (detectionPrivacy) {
      const failure = getPrivateDetectionFailure(
        detectionPrivacy,
        autoDetectFailureReason,
      )
      logger.error("Account detection failed", {
        siteType: detectionPrivacy.siteType,
        status: "failed",
        reason: autoDetectFailureReason,
      })
      return {
        kind: "detected",
        success: false,
        ...failure,
        autoDetectContext,
        autoDetectFailureReason,
        recoveryData,
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
      recoveryData,
    }
  }
}
