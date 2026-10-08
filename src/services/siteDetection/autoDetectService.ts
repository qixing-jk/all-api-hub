import {
  AUTO_DETECT_ERROR_CODES,
  AUTO_DETECT_STRATEGIES,
} from "~/constants/autoDetect"
import {
  ACCOUNT_BROWSER_SESSION_SOURCES,
  type ReadAccountBrowserSessionFromExistingTabsOptions,
} from "~/services/accountBrowserSession"
import { findAccountSiteProfileForHostname } from "~/services/accounts/accountSiteProfile/urls"
import {
  createAccountDetectionDiagnostics,
  type AccountDetectionDiagnostics,
} from "~/services/accountSiteOnboarding/diagnostics"
import {
  API_SERVICE_FETCH_CONTEXT_KINDS,
  summarizeApiServiceFetchContext,
} from "~/services/apiTransport/type"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import {
  getActiveOrAllTabs,
  getBrowserApiCapabilities,
} from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import type {
  AutoDetectFetchContext,
  AutoDetectResult,
} from "./autoDetectContracts"
import { accountDetectionSources } from "./autoDetectSources"

const logger = createLogger("AutoDetectService")

/**
 * Identifies the generic "no user data found" outcome so we only replace it
 * with the reload hint when more specific downstream errors are unavailable.
 */
function isGenericUserDataMissingError(error?: string): boolean {
  return !error || error === t("messages:operations.detection.getUserIdFailed")
}

/**
 * Resolves the detection origin only for profiles that opt into hostname inference.
 */
function resolveAutoDetectUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return (
      findAccountSiteProfileForHostname(parsed.hostname)?.urls
        .autoDetectOrigin ?? url
    )
  } catch {
    return url
  }
}

/**
 * Builds a browser-profile context from a tab without implying that the tab can
 * execute same-origin content-script fetches for the requested site.
 */
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
 * 智能自动识别：根据平台能力和场景自动选择最佳方式
 *
 * 优先级：
 * 1. 当前标签页方式（如果 URL 匹配）
 * 2. Background 方式（如果支持 runtime/background messaging）
 * 3. 直接 API 方式（所有平台的 fallback）
 */
async function runAutoDetectSmart(
  url: string,
  protectionBypassExecution?: ProtectionBypassExecution,
  diagnostics?: AccountDetectionDiagnostics,
): Promise<AutoDetectResult> {
  const detectionUrl = resolveAutoDetectUrl(url)
  const capabilities = getBrowserApiCapabilities()
  diagnostics?.record("platform_capabilities", { ...capabilities })
  let shouldHintCurrentTabReload = false
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
          detectionUrl,
          currentTabUrl: currentTab?.url ?? null,
          fetchContext: summarizeApiServiceFetchContext(browserFallbackContext),
        })
      }

      if (currentTab?.url) {
        // 检查当前标签页是否是目标站点
        const currentUrl = new URL(currentTab.url)
        const targetUrl = new URL(detectionUrl)
        diagnostics?.record("current_tab_selected", {
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
          const currentTabResult = await accountDetectionSources.currentTab(
            detectionUrl,
            currentTab.id,
            currentTab.incognito === true,
            currentTab.cookieStoreId,
            protectionBypassExecution,
            diagnostics,
          )
          diagnostics?.record("strategy_finished", {
            strategy: AUTO_DETECT_STRATEGIES.CurrentTab,
            success: currentTabResult.success,
            reason: currentTabResult.errorCode ?? currentTabResult.error,
          })
          if (currentTabResult.success) {
            return currentTabResult
          }

          if (
            currentTabResult.errorCode ===
            AUTO_DETECT_ERROR_CODES.CURRENT_TAB_CONTENT_SCRIPT_UNAVAILABLE
          ) {
            shouldHintCurrentTabReload = true
            currentTabReloadHintResult = currentTabResult
          }

          const currentTabContext: AutoDetectFetchContext = {
            kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: currentTab.id,
            origin: new URL(detectionUrl).origin,
            ...(currentTab.incognito === true ? { incognito: true } : {}),
            ...(currentTab.cookieStoreId
              ? { cookieStoreId: currentTab.cookieStoreId }
              : {}),
          }
          logger.info(
            "Current-tab auto-detect failed; trying background with same browser context",
            {
              url,
              detectionUrl,
              fetchContext: summarizeApiServiceFetchContext(currentTabContext),
            },
          )
          const backgroundResult = await accountDetectionSources.background(
            detectionUrl,
            currentTabContext,
            protectionBypassExecution,
            diagnostics,
            { currentTabMatched: true },
          )
          diagnostics?.record("strategy_finished", {
            strategy: AUTO_DETECT_STRATEGIES.BackgroundTempContext,
            success: backgroundResult.success,
            reason: backgroundResult.errorCode ?? backgroundResult.error,
          })
          if (backgroundResult.success) {
            return backgroundResult
          }
        }
      } else {
        diagnostics?.record("source_skipped", {
          source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
          reason: "tab_missing",
        })
      }
    } catch (error) {
      diagnostics?.record("source_failed", {
        source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
        error: getErrorMessage(error),
      })
      logger.warn("当前标签页方式失败，尝试其他方式", error)
    }
  } else {
    diagnostics?.record("source_skipped", {
      source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      reason: "tabs_unavailable",
    })
  }

  // Options is itself the active tab. Reuse a logged-in target tab before
  // opening a temporary page, keeping normal/incognito/container sessions apart.
  if (capabilities.hasTabs && browserContext && !currentTabMatched) {
    try {
      // This attempt must not acquire a temporary page merely to detect the
      // site type. The ordinary background fallback retains bypass intent.
      const existingTabResult = await accountDetectionSources.existingTab(
        detectionUrl,
        browserContext,
        protectionBypassExecution,
        diagnostics,
      )
      if (existingTabResult) return existingTabResult
    } catch (error) {
      diagnostics?.record("source_failed", {
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
      const result = await accountDetectionSources.background(
        detectionUrl,
        browserFallbackContext,
        protectionBypassExecution,
        diagnostics,
      )
      diagnostics?.record("strategy_finished", {
        strategy: AUTO_DETECT_STRATEGIES.BackgroundTempContext,
        success: result.success,
        reason: result.errorCode ?? result.error,
      })
      if (result.success) {
        return result
      }
      logger.info("Background 方式失败，降级到直接方式", {
        url,
        detectionUrl,
        fetchContext: summarizeApiServiceFetchContext(browserFallbackContext),
      })
    } catch (error) {
      diagnostics?.record("source_failed", {
        source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
        error: getErrorMessage(error),
      })
      logger.warn("Background 方式抛出异常，降级到直接方式", {
        url,
        detectionUrl,
        fetchContext: summarizeApiServiceFetchContext(browserFallbackContext),
        error: getErrorMessage(error),
      })
    }
  } else {
    diagnostics?.record("source_skipped", {
      source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
      reason: "background_messaging_unavailable",
    })
  }

  // 3. Fallback: 使用直接方式（手机 或其他方式失败）
  const directResult = await accountDetectionSources.direct(
    detectionUrl,
    protectionBypassExecution,
    diagnostics,
  )
  diagnostics?.record("strategy_finished", {
    strategy: AUTO_DETECT_STRATEGIES.DirectApi,
    success: directResult.success,
    reason: directResult.errorCode ?? directResult.error,
  })

  if (
    shouldHintCurrentTabReload &&
    !directResult.success &&
    isGenericUserDataMissingError(directResult.error)
  ) {
    return (
      currentTabReloadHintResult ?? {
        success: false,
        error: t("messages:autodetect.currentTabNeedsReload"),
        errorCode:
          AUTO_DETECT_ERROR_CODES.CURRENT_TAB_CONTENT_SCRIPT_UNAVAILABLE,
      }
    )
  }

  return directResult
}

/** Correlates strategy diagnostics while keeping the public detection result unchanged. */
export async function autoDetectSmart(
  url: string,
  protectionBypassExecution?: ProtectionBypassExecution,
  diagnostics?: AccountDetectionDiagnostics,
): Promise<AutoDetectResult> {
  const trace = diagnostics ?? createAccountDetectionDiagnostics()
  trace.record("detection_started")
  try {
    const result = await runAutoDetectSmart(
      url,
      protectionBypassExecution,
      trace,
    )
    const details = {
      success: result.success,
      strategy: result.autoDetectContext?.strategy,
      reason:
        result.errorCode ?? (result.success ? undefined : "user_data_missing"),
    }
    if (diagnostics) trace.record("site_detection_finished", details)
    else trace.finish(result.success ? "success" : "failed", details)
    return result
  } catch (error) {
    if (diagnostics)
      trace.record("site_detection_finished", {
        success: false,
        reason: "exception",
      })
    else trace.finish("failed", { reason: "exception" })
    throw error
  }
}
