import { AUTO_DETECT_STRATEGIES } from "~/constants/autoDetect"
import { type AccountSiteType } from "~/constants/siteType"
import { ACCOUNT_BROWSER_SESSION_SOURCES } from "~/services/accountBrowserSession"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { type AccountDetectionDiagnostics } from "~/services/accountSiteOnboarding/diagnostics"
import { normalizeContentSessionTransientAuth } from "~/services/accountSiteOnboarding/transientAuth"
import { summarizeApiServiceFetchContext } from "~/services/apiTransport/type"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { executeProtectionBypassTask } from "~/utils/browser/tempWindowFetch"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import type {
  AutoDetectFetchContext,
  AutoDetectResult,
} from "../autoDetectContracts"
import { getAccountSiteType } from "../detectSiteType"
import { getUserDataViaAPI } from "./apiFallback"
import type { UserDataResult } from "./resultAssembly"
import {
  combineUserDataAndSiteType,
  createAutoDetectContext,
  normalizeSiteTypeHint,
  withAutoDetectContext,
} from "./resultAssembly"

const logger = createLogger("AutoDetectService")

/**
 * Fetch user data through background script flow with fallback to API.
 *
 * Sends a runtime request to the background handler, which reads site data from
 * a temporary browser context. If that path fails, this function falls back to
 * an API-based cookie-auth request.
 * @param url Target site URL.
 * @param siteType Detected site type used to select an API implementation.
 * @returns User data or null when both methods fail.
 */
async function getUserDataViaBackground(
  url: string,
  siteType: AccountSiteType,
  fetchContext?: AutoDetectFetchContext,
  protectionBypassExecution?: ProtectionBypassExecution,
  diagnostics?: AccountDetectionDiagnostics,
): Promise<UserDataResult | null> {
  const tempWindowRequestSource = getCurrentTempWindowRequestSource()
  diagnostics?.record("session_read_started", {
    source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
    siteType,
  })

  try {
    if (!protectionBypassExecution) {
      diagnostics?.record("source_skipped", {
        source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
        reason: "execution_missing",
      })
      return await getUserDataViaAPI(
        url,
        siteType,
        fetchContext,
        tempWindowRequestSource,
        protectionBypassExecution,
        diagnostics,
      )
    }
    const requestId = `auto-detect-${Date.now()}`
    logger.debug("Background auto-detect request prepared", {
      url,
      siteType,
      requestId,
      useIncognito: fetchContext?.incognito === true,
      fetchContext: summarizeApiServiceFetchContext(fetchContext),
    })

    const params = {
      url: url,
      requestId: requestId,
      diagnosticId: diagnostics?.requestId,
      siteType,
      ...(fetchContext?.incognito === true ? { useIncognito: true } : {}),
      ...(fetchContext?.cookieStoreId
        ? { cookieStoreId: fetchContext.cookieStoreId }
        : {}),
    }
    const response = await executeProtectionBypassTask({
      task: { kind: "session_read" as const, params },
      execution: protectionBypassExecution,
    })

    diagnostics?.record("temp_session_response", {
      success: response?.success === true,
      hasData: Boolean(response?.data),
      reason: response?.error,
      code: response?.code,
    })
    if (!response || !response.success || !response.data) {
      diagnostics?.record("source_fallback", {
        from: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
        to: "api",
        reason: response?.error ?? "no_session_data",
        code: response?.code,
      })
      // Fallback: if content script/localStorage fetch fails, attempt API-based fetch
      logger.info(
        "Background auto-detect returned no user data; using API fallback",
        {
          url,
          siteType,
          requestId,
          responseSuccess: response?.success === true,
          hasResponseData: Boolean(response?.data),
          fetchContext: summarizeApiServiceFetchContext(fetchContext),
        },
      )
      return await getUserDataViaAPI(
        url,
        siteType,
        fetchContext,
        tempWindowRequestSource,
        protectionBypassExecution,
        diagnostics,
      )
    }

    logger.debug("Background auto-detect returned user data", {
      url,
      siteType,
      requestId,
      hasFetchContext: Boolean(fetchContext),
      siteTypeHint: response.data.siteTypeHint ?? null,
    })

    const userId = normalizeAccountIdentity(response.data.userId)
    if (!userId) {
      diagnostics?.record("session_invalid", {
        source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
        reason: "user_id_missing",
      })
      logger.debug("Background auto-detect returned no usable user id", {
        url,
        siteType,
        requestId,
      })
      return await getUserDataViaAPI(
        url,
        siteType,
        fetchContext,
        tempWindowRequestSource,
        protectionBypassExecution,
        diagnostics,
      )
    }

    const transientAuth = normalizeContentSessionTransientAuth(
      response.data.transientAuth,
      { baseUrl: url, siteType },
    )
    if (response.data.transientAuth && !transientAuth) {
      diagnostics?.record("session_auth_rejected", {
        source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
        reason: "invalid_transient_auth",
      })
    }

    return {
      userId,
      user: response.data.user,
      accessToken: response.data.accessToken,
      ...(transientAuth ? { transientAuth } : {}),
      sub2apiAuth: response.data.sub2apiAuth,
      ...(response.data.kimiOpenPlatformAuth
        ? { kimiOpenPlatformAuth: response.data.kimiOpenPlatformAuth }
        : {}),
      siteTypeHint: normalizeSiteTypeHint(response.data.siteTypeHint),
      ...(fetchContext ? { fetchContext } : {}),
    }
  } catch (error) {
    diagnostics?.record("source_fallback", {
      from: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
      to: "api",
      reason: "exception",
      error: getErrorMessage(error),
    })
    logger.warn("Background 方式获取用户数据失败", {
      url,
      siteType,
      fetchContext: summarizeApiServiceFetchContext(fetchContext),
      error: getErrorMessage(error),
    })
    return await getUserDataViaAPI(
      url,
      siteType,
      fetchContext,
      tempWindowRequestSource,
      protectionBypassExecution,
      diagnostics,
    )
  }
}

/**
 * Auto-detect via background flow when runtime/background messaging is available.
 *
 * 1) Background script acquires a temporary browser context to read localStorage
 * 2) Falls back to API-based fetch when storage read fails
 */
export async function autoDetectViaBackground(
  url: string,
  fetchContext?: AutoDetectFetchContext,
  protectionBypassExecution?: ProtectionBypassExecution,
  diagnostics?: AccountDetectionDiagnostics,
  options: { currentTabMatched?: true } = {},
): Promise<AutoDetectResult> {
  diagnostics?.record("strategy_started", {
    strategy: AUTO_DETECT_STRATEGIES.BackgroundTempContext,
    ...options,
  })
  logger.info(
    options.currentTabMatched
      ? "使用带当前标签页上下文的 Background 方式"
      : "使用 Background 方式",
    {
      url,
      fetchContext: summarizeApiServiceFetchContext(fetchContext),
    },
  )

  // 检测站点类型，避免在未知站点上下文中使用默认 API
  const siteType = await getAccountSiteType(url, protectionBypassExecution)

  // 通过 Background 获取用户数据
  const userData = await getUserDataViaBackground(
    url,
    siteType,
    fetchContext,
    protectionBypassExecution,
    diagnostics,
  )

  // 组合用户数据和站点类型（公共逻辑）
  return withAutoDetectContext(
    await combineUserDataAndSiteType(
      userData,
      url,
      protectionBypassExecution,
      diagnostics,
    ),
    createAutoDetectContext({
      strategy: AUTO_DETECT_STRATEGIES.BackgroundTempContext,
      siteType,
      fetchContext,
      ...options,
    }),
  )
}
