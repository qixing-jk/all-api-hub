import {
  AUTO_DETECT_DIAGNOSTIC_EVENTS,
  AUTO_DETECT_FAILURE_REASONS,
  AUTO_DETECT_SESSION_SOURCES,
  AUTO_DETECT_SOURCE_REASONS,
} from "~/constants/autoDetect"
import { normalizeAccountIdentity } from "~/services/accounts/identity/accountIdentity"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { summarizeApiServiceFetchContext } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import type { ApiAutoDetectRequest } from "../autoDetectContracts"
import type { UserDataResult } from "./resultAssembly"

const logger = createLogger("AutoDetectService")

/**
 * Fetch user data via upstream API (cookie-based).
 * @returns UserDataResult when ID present; otherwise null.
 */
export async function getUserDataViaAPI({
  url,
  siteType,
  fetchContext,
  tempWindowRequestSource,
  protectionBypassExecution,
  diagnostics,
}: ApiAutoDetectRequest): Promise<UserDataResult | null> {
  diagnostics?.record(AUTO_DETECT_DIAGNOSTIC_EVENTS.ApiSessionStarted, {
    siteType,
  })
  try {
    if (fetchContext) {
      logger.debug("API auto-detect using browser fetch context", {
        url,
        siteType,
        fetchContext: summarizeApiServiceFetchContext(fetchContext),
      })
    }

    const accountBootstrap =
      getSiteTypeCapabilities(siteType).account?.bootstrap
    if (!accountBootstrap) {
      diagnostics?.record(AUTO_DETECT_DIAGNOSTIC_EVENTS.SourceSkipped, {
        source: AUTO_DETECT_SESSION_SOURCES.Api,
        reason: AUTO_DETECT_SOURCE_REASONS.CapabilityUnavailable,
        siteType,
      })
      logger.warn("Account bootstrap capability is unavailable", {
        siteType,
        hasFetchContext: Boolean(fetchContext),
      })
      return null
    }

    const userInfo = await accountBootstrap.fetchUserInfo({
      baseUrl: url,
      auth: {
        authType: AuthTypeEnum.Cookie,
      },
      ...(fetchContext ? { fetchContext } : {}),
      ...(tempWindowRequestSource ? { tempWindowRequestSource } : {}),
      ...(protectionBypassExecution ? { protectionBypassExecution } : {}),
    })
    const userId = normalizeAccountIdentity(userInfo?.id)
    if (!userInfo || !userId) {
      diagnostics?.record(AUTO_DETECT_DIAGNOSTIC_EVENTS.SessionInvalid, {
        source: AUTO_DETECT_SESSION_SOURCES.Api,
        reason: AUTO_DETECT_FAILURE_REASONS.UserIdMissing,
        siteType,
      })
      logger.debug("API auto-detect returned no user id", {
        url,
        siteType,
        hasFetchContext: Boolean(fetchContext),
      })
      return null
    }
    diagnostics?.record(AUTO_DETECT_DIAGNOSTIC_EVENTS.ApiSessionFinished, {
      success: true,
      siteType,
    })
    return {
      userId,
      user: userInfo,
      accessToken:
        typeof userInfo.access_token === "string"
          ? userInfo.access_token
          : undefined,
      siteTypeHint: siteType,
      ...(fetchContext ? { fetchContext } : {}),
    }
  } catch (error) {
    diagnostics?.record(AUTO_DETECT_DIAGNOSTIC_EVENTS.ApiSessionFailed, {
      siteType,
      error: getErrorMessage(error),
    })
    logger.warn("API 方式获取用户数据失败", {
      url,
      siteType,
      fetchContext: summarizeApiServiceFetchContext(fetchContext),
      error: getErrorMessage(error),
    })
    return null
  }
}
