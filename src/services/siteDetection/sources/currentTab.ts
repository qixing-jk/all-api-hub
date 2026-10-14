import {
  AUTO_DETECT_DIAGNOSTIC_EVENTS,
  AUTO_DETECT_ERROR_CODES,
  AUTO_DETECT_SESSION_SOURCES,
  AUTO_DETECT_SOURCE_REASONS,
  AUTO_DETECT_STRATEGIES,
} from "~/constants/autoDetect"
import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import {
  ACCOUNT_BROWSER_SESSION_SOURCES,
  readAccountBrowserSessionFromTab,
} from "~/services/accountBrowserSession"
import { summarizeApiServiceFetchContext } from "~/services/apiTransport/type"
import { isMessageReceiverUnavailableError } from "~/utils/browser/runtimeMessages"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import { createCurrentTabAutoDetectContext } from "../autoDetectContext"
import type {
  AutoDetectFetchContext,
  AutoDetectResult,
  CurrentTabAutoDetectRequest,
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
  strategy:
    | typeof AUTO_DETECT_STRATEGIES.CurrentTab
    | typeof AUTO_DETECT_STRATEGIES.FallbackApi
  fetchContext: AutoDetectFetchContext
}

/**
 * Fetch user data from the active tab using content script, with API fallback.
 * @returns Session data (possibly null), attempted strategy and content-script availability.
 */
async function getUserDataFromCurrentTab({
  url,
  siteType,
  tabId,
  incognito,
  cookieStoreId,
  protectionBypassExecution,
  diagnostics,
}: CurrentTabAutoDetectRequest & {
  siteType: AccountSiteType
}): Promise<CurrentTabUserDataResult> {
  let contentScriptUnavailable = false
  const fetchContext = createCurrentTabAutoDetectContext({
    url,
    tabId,
    incognito,
    cookieStoreId,
  })

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
      ...(siteType === SITE_TYPES.UNKNOWN ? { allowSessionProbe: true } : {}),
      protectionBypassExecution,
      onError(error) {
        contentScriptUnavailable = isMessageReceiverUnavailableError(error)

        logger.warn(
          contentScriptUnavailable
            ? "当前标签页 content script 不可用，尝试 API 降级"
            : "从当前标签页获取用户数据失败",
          {
            url,
            tabId,
            fetchContext: summarizeApiServiceFetchContext(fetchContext),
            error: getErrorMessage(error),
          },
        )
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

    diagnostics?.record(AUTO_DETECT_DIAGNOSTIC_EVENTS.SourceFallback, {
      from: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      to: AUTO_DETECT_SESSION_SOURCES.Api,
      reason: contentScriptUnavailable
        ? AUTO_DETECT_SOURCE_REASONS.ContentScriptUnavailable
        : AUTO_DETECT_SOURCE_REASONS.NoSession,
    })
    const fallbackUserData = await getUserDataViaAPI({
      url,
      siteType,
      fetchContext,
      protectionBypassExecution,
      diagnostics,
    })
    return {
      userData: fallbackUserData,
      contentScriptUnavailable,
      strategy: AUTO_DETECT_STRATEGIES.FallbackApi,
      fetchContext,
    }
  } catch (error) {
    diagnostics?.record(AUTO_DETECT_DIAGNOSTIC_EVENTS.SourceFailed, {
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
 * 1) Ask the content script for the active tab's browser session
 * 2) Fall back to API call if content script response is missing
 */
export async function autoDetectFromCurrentTab(
  request: CurrentTabAutoDetectRequest,
): Promise<AutoDetectResult> {
  const { url, tabId, protectionBypassExecution, diagnostics } = request
  diagnostics?.record(AUTO_DETECT_DIAGNOSTIC_EVENTS.StrategyStarted, {
    strategy: AUTO_DETECT_STRATEGIES.CurrentTab,
    tabId,
  })
  logger.info("使用当前标签页方式", { url, tabId })

  // 检测站点类型，避免在未知站点上下文中使用默认 API
  const siteType = await getAccountSiteType(url, protectionBypassExecution)

  // 从当前标签页获取用户数据
  const { userData, contentScriptUnavailable, strategy, fetchContext } =
    await getUserDataFromCurrentTab({ ...request, siteType })

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
