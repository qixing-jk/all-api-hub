import { type AccountSiteType } from "~/constants/siteType"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { type AccountDetectionDiagnostics } from "~/services/accountSiteOnboarding/diagnostics"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { summarizeApiServiceFetchContext } from "~/services/apiTransport/type"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import type { AutoDetectFetchContext } from "../autoDetectContracts"
import type { UserDataResult } from "./resultAssembly"

const logger = createLogger("AutoDetectService")

/**
 * Resolve the account-bootstrap capability used by API fallback.
 * @param siteType Detected site type used to select an adapter.
 * @returns Account-bootstrap capability when supported.
 */
function getAccountBootstrapForApiFallback(siteType: AccountSiteType) {
  return getSiteTypeCapabilities(siteType).account?.bootstrap
}

/**
 * Fetch user data via upstream API (cookie-based).
 * @param url Base site URL used for API calls.
 * @param siteType Detected site type used to select an API implementation.
 * @returns UserDataResult when ID present; otherwise null.
 */
export async function getUserDataViaAPI(
  url: string,
  siteType: AccountSiteType,
  fetchContext?: AutoDetectFetchContext,
  tempWindowRequestSource?: TempWindowRequestSource,
  protectionBypassExecution?: ProtectionBypassExecution,
  diagnostics?: AccountDetectionDiagnostics,
): Promise<UserDataResult | null> {
  diagnostics?.record("api_session_started", { siteType })
  try {
    if (fetchContext) {
      logger.debug("API auto-detect using browser fetch context", {
        url,
        siteType,
        fetchContext: summarizeApiServiceFetchContext(fetchContext),
      })
    }

    const accountBootstrap = getAccountBootstrapForApiFallback(siteType)
    if (!accountBootstrap) {
      diagnostics?.record("source_skipped", {
        source: "api",
        reason: "capability_unavailable",
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
      diagnostics?.record("session_invalid", {
        source: "api",
        reason: "user_id_missing",
        siteType,
      })
      logger.debug("API auto-detect returned no user id", {
        url,
        siteType,
        hasFetchContext: Boolean(fetchContext),
      })
      return null
    }
    diagnostics?.record("api_session_finished", { success: true, siteType })
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
    diagnostics?.record("api_session_failed", {
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
