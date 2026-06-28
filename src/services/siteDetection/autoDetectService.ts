/**
 * 自动识别服务
 * 提供跨平台的账号自动识别功能
 *
 * 核心流程：
 * 1. 获取用户 ID（通过 localStorage 或 API）
 * 2. 检测站点类型
 * 3. 返回统一的结果格式
 */
import {
  AUTO_DETECT_ERROR_CODES,
  AUTO_DETECT_FETCH_CONTEXT_KINDS,
  AUTO_DETECT_STRATEGIES,
  type AutoDetectAnalyticsContext,
  type AutoDetectErrorCode,
} from "~/constants/autoDetect"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  AIHUBMIX_API_ORIGIN,
  AIHUBMIX_HOSTNAMES,
  isAccountSiteType,
  type AccountSiteType,
} from "~/constants/siteType"
import {
  ACCOUNT_BROWSER_SESSION_SOURCES,
  readAccountBrowserSessionFromTab,
} from "~/services/accountBrowserSession"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { getSiteAdapter } from "~/services/apiAdapters/registry"
import {
  API_SERVICE_FETCH_CONTEXT_KINDS,
  summarizeApiServiceFetchContext,
} from "~/services/apiTransport/type"
import type { ApiServiceFetchContext } from "~/services/apiTransport/type"
import { AuthTypeEnum, type Sub2ApiAuthConfig } from "~/types"
import {
  getActiveOrAllTabs,
  getBrowserApiCapabilities,
  isMessageReceiverUnavailableError,
  sendRuntimeMessage,
} from "~/utils/browser/browserApi"
import { isExtensionPopup } from "~/utils/browser/index"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import { getAccountSiteType } from "./detectSiteType"

/**
 * Unified logger scoped to the account auto-detection service.
 */
const logger = createLogger("AutoDetectService")
const AIHUBMIX_HOSTNAME_SET: ReadonlySet<string> = new Set(AIHUBMIX_HOSTNAMES)

/**
 * Normalizes optional site type hints received from content scripts.
 */
function normalizeSiteTypeHint(value: unknown): AccountSiteType | undefined {
  return isAccountSiteType(value) ? value : undefined
}

type AutoDetectFetchContext = ApiServiceFetchContext

interface AutoDetectResult {
  success: boolean
  autoDetectContext?: AutoDetectAnalyticsContext
  data?: {
    userId: string
    user: any
    siteType: AccountSiteType
    accessToken?: string
    sub2apiAuth?: Sub2ApiAuthConfig
    fetchContext?: AutoDetectFetchContext
  }
  error?: string
  errorCode?: AutoDetectErrorCode
}

interface UserDataResult {
  userId: string
  user: any
  accessToken?: string
  sub2apiAuth?: Sub2ApiAuthConfig
  siteTypeHint?: AccountSiteType
  fetchContext?: AutoDetectFetchContext
}

interface CurrentTabUserDataResult {
  userData: UserDataResult | null
  contentScriptUnavailable: boolean
  strategy: AutoDetectAnalyticsContext["strategy"]
  fetchContext: AutoDetectFetchContext
}

/**
 * Identifies the generic "no user data found" outcome so we only replace it
 * with the reload hint when more specific downstream errors are unavailable.
 */
function isGenericUserDataMissingError(error?: string): boolean {
  return !error || error === t("messages:operations.detection.getUserIdFailed")
}

/**
 * 检测平台能力
 */
/**
 * Detect available browser APIs to choose a compatible auto-detect strategy.
 * @returns Capability flags indicating windows/tabs/runtime availability.
 */
function detectPlatformCapabilities() {
  return getBrowserApiCapabilities()
}

/**
 * Returns the canonical page origin that should back AIHubMix auto-detect reads.
 */
function resolveAutoDetectUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (AIHUBMIX_HOSTNAME_SET.has(parsed.hostname.toLowerCase())) {
      return AIHUBMIX_API_ORIGIN
    }
    return url
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
function createAutoDetectContext(params: {
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
function withAutoDetectContext(
  result: AutoDetectResult,
  autoDetectContext: AutoDetectAnalyticsContext,
): AutoDetectResult {
  return {
    ...result,
    autoDetectContext,
  }
}

/**
 * 公共逻辑：组合用户数据和站点类型
 * 这是所有自动识别方式的最后一步
 */
/**
 * Merge user data (if any) with detected site type into a unified result.
 * @param userData User info resolved from upstream source; null when missing.
 * @param url Current site URL for site type detection.
 * @returns Successful result with user + siteType, or failure with message.
 */
async function combineUserDataAndSiteType(
  userData: UserDataResult | null,
  url: string,
): Promise<AutoDetectResult> {
  if (!userData) {
    return {
      success: false,
      error: t("messages:operations.detection.getUserIdFailed"),
    }
  }

  try {
    const siteType = userData.siteTypeHint || (await getAccountSiteType(url))
    return {
      success: true,
      data: {
        userId: userData.userId,
        user: userData.user,
        siteType,
        accessToken: userData.accessToken,
        sub2apiAuth: userData.sub2apiAuth,
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

/**
 * Resolve the account-bootstrap capability used by API fallback.
 * @param siteType Detected site type used to select an adapter.
 * @returns Account-bootstrap capability when supported.
 */
function getAccountBootstrapForApiFallback(siteType: AccountSiteType) {
  return getSiteAdapter(siteType).accountBootstrap
}

/**
 * Fetch user data via upstream API (cookie-based).
 * @param url Base site URL used for API calls.
 * @param siteType Detected site type used to select an API implementation.
 * @returns UserDataResult when ID present; otherwise null.
 */
async function getUserDataViaAPI(
  url: string,
  siteType: AccountSiteType,
  fetchContext?: AutoDetectFetchContext,
): Promise<UserDataResult | null> {
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
    })
    const userId = normalizeAccountIdentity(userInfo?.id)
    if (!userInfo || !userId) {
      logger.debug("API auto-detect returned no user id", {
        url,
        siteType,
        hasFetchContext: Boolean(fetchContext),
      })
      return null
    }
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
    logger.warn("API 方式获取用户数据失败", {
      url,
      siteType,
      fetchContext: summarizeApiServiceFetchContext(fetchContext),
      error: getErrorMessage(error),
    })
    return null
  }
}

/**
 * Direct auto-detect: use upstream API to fetch user info (cookie-based).
 *
 * Flow:
 * 1) GET /api/user/self to fetch user profile (requires login cookies)
 * 2) Extract userId and user payload
 * 3) Detect site type and return unified result
 */
async function autoDetectDirect(url: string): Promise<AutoDetectResult> {
  logger.info("使用直接方式", { url })

  try {
    // 检测站点类型，避免在未知站点上下文中使用默认 API
    const siteType = await getAccountSiteType(url)

    // 通过 API 获取用户数据
    const userData = await getUserDataViaAPI(url, siteType)

    // 组合用户数据和站点类型（公共逻辑）
    return withAutoDetectContext(
      await combineUserDataAndSiteType(userData, url),
      createAutoDetectContext({
        strategy: AUTO_DETECT_STRATEGIES.DirectApi,
        siteType,
      }),
    )
  } catch (error) {
    return {
      success: false,
      autoDetectContext: createAutoDetectContext({
        strategy: AUTO_DETECT_STRATEGIES.DirectApi,
      }),
      error: getErrorMessage(error),
      errorCode: AUTO_DETECT_ERROR_CODES.SITE_TYPE_DETECTION_FAILED,
    }
  }
}

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
): Promise<UserDataResult | null> {
  try {
    const requestId = `auto-detect-${Date.now()}`
    logger.debug("Background auto-detect request prepared", {
      url,
      siteType,
      requestId,
      useIncognito: fetchContext?.incognito === true,
      fetchContext: summarizeApiServiceFetchContext(fetchContext),
    })

    const shouldSuppressMinimize = isExtensionPopup()

    const response = await sendRuntimeMessage({
      action: RuntimeActionIds.AutoDetectSite,
      url: url,
      requestId: requestId,
      ...(shouldSuppressMinimize ? { suppressMinimize: true } : {}),
      ...(fetchContext?.incognito === true ? { useIncognito: true } : {}),
      ...(fetchContext?.cookieStoreId
        ? { cookieStoreId: fetchContext.cookieStoreId }
        : {}),
    })

    if (!response || !response.success || !response.data) {
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
      return await getUserDataViaAPI(url, siteType, fetchContext)
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
      logger.debug("Background auto-detect returned no usable user id", {
        url,
        siteType,
        requestId,
      })
      return await getUserDataViaAPI(url, siteType, fetchContext)
    }

    return {
      userId,
      user: response.data.user,
      accessToken: response.data.accessToken,
      sub2apiAuth: response.data.sub2apiAuth,
      siteTypeHint: normalizeSiteTypeHint(response.data.siteTypeHint),
      ...(fetchContext ? { fetchContext } : {}),
    }
  } catch (error) {
    logger.warn("Background 方式获取用户数据失败", {
      url,
      siteType,
      fetchContext: summarizeApiServiceFetchContext(fetchContext),
      error: getErrorMessage(error),
    })
    return null
  }
}

/**
 * Auto-detect via background flow when runtime/background messaging is available.
 *
 * 1) Background script acquires a temporary browser context to read localStorage
 * 2) Falls back to API-based fetch when storage read fails
 */
async function autoDetectViaBackground(
  url: string,
  fetchContext?: AutoDetectFetchContext,
): Promise<AutoDetectResult> {
  logger.info("使用 Background 方式", {
    url,
    fetchContext: summarizeApiServiceFetchContext(fetchContext),
  })

  // 检测站点类型，避免在未知站点上下文中使用默认 API
  const siteType = await getAccountSiteType(url)

  // 通过 Background 获取用户数据
  const userData = await getUserDataViaBackground(url, siteType, fetchContext)

  // 组合用户数据和站点类型（公共逻辑）
  return withAutoDetectContext(
    await combineUserDataAndSiteType(userData, url),
    createAutoDetectContext({
      strategy: AUTO_DETECT_STRATEGIES.BackgroundTempContext,
      siteType,
      fetchContext,
    }),
  )
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
      tabId,
      baseUrl: url,
      siteType,
      source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      fetchContext,
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
        userData: {
          userId: session.userId,
          user: session.user,
          accessToken: session.accessToken,
          sub2apiAuth: session.sub2apiAuth,
          siteTypeHint: normalizeSiteTypeHint(session.siteTypeHint),
          fetchContext,
        },
        contentScriptUnavailable,
        strategy: AUTO_DETECT_STRATEGIES.CurrentTab,
        fetchContext,
      }
    }

    // fallback
    const fallbackUserData = await getUserDataViaAPI(
      url,
      siteType,
      fetchContext,
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
async function autoDetectFromCurrentTab(
  url: string,
  tabId: number,
  incognito?: boolean,
  cookieStoreId?: string,
): Promise<AutoDetectResult> {
  logger.info("使用当前标签页方式", { url, tabId })

  // 检测站点类型，避免在未知站点上下文中使用默认 API
  const siteType = await getAccountSiteType(url)

  // 从当前标签页获取用户数据
  const { userData, contentScriptUnavailable, strategy, fetchContext } =
    await getUserDataFromCurrentTab(
      url,
      siteType,
      tabId,
      incognito,
      cookieStoreId,
    )

  // 组合用户数据和站点类型（公共逻辑）
  const result = await combineUserDataAndSiteType(userData, url)
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

/**
 * 智能自动识别：根据平台能力和场景自动选择最佳方式
 *
 * 优先级：
 * 1. 当前标签页方式（如果 URL 匹配）
 * 2. Background 方式（如果支持 runtime/background messaging）
 * 3. 直接 API 方式（所有平台的 fallback）
 */
export async function autoDetectSmart(url: string): Promise<AutoDetectResult> {
  const detectionUrl = resolveAutoDetectUrl(url)
  const capabilities = detectPlatformCapabilities()
  let shouldHintCurrentTabReload = false
  let currentTabReloadHintResult: AutoDetectResult | null = null
  let browserFallbackContext: AutoDetectFetchContext | undefined

  // 1. 尝试从当前标签页获取（最快，无需创建新窗口）
  if (capabilities.hasTabs) {
    try {
      // On mobile, currentWindow may be unsupported; fall back to first available tab
      const tabs = await getActiveOrAllTabs()
      const currentTab = tabs.find((t) => t.active) ?? tabs[0]
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

        if (
          currentUrl.origin === targetUrl.origin &&
          typeof currentTab.id === "number"
        ) {
          logger.info("当前标签页匹配目标站点，使用当前标签页方式", {
            url,
            currentTabUrl: currentTab.url,
            tabId: currentTab.id,
          })
          const currentTabResult = await autoDetectFromCurrentTab(
            detectionUrl,
            currentTab.id,
            currentTab.incognito === true,
            currentTab.cookieStoreId,
          )
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
          const backgroundResult = await autoDetectViaBackgroundWithContext(
            detectionUrl,
            currentTabContext,
          )
          if (backgroundResult.success) {
            return backgroundResult
          }
        }
      }
    } catch (error) {
      logger.warn("当前标签页方式失败，尝试其他方式", error)
    }
  }

  // 2. 如果支持 runtime/background messaging，使用 Background 方式
  if (capabilities.hasBackgroundMessaging) {
    // Background path uses a temporary browser context, which may be backed by
    // a window or a tab depending on the current temp-context mode and browser capabilities.
    try {
      const result = await autoDetectViaBackground(
        detectionUrl,
        browserFallbackContext,
      )
      if (result.success) {
        return result
      }
      logger.info("Background 方式失败，降级到直接方式", {
        url,
        detectionUrl,
        fetchContext: summarizeApiServiceFetchContext(browserFallbackContext),
      })
    } catch (error) {
      logger.warn("Background 方式抛出异常，降级到直接方式", {
        url,
        detectionUrl,
        fetchContext: summarizeApiServiceFetchContext(browserFallbackContext),
        error: getErrorMessage(error),
      })
    }
  }

  // 3. Fallback: 使用直接方式（手机 或其他方式失败）
  const directResult = await autoDetectDirect(detectionUrl)

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

/**
 * Runs the background temp-context auto-detect path while preserving the
 * matched current-tab browser context.
 */
async function autoDetectViaBackgroundWithContext(
  url: string,
  fetchContext: AutoDetectFetchContext,
): Promise<AutoDetectResult> {
  logger.info("使用带当前标签页上下文的 Background 方式", {
    url,
    fetchContext: summarizeApiServiceFetchContext(fetchContext),
  })

  const siteType = await getAccountSiteType(url)
  const userData = await getUserDataViaBackground(url, siteType, fetchContext)
  return withAutoDetectContext(
    await combineUserDataAndSiteType(userData, url),
    createAutoDetectContext({
      strategy: AUTO_DETECT_STRATEGIES.BackgroundTempContext,
      siteType,
      fetchContext,
      currentTabMatched: true,
    }),
  )
}
