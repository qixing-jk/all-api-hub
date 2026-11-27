import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import { isAccountSiteType } from "~/constants/siteType"
import type { OpenRouterOnboardingStart } from "~/features/AccountManagement/components/AccountDialog/form/useOpenRouterAccountOnboarding"
import type { autoDetectAccount } from "~/services/accounts/accountAutoDetection"
import {
  AutoDetectErrorType,
  isIdentityKnownAutoDetectFailureReason,
} from "~/services/accounts/utils/autoDetectUtils"
import { inspectAccountCheckIn } from "~/services/checkin/autoCheckin/discovery/inspection"
import { getAutoCheckinCandidateMethodIds } from "~/services/checkin/autoCheckin/providers/registry"
import {
  resolveProductAnalyticsErrorCategoryFromError,
  type ProductAnalyticsActionCompleteOptions,
  type ProductAnalyticsActionInsights,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_CHECK_IN_DISCOVERY_TRIGGER_IDS,
  PRODUCT_ANALYTICS_CHECK_IN_SELECTION_SOURCE_IDS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SITE_TYPES,
  type ProductAnalyticsErrorCategory,
  type ProductAnalyticsSiteType,
} from "~/services/productAnalytics/contracts"
import { buildActionFailureDiagnostics } from "~/services/productAnalytics/diagnostics/diagnosticsError"
import type { AuthTypeEnum } from "~/types"

export type AccountDetectionAnalyticsResult =
  | Awaited<ReturnType<typeof autoDetectAccount>>
  | Awaited<ReturnType<OpenRouterOnboardingStart>>

/** Maps detection evidence to coarse, approved analytics insights. */
export function buildAutoDetectAnalyticsInsights(
  {
    mode,
    isDetected,
    authType,
    url,
  }: {
    mode: DialogMode
    isDetected: boolean
    authType: AuthTypeEnum
    url: string
  },
  result?: AccountDetectionAnalyticsResult,
  fallbackUsed = false,
): ProductAnalyticsActionInsights {
  const checkInDiscoveryTrigger =
    mode === DIALOG_MODES.EDIT || isDetected
      ? PRODUCT_ANALYTICS_CHECK_IN_DISCOVERY_TRIGGER_IDS.Redetect
      : PRODUCT_ANALYTICS_CHECK_IN_DISCOVERY_TRIGGER_IDS.InitialDetection
  const resultData = result && "data" in result ? result.data : undefined
  const autoDetectContext =
    result && "autoDetectContext" in result
      ? (result.autoDetectContext ?? resultData?.autoDetectContext)
      : resultData?.autoDetectContext
  const candidateSiteType =
    result && "siteType" in result
      ? result.siteType
      : (resultData?.siteType ?? autoDetectContext?.siteType)
  const analyticsSiteType = isProductAnalyticsSiteType(candidateSiteType)
    ? candidateSiteType
    : undefined
  const attemptOutcome =
    result && "attemptOutcome" in result ? result.attemptOutcome : undefined
  const checkInSiteType =
    resultData && isAccountSiteType(candidateSiteType)
      ? candidateSiteType
      : undefined
  const candidateMethodIds = checkInSiteType
    ? getAutoCheckinCandidateMethodIds(checkInSiteType, url)
    : []
  const checkInInspection =
    resultData && checkInSiteType
      ? inspectAccountCheckIn({
          config: resultData.checkIn,
          siteType: checkInSiteType,
          siteUrl: url,
        })
      : undefined

  return {
    requestedAuthMode: authType,
    fallbackUsed,
    ...(result &&
    "autoDetectFailureReason" in result &&
    result.success === false
      ? {
          accountAutoDetectIdentityDetected:
            isIdentityKnownAutoDetectFailureReason(
              result.autoDetectFailureReason,
            ),
        }
      : {}),
    ...(checkInInspection
      ? {
          checkInDiscoveryTrigger,
          checkInDiscoveryDecision: checkInInspection.decision.outcome,
          checkInCandidateCount: candidateMethodIds.length,
          checkInSelectionSource: resultData?.checkIn.selection.methodId
            ? resultData.checkIn.selection.mode
            : PRODUCT_ANALYTICS_CHECK_IN_SELECTION_SOURCE_IDS.None,
        }
      : {}),
    ...(attemptOutcome
      ? { accountAutoDetectAttemptOutcome: attemptOutcome }
      : {}),
    ...(autoDetectContext?.strategy
      ? { autoDetectStrategy: autoDetectContext.strategy }
      : {}),
    ...(autoDetectContext?.fetchContextKind
      ? { fetchContextKind: autoDetectContext.fetchContextKind }
      : {}),
    ...(typeof autoDetectContext?.incognitoContextUsed === "boolean"
      ? {
          incognitoContextUsed: autoDetectContext.incognitoContextUsed,
        }
      : {}),
    ...(typeof autoDetectContext?.currentTabMatched === "boolean"
      ? {
          currentTabMatched: autoDetectContext.currentTabMatched,
        }
      : {}),
    ...(analyticsSiteType ? { siteType: analyticsSiteType } : {}),
  }
}

/** Expected verification carries recovery evidence without failure diagnostics. */
export function buildAutoDetectFailureCompletion(
  result: Awaited<ReturnType<typeof autoDetectAccount>>,
  insights: ProductAnalyticsActionInsights,
) {
  const requiresVerification =
    result.autoDetectFailureReason ===
    AUTO_DETECT_FAILURE_REASONS.AccessTokenVerificationRequired
  const reason = result.autoDetectFailureReason
    ? { accountAutoDetectFailureReason: result.autoDetectFailureReason }
    : {}
  const options: ProductAnalyticsActionCompleteOptions = {
    insights: { ...insights, ...reason },
  }
  if (!requiresVerification) {
    options.diagnostics = {
      failure: {
        ...buildActionFailureDiagnostics({
          errorCategory: getAutoDetectAnalyticsErrorCategory(
            result.detailedError?.type,
          ),
          stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Detection,
          reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
        }),
        ...reason,
      },
    }
  }
  return {
    result: requiresVerification
      ? PRODUCT_ANALYTICS_RESULTS.ActionRequired
      : PRODUCT_ANALYTICS_RESULTS.Failure,
    options,
  }
}

/** Maps detection errors onto safe analytics categories. */
export function getAutoDetectAnalyticsErrorCategory(
  errorType?: AutoDetectErrorType,
  structuredError?: unknown,
): ProductAnalyticsErrorCategory {
  switch (errorType) {
    case AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED:
    case AutoDetectErrorType.COOKIE_SESSION_REJECTED:
    case AutoDetectErrorType.UNAUTHORIZED:
    case AutoDetectErrorType.FORBIDDEN:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth
    case AutoDetectErrorType.RATE_LIMITED:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.RateLimit
    case AutoDetectErrorType.TIMEOUT:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Timeout
    case AutoDetectErrorType.NETWORK_ERROR:
    case AutoDetectErrorType.SERVER_ERROR:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network
    case AutoDetectErrorType.INVALID_RESPONSE:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation
    case AutoDetectErrorType.NOT_FOUND:
    case AutoDetectErrorType.CURRENT_TAB_RELOAD_REQUIRED:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported
    case AutoDetectErrorType.UNKNOWN:
    default:
      if (structuredError !== undefined) {
        return resolveProductAnalyticsErrorCategoryFromError(structuredError)
      }
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
  }
}

/**
 * Checks whether a detected site type is accepted by the analytics whitelist.
 */
function isProductAnalyticsSiteType(
  value: unknown,
): value is ProductAnalyticsSiteType {
  return (
    typeof value === "string" &&
    (PRODUCT_ANALYTICS_SITE_TYPES as readonly string[]).includes(value)
  )
}
