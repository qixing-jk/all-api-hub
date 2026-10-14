import {
  AUTO_DETECT_BROWSER_OUTCOMES,
  AUTO_DETECT_DIAGNOSTIC_EVENTS,
  AUTO_DETECT_ERROR_CODES,
  AUTO_DETECT_SOURCE_REASONS,
  AUTO_DETECT_STRATEGIES,
} from "~/constants/autoDetect"
import {
  ACCOUNT_BROWSER_SESSION_SOURCES,
  type ReadAccountBrowserSessionFromExistingTabsOptions,
} from "~/services/accountBrowserSession"
import {
  API_SERVICE_FETCH_CONTEXT_KINDS,
  summarizeApiServiceFetchContext,
} from "~/services/apiTransport/type"
import { getBrowserApiCapabilities } from "~/utils/browser/runtime"
import { getActiveOrAllTabs } from "~/utils/browser/tabs"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import { createCurrentTabAutoDetectContext } from "./autoDetectContext"
import type {
  AutoDetectFetchContext,
  AutoDetectRequest,
  AutoDetectResult,
  BrowserDetectionOutcome,
} from "./autoDetectContracts"
import { autoDetectViaBackground } from "./sources/background"
import { autoDetectFromCurrentTab } from "./sources/currentTab"
import { autoDetectFromExistingTab } from "./sources/existingTab"
import { recordAutoDetectStrategyResult } from "./sources/resultAssembly"

const logger = createLogger("AutoDetectService")

/** Inherits the active tab's browser profile without granting same-origin tab execution. */
function createBrowserContextFromTab(
  tab: { incognito?: boolean; cookieStoreId?: string } | null | undefined,
): AutoDetectFetchContext | undefined {
  if (!tab?.incognito && !tab?.cookieStoreId) {
    return undefined
  }

  return {
    kind: API_SERVICE_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
    ...(tab.incognito === true ? { incognito: true } : {}),
    ...(tab.cookieStoreId ? { cookieStoreId: tab.cookieStoreId } : {}),
  }
}

/**
 * Runs browser-session sources in order, retaining the active profile for fallback.
 * A reload hint is advisory: the caller must still try its final API source.
 * Temporary context acquisition and release stay behind the session reader's task boundary.
 */
export async function detectFromBrowser(
  request: AutoDetectRequest,
): Promise<BrowserDetectionOutcome> {
  const { url, diagnostics } = request
  const capabilities = getBrowserApiCapabilities()
  diagnostics?.record(AUTO_DETECT_DIAGNOSTIC_EVENTS.PlatformCapabilities, {
    ...capabilities,
  })
  let currentTabReloadHintResult: AutoDetectResult | null = null
  let browserFallbackContext: AutoDetectFetchContext | undefined
  let currentTabMatched = false
  let browserContext: ReadAccountBrowserSessionFromExistingTabsOptions["browserContext"]

  // 1. 尝试从当前标签页获取（最快，无需创建新窗口）
  if (capabilities.hasTabs) {
    try {
      // On mobile, currentWindow may be unsupported; fall back to first available tab
      const tabs = await getActiveOrAllTabs()
      const currentTab = tabs.find((t) => t.active) ?? tabs[0]
      if (currentTab) {
        browserContext = {
          incognito: currentTab.incognito === true,
          ...(currentTab.cookieStoreId
            ? { cookieStoreId: currentTab.cookieStoreId }
            : {}),
        }
      }
      browserFallbackContext = createBrowserContextFromTab(currentTab)
      if (browserFallbackContext) {
        logger.debug("Prepared browser-context fallback for auto-detect", {
          url,
          currentTabUrl: currentTab?.url ?? null,
          fetchContext: summarizeApiServiceFetchContext(browserFallbackContext),
        })
      }

      if (currentTab?.url) {
        // 检查当前标签页是否是目标站点
        const currentUrl = new URL(currentTab.url)
        const targetUrl = new URL(url)
        diagnostics?.record(AUTO_DETECT_DIAGNOSTIC_EVENTS.CurrentTabSelected, {
          matched: currentUrl.origin === targetUrl.origin,
          tabId: currentTab.id,
        })

        if (
          currentUrl.origin === targetUrl.origin &&
          typeof currentTab.id === "number"
        ) {
          currentTabMatched = true
          logger.info("当前标签页匹配目标站点，使用当前标签页方式", {
            url,
            currentTabUrl: currentTab.url,
            tabId: currentTab.id,
          })
          const currentTabResult = await autoDetectFromCurrentTab({
            ...request,
            tabId: currentTab.id,
            incognito: currentTab.incognito === true,
            cookieStoreId: currentTab.cookieStoreId,
          })
          recordAutoDetectStrategyResult({
            strategy: AUTO_DETECT_STRATEGIES.CurrentTab,
            result: currentTabResult,
            diagnostics,
          })
          if (currentTabResult.success) {
            return {
              status: AUTO_DETECT_BROWSER_OUTCOMES.Detected,
              result: currentTabResult,
            }
          }

          if (
            currentTabResult.errorCode ===
            AUTO_DETECT_ERROR_CODES.CURRENT_TAB_CONTENT_SCRIPT_UNAVAILABLE
          ) {
            currentTabReloadHintResult = currentTabResult
          }

          const currentTabContext = createCurrentTabAutoDetectContext({
            ...request,
            tabId: currentTab.id,
            incognito: currentTab.incognito === true,
            cookieStoreId: currentTab.cookieStoreId,
          })
          logger.info(
            "Current-tab auto-detect failed; trying background with same browser context",
            {
              url,
              fetchContext: summarizeApiServiceFetchContext(currentTabContext),
            },
          )
          const backgroundResult = await autoDetectViaBackground({
            ...request,
            fetchContext: currentTabContext,
            currentTabMatched: true,
          })
          recordAutoDetectStrategyResult({
            strategy: AUTO_DETECT_STRATEGIES.BackgroundTempContext,
            result: backgroundResult,
            diagnostics,
          })
          if (backgroundResult.success) {
            return {
              status: AUTO_DETECT_BROWSER_OUTCOMES.Detected,
              result: backgroundResult,
            }
          }
        }
      } else {
        diagnostics?.record(AUTO_DETECT_DIAGNOSTIC_EVENTS.SourceSkipped, {
          source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
          reason: AUTO_DETECT_SOURCE_REASONS.TabMissing,
        })
      }
    } catch (error) {
      diagnostics?.record(AUTO_DETECT_DIAGNOSTIC_EVENTS.SourceFailed, {
        source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
        error: getErrorMessage(error),
      })
      logger.warn("当前标签页方式失败，尝试其他方式", error)
    }
  } else {
    diagnostics?.record(AUTO_DETECT_DIAGNOSTIC_EVENTS.SourceSkipped, {
      source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      reason: AUTO_DETECT_SOURCE_REASONS.TabsUnavailable,
    })
  }

  // Options is itself the active tab. Reuse a logged-in target tab before
  // opening a temporary page, keeping normal/incognito/container sessions apart.
  if (capabilities.hasTabs && browserContext && !currentTabMatched) {
    try {
      // This attempt must not acquire a temporary page merely to detect the
      // site type. The ordinary background fallback retains bypass intent.
      const existingTabResult = await autoDetectFromExistingTab({
        ...request,
        browserContext,
      })
      if (existingTabResult)
        return {
          status: AUTO_DETECT_BROWSER_OUTCOMES.Detected,
          result: existingTabResult,
        }
    } catch (error) {
      diagnostics?.record(AUTO_DETECT_DIAGNOSTIC_EVENTS.SourceFailed, {
        source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
        error: getErrorMessage(error),
      })
    }
  }

  // 2. 如果支持 runtime/background messaging，使用 Background 方式
  if (capabilities.hasBackgroundMessaging) {
    // Background path uses a temporary browser context, which may be backed by
    // a window or a tab depending on the current temp-context mode and browser capabilities.
    try {
      const result = await autoDetectViaBackground({
        ...request,
        fetchContext: browserFallbackContext,
      })
      recordAutoDetectStrategyResult({
        strategy: AUTO_DETECT_STRATEGIES.BackgroundTempContext,
        result,
        diagnostics,
      })
      if (result.success) {
        return { status: AUTO_DETECT_BROWSER_OUTCOMES.Detected, result }
      }
      logger.info("Background 方式失败，降级到直接方式", {
        url,
        fetchContext: summarizeApiServiceFetchContext(browserFallbackContext),
      })
    } catch (error) {
      diagnostics?.record(AUTO_DETECT_DIAGNOSTIC_EVENTS.SourceFailed, {
        source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
        error: getErrorMessage(error),
      })
      logger.warn("Background 方式抛出异常，降级到直接方式", {
        url,
        fetchContext: summarizeApiServiceFetchContext(browserFallbackContext),
        error: getErrorMessage(error),
      })
    }
  } else {
    diagnostics?.record(AUTO_DETECT_DIAGNOSTIC_EVENTS.SourceSkipped, {
      source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
      reason: AUTO_DETECT_SOURCE_REASONS.BackgroundMessagingUnavailable,
    })
  }

  return {
    status: AUTO_DETECT_BROWSER_OUTCOMES.Exhausted,
    reloadHint: currentTabReloadHintResult ?? undefined,
  }
}
