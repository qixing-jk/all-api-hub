import {
  AUTO_DETECT_DIAGNOSTIC_EVENTS,
  AUTO_DETECT_ERROR_CODES,
  AUTO_DETECT_FAILURE_REASONS,
  AUTO_DETECT_FETCH_CONTEXT_KINDS,
  type AutoDetectAnalyticsContext,
  type AutoDetectStrategy,
} from "~/constants/autoDetect"
import { isAccountSiteType, type AccountSiteType } from "~/constants/siteType"
import { type AccountBrowserSession } from "~/services/accountBrowserSession"
import { type AccountDetectionDiagnostics } from "~/services/accountSiteOnboarding/diagnostics"
import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiTransport/type"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { getErrorMessage } from "~/utils/core/error"
import { t } from "~/utils/i18n/core"

import type {
  AutoDetectFetchContext,
  AutoDetectResult,
} from "../autoDetectContracts"
import { getAccountSiteType } from "../detectSiteType"

/**
 * Normalizes optional site type hints received from content scripts.
 */
export function normalizeSiteTypeHint(
  value: unknown,
): AccountSiteType | undefined {
  return isAccountSiteType(value) ? value : undefined
}

export interface UserDataResult
  extends Omit<
    NonNullable<AutoDetectResult["data"]>,
    "siteType" | "user" | "rawUser"
  > {
  user: Record<string, unknown>
  siteTypeHint?: AccountSiteType
}

/** Records the attempted strategy, even when its session read used API fallback. */
export function recordAutoDetectStrategyResult({
  strategy,
  result,
  diagnostics,
}: {
  strategy: AutoDetectStrategy
  result: AutoDetectResult
  diagnostics?: AccountDetectionDiagnostics
}): void {
  diagnostics?.record(AUTO_DETECT_DIAGNOSTIC_EVENTS.StrategyFinished, {
    strategy,
    success: result.success,
    reason: result.errorCode ?? result.error,
  })
}

/** Preserves provider authentication and the selected tab's fetch context. */
export function userDataFromBrowserSession(
  session: AccountBrowserSession,
): UserDataResult {
  return {
    userId: session.userId,
    user: session.user,
    accessToken: session.accessToken,
    ...(session.transientAuth ? { transientAuth: session.transientAuth } : {}),
    sub2apiAuth: session.sub2apiAuth,
    ...(session.kimiOpenPlatformAuth
      ? { kimiOpenPlatformAuth: session.kimiOpenPlatformAuth }
      : {}),
    siteTypeHint: normalizeSiteTypeHint(session.siteTypeHint),
    fetchContext: session.fetchContext,
  }
}

/**
 * Converts operational fetch context into a privacy-safe analytics enum.
 */
function getSafeFetchContextKind(
  fetchContext?: AutoDetectFetchContext,
): AutoDetectAnalyticsContext["fetchContextKind"] {
  if (fetchContext?.kind === API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB) {
    return AUTO_DETECT_FETCH_CONTEXT_KINDS.CurrentTab
  }

  if (fetchContext?.kind === API_SERVICE_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT) {
    return AUTO_DETECT_FETCH_CONTEXT_KINDS.BrowserContext
  }

  return AUTO_DETECT_FETCH_CONTEXT_KINDS.None
}

/**
 * Builds the safe context dimensions shared by auto-detect analytics events.
 */
export function createAutoDetectContext(params: {
  strategy: AutoDetectAnalyticsContext["strategy"]
  siteType?: AccountSiteType
  fetchContext?: AutoDetectFetchContext
  currentTabMatched?: boolean
}): AutoDetectAnalyticsContext {
  return {
    strategy: params.strategy,
    ...(params.siteType ? { siteType: params.siteType } : {}),
    fetchContextKind: getSafeFetchContextKind(params.fetchContext),
    incognitoContextUsed: params.fetchContext?.incognito === true,
    currentTabMatched: params.currentTabMatched === true,
  }
}

/**
 * Attaches privacy-safe analytics metadata to an auto-detect service result.
 */
export function withAutoDetectContext(
  result: AutoDetectResult,
  autoDetectContext: AutoDetectAnalyticsContext,
): AutoDetectResult {
  return {
    ...result,
    autoDetectContext,
  }
}

/**
 * Merge user data (if any) with detected site type into a unified result.
 * @param userData User info resolved from upstream source; null when missing.
 * @param url Current site URL for site type detection.
 * @returns Successful result with user + siteType, or failure with message.
 */
export async function combineUserDataAndSiteType(
  userData: UserDataResult | null,
  url: string,
  protectionBypassExecution?: ProtectionBypassExecution,
  diagnostics?: AccountDetectionDiagnostics,
): Promise<AutoDetectResult> {
  if (!userData) {
    diagnostics?.record(AUTO_DETECT_DIAGNOSTIC_EVENTS.SessionInvalid, {
      reason: AUTO_DETECT_FAILURE_REASONS.UserDataMissing,
    })
    return {
      success: false,
      error: t("messages:operations.detection.getUserIdFailed"),
    }
  }

  try {
    const siteType =
      userData.siteTypeHint ||
      (await getAccountSiteType(url, protectionBypassExecution))
    return {
      success: true,
      data: {
        userId: userData.userId,
        user: {
          id: userData.userId,
          ...(typeof userData.user.username === "string"
            ? { username: userData.user.username }
            : {}),
        },
        rawUser: userData.user,
        siteType,
        accessToken: userData.accessToken,
        ...(userData.transientAuth
          ? { transientAuth: userData.transientAuth }
          : {}),
        sub2apiAuth: userData.sub2apiAuth,
        ...(userData.kimiOpenPlatformAuth
          ? { kimiOpenPlatformAuth: userData.kimiOpenPlatformAuth }
          : {}),
        ...(userData.fetchContext
          ? { fetchContext: userData.fetchContext }
          : {}),
      },
    }
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error),
      errorCode: AUTO_DETECT_ERROR_CODES.SITE_TYPE_DETECTION_FAILED,
    }
  }
}
