import {
  AUTO_DETECT_ERROR_CODES,
  AUTO_DETECT_STRATEGIES,
  type AutoDetectAnalyticsContext,
} from "~/constants/autoDetect"
import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import {
  ACCOUNT_BROWSER_SESSION_SOURCES,
  readAccountBrowserSessionFromTab,
} from "~/services/accountBrowserSession"
import { type AccountDetectionDiagnostics } from "~/services/accountSiteOnboarding/diagnostics"
import {
  API_SERVICE_FETCH_CONTEXT_KINDS,
  summarizeApiServiceFetchContext,
} from "~/services/apiTransport/type"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { isMessageReceiverUnavailableError } from "~/utils/browser/runtimeMessages"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

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
  userDataFromBrowserSession,
  withAutoDetectContext,
} from "./resultAssembly"

const logger = createLogger("AutoDetectService")

interface CurrentTabUserDataResult {
  userData: UserDataResult | null
  contentScriptUnavailable: boolean
  strategy: AutoDetectAnalyticsContext["strategy"]
  fetchContext: AutoDetectFetchContext
}

/**
 * Fetch user data from the active tab using content script, with API fallback.
 * @param url Target site URL.
 * @param siteType Detected site type used to select an API implementation.
 * @param tabId The ID of the tab to query for user data via content script messaging.
 * @returns User data or null when not available.
 */
async function getUserDataFromCurrentTab(
  url: string,
  siteType: AccountSiteType,
  tabId: number,
  incognito?: boolean,
  cookieStoreId?: string,
  protectionBypassExecution?: ProtectionBypassExecution,
  diagnostics?: AccountDetectionDiagnostics,
): Promise<CurrentTabUserDataResult> {
  let contentScriptUnavailable = false
  const fetchContext: AutoDetectFetchContext = {
    kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
    tabId,
    origin: new URL(url).origin,
    ...(incognito === true ? { incognito: true } : {}),
    ...(cookieStoreId ? { cookieStoreId } : {}),
  }

  logger.debug("Current-tab auto-detect fetch context prepared", {
    url,
    siteType,
    fetchContext: summarizeApiServiceFetchContext(fetchContext),
  })

  try {
    const session = await readAccountBrowserSessionFromTab({
      diagnostics,
      tabId,
      baseUrl: url,
      siteType,
      source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      fetchContext,
      ...(siteType === SITE_TYPES.UNKNOWN
        ? { allowNewApiAuthProbe: true }
        : {}),
      protectionBypassExecution,
      onError(error) {
        contentScriptUnavailable = isMessageReceiverUnavailableError(error)

        if (contentScriptUnavailable) {
          logger.warn("当前标签页 content script 不可用，尝试 API 降级", {
            url,
            tabId,
            fetchContext: summarizeApiServiceFetchContext(fetchContext),
            error: getErrorMessage(error),
          })
        } else {
          logger.warn("从当前标签页获取用户数据失败", {
            url,
            tabId,
            fetchContext: summarizeApiServiceFetchContext(fetchContext),
            error: getErrorMessage(error),
          })
        }
      },
    })

    if (session) {
      return {
        userData: { ...userDataFromBrowserSession(session), fetchContext },
        contentScriptUnavailable,
        strategy: AUTO_DETECT_STRATEGIES.CurrentTab,
        fetchContext,
      }
    }

    diagnostics?.record("source_fallback", {
      from: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      to: "api",
      reason: contentScriptUnavailable
        ? "content_script_unavailable"
        : "no_session",
    })
    // fallback
    const fallbackUserData = await getUserDataViaAPI(
      url,
      siteType,
      fetchContext,
      undefined,
      protectionBypassExecution,
      diagnostics,
    )
    if (fallbackUserData) {
      return {
        userData: fallbackUserData,
        contentScriptUnavailable,
        strategy: AUTO_DETECT_STRATEGIES.FallbackApi,
        fetchContext,
      }
    }

    return {
      userData: null,
      contentScriptUnavailable,
      strategy: AUTO_DETECT_STRATEGIES.FallbackApi,
      fetchContext,
    }
  } catch (error) {
    diagnostics?.record("source_failed", {
      source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      error: getErrorMessage(error),
    })
    logger.warn("从当前标签页获取用户数据失败", {
      url,
      tabId,
      fetchContext: summarizeApiServiceFetchContext(fetchContext),
      error: getErrorMessage(error),
    })
    return {
      userData: null,
      contentScriptUnavailable,
      strategy: AUTO_DETECT_STRATEGIES.FallbackApi,
      fetchContext,
    }
  }
}

/**
 * Auto-detect from the currently active tab (popup scenario).
 *
 * 1) Ask content script for user info from localStorage in active tab
 * 2) Fall back to API call if content script response is missing
 */
export async function autoDetectFromCurrentTab(
  url: string,
  tabId: number,
  incognito?: boolean,
  cookieStoreId?: string,
  protectionBypassExecution?: ProtectionBypassExecution,
  diagnostics?: AccountDetectionDiagnostics,
): Promise<AutoDetectResult> {
  diagnostics?.record("strategy_started", {
    strategy: AUTO_DETECT_STRATEGIES.CurrentTab,
    tabId,
  })
  logger.info("使用当前标签页方式", { url, tabId })

  // 检测站点类型，避免在未知站点上下文中使用默认 API
  const siteType = await getAccountSiteType(url, protectionBypassExecution)

  // 从当前标签页获取用户数据
  const { userData, contentScriptUnavailable, strategy, fetchContext } =
    await getUserDataFromCurrentTab(
      url,
      siteType,
      tabId,
      incognito,
      cookieStoreId,
      protectionBypassExecution,
      diagnostics,
    )

  // 组合用户数据和站点类型（公共逻辑）
  const result = await combineUserDataAndSiteType(
    userData,
    url,
    protectionBypassExecution,
    diagnostics,
  )
  const autoDetectContext = createAutoDetectContext({
    strategy:
      contentScriptUnavailable && !result.success
        ? AUTO_DETECT_STRATEGIES.CurrentTab
        : strategy,
    siteType,
    fetchContext,
    currentTabMatched: true,
  })

  if (!result.success && contentScriptUnavailable) {
    return {
      ...result,
      autoDetectContext,
      errorCode: AUTO_DETECT_ERROR_CODES.CURRENT_TAB_CONTENT_SCRIPT_UNAVAILABLE,
      error: t("messages:autodetect.currentTabNeedsReload"),
    }
  }

  return withAutoDetectContext(result, autoDetectContext)
}
