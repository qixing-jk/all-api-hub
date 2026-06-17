import {
  AUTO_DETECT_FAILURE_REASONS,
  type AutoDetectFailureReason,
} from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { getSiteName } from "~/services/accounts/siteName"
import { getApiService } from "~/services/apiService"
import {
  API_SERVICE_FETCH_CONTEXT_KINDS,
  type ApiServiceFetchContext,
  type ApiServiceRequest,
  type SiteStatusInfo,
} from "~/services/apiService/common/type"
import { AuthTypeEnum } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import {
  AutoDetectCompletionError,
  type AutoDetectCompletionData,
  type AutoDetectCompletionRequest,
  type DetectedAccountIdentity,
} from "./types"

export { AutoDetectCompletionError }

const logger = createLogger("AccountAutoDetectCompletion")

/**
 * Resolves the most specific auto-detect completion reason available for analytics.
 */
export function getAutoDetectCompletionFailureReason(
  error: unknown,
): AutoDetectFailureReason {
  return error instanceof AutoDetectCompletionError
    ? error.reason
    : AUTO_DETECT_FAILURE_REASONS.UnexpectedException
}

/**
 * Keeps only auto-detect fetch contexts that are safe to reuse in service calls.
 */
function getAutoDetectFetchContext(
  detected: DetectedAccountIdentity,
): ApiServiceFetchContext | undefined {
  const fetchContext = detected.fetchContext
  if (fetchContext?.kind === API_SERVICE_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT) {
    return fetchContext
  }

  if (fetchContext?.kind === API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB) {
    if (
      typeof fetchContext.tabId === "number" &&
      typeof fetchContext.origin === "string" &&
      fetchContext.origin.trim()
    ) {
      return fetchContext
    }
  }

  if (fetchContext?.incognito === true || fetchContext?.cookieStoreId) {
    return fetchContext
  }

  return undefined
}

/**
 * Builds the shared service request shape used by completion probes.
 */
function createAutoDetectApiRequest(params: {
  baseUrl: string
  auth: ApiServiceRequest["auth"]
  fetchContext?: ApiServiceFetchContext
}): ApiServiceRequest {
  return {
    baseUrl: params.baseUrl,
    auth: params.auth,
    ...(params.fetchContext ? { fetchContext: params.fetchContext } : {}),
  }
}

/**
 * Normalizes optional service and detected string fields.
 */
function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/**
 * Creates the persisted check-in shape used by auto-detected accounts.
 */
function createInitialCheckInConfig(
  isSub2Api: boolean,
  checkSupport: boolean | undefined,
) {
  return {
    enableDetection: isSub2Api ? false : checkSupport ?? false,
    autoCheckInEnabled: isSub2Api ? false : true,
    siteStatus: {
      isCheckedInToday: false,
    },
    customCheckIn: {
      url: "",
      redeemUrl: "",
      openRedeemWithCheckIn: true,
      isCheckedInToday: false,
    },
  }
}

/**
 * Completes a detected identity with service-backed token, status, and defaults.
 */
export async function completeAutoDetectedAccount(
  request: AutoDetectCompletionRequest,
): Promise<AutoDetectCompletionData> {
  const { url, requestedAuthType, detected, autoDetectContext } = request
  const { userId, siteType, sub2apiAuth } = detected
  const autoDetectFetchContext = getAutoDetectFetchContext(detected)
  const apiService = getApiService(siteType)
  const isSub2Api = siteType === SITE_TYPES.SUB2API
  const isAIHubMix = siteType === SITE_TYPES.AIHUBMIX
  const effectiveAuthType =
    isSub2Api || isAIHubMix ? AuthTypeEnum.AccessToken : requestedAuthType
  // AIHubMix imports through cookie-authenticated web endpoints, then stores
  // the retrieved account access token for all normal account/key/model APIs.
  const detectionAuthType = isAIHubMix ? AuthTypeEnum.Cookie : effectiveAuthType

  let tokenPromise: Promise<unknown>

  if (isSub2Api) {
    tokenPromise = Promise.resolve({
      username: trimString(detected.user?.username),
      access_token: trimString(detected.accessToken),
    })
  } else if (isAIHubMix && typeof detected.accessToken === "string") {
    tokenPromise = Promise.resolve({
      username: trimString(detected.user?.username),
      access_token: trimString(detected.accessToken),
    })
  } else if (effectiveAuthType === AuthTypeEnum.Cookie) {
    tokenPromise = apiService.fetchUserInfo(
      createAutoDetectApiRequest({
        baseUrl: url,
        fetchContext: autoDetectFetchContext,
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId,
        },
      }),
    )
  } else if (effectiveAuthType === AuthTypeEnum.AccessToken) {
    tokenPromise = apiService.getOrCreateAccessToken(
      createAutoDetectApiRequest({
        baseUrl: url,
        fetchContext: autoDetectFetchContext,
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId,
        },
      }),
    )
  } else {
    // Auto-detect does not normally route non-token completion with None auth;
    // if it does, the shared identity validation below classifies missing data.
    tokenPromise = Promise.resolve(null)
  }

  const fetchSiteStatusFallback = () =>
    apiService.fetchSiteStatus(
      createAutoDetectApiRequest({
        baseUrl: url,
        fetchContext: autoDetectFetchContext,
        auth: {
          authType: detectionAuthType || AuthTypeEnum.None,
        },
      }),
    )

  const siteStatusPromise: Promise<SiteStatusInfo | null> =
    fetchSiteStatusFallback()
  const classifiedSiteStatusPromise = siteStatusPromise.catch((error) => {
    throw new AutoDetectCompletionError(
      AUTO_DETECT_FAILURE_REASONS.SiteStatusFetchFailed,
      error,
    )
  })

  const fetchSupportCheckInFallback = () =>
    apiService.fetchSupportCheckIn(
      createAutoDetectApiRequest({
        baseUrl: url,
        fetchContext: autoDetectFetchContext,
        auth: {
          authType: AuthTypeEnum.None,
        },
      }),
    )

  const checkSupportPromise: Promise<boolean | undefined> =
    classifiedSiteStatusPromise.then((siteStatus) =>
      typeof siteStatus?.checkin_enabled === "boolean"
        ? siteStatus.checkin_enabled
        : fetchSupportCheckInFallback().catch((error) => {
            logger.warn("Auto-detect check-in support probe failed", {
              siteType,
              error: getErrorMessage(error),
            })
            return false
          }),
    )

  const [tokenInfo, siteStatus, checkSupport, siteName] = await Promise.all([
    tokenPromise.catch((error) => {
      throw new AutoDetectCompletionError(
        AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
        error,
      )
    }),
    classifiedSiteStatusPromise,
    checkSupportPromise,
    classifiedSiteStatusPromise.then((resolvedSiteStatus) =>
      getSiteName(url, siteType, resolvedSiteStatus),
    ),
  ])

  const tokenData =
    tokenInfo && typeof tokenInfo === "object"
      ? (tokenInfo as { username?: unknown; access_token?: unknown })
      : {}
  const detectedUsername = trimString(tokenData.username)
  const accessToken = trimString(tokenData.access_token)
  const isUsernameMissing = !isSub2Api && !detectedUsername
  const isAccessTokenMissing =
    (effectiveAuthType === AuthTypeEnum.AccessToken || isAIHubMix) &&
    !accessToken

  if (isUsernameMissing || isAccessTokenMissing) {
    const failureReason = isAccessTokenMissing
      ? AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing
      : AUTO_DETECT_FAILURE_REASONS.UsernameMissing
    const message = isAccessTokenMissing
      ? t("messages:operations.detection.getAccessTokenFailedDetailed")
      : t("messages:operations.detection.getUsernameFailedDetailed")
    throw new AutoDetectCompletionError(failureReason, new Error(message))
  }

  const defaultExchangeRate =
    apiService.extractDefaultExchangeRate(siteStatus) ??
    UI_CONSTANTS.EXCHANGE_RATE.DEFAULT

  return {
    username: detectedUsername,
    siteName,
    accessToken,
    userId: userId.toString(),
    exchangeRate: defaultExchangeRate,
    authType: effectiveAuthType,
    checkIn: createInitialCheckInConfig(isSub2Api, checkSupport),
    siteType,
    ...(isSub2Api && sub2apiAuth ? { sub2apiAuth } : {}),
    ...(autoDetectFetchContext ? { fetchContext: autoDetectFetchContext } : {}),
    autoDetectContext,
  }
}
