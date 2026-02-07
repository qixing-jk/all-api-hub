/**
 * 自动识别服务
 * 提供跨平台的账号自动识别功能
 *
 * 核心流程：
 * 1. 获取用户 ID（通过 localStorage 或 API）
 * 2. 检测站点类型
 * 3. 返回统一的结果格式
 */
import { t } from "i18next"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { AuthTypeEnum, type Sub2ApiAuthConfig } from "~/types"
import {
  getActiveOrAllTabs,
  getActiveTabs,
  sendRuntimeMessage,
} from "~/utils/browserApi"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"

import { getApiService } from "./apiService"
import { getSiteType } from "./detectSiteType"

/**
 * Unified logger scoped to the account auto-detection service.
 */
const logger = createLogger("AutoDetectService")

export interface AutoDetectResult {
  success: boolean
  data?: {
    userId: number
    user: any
    siteType: string
    accessToken?: string
    sub2apiAuth?: Sub2ApiAuthConfig
  }
  error?: string
}

export interface UserDataResult {
  userId: number
  user: any
  accessToken?: string
  sub2apiAuth?: Sub2ApiAuthConfig
  siteTypeHint?: string
}

/**
 * 检测平台能力
 */
/**
 * Detect available browser APIs to choose a compatible auto-detect strategy.
 * @returns Capability flags indicating windows/tabs/runtime availability.
 */
export function detectPlatformCapabilities() {
  const b = (globalThis as any).browser
  return {
    hasWindows: !!b?.windows,
    hasTabs: !!b?.tabs,
    hasBackgroundMessaging: !!b?.runtime,
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
    const siteType = userData.siteTypeHint || (await getSiteType(url))
    return {
      success: true,
      data: {
        userId: userData.userId,
        user: userData.user,
        siteType,
        accessToken: userData.accessToken,
        sub2apiAuth: userData.sub2apiAuth,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error),
    }
  }
}

/**
 * Fetch user data via upstream API (cookie-based).
 * @param url Base site URL used for API calls.
 * @param siteType Detected site type used to select an API implementation.
 * @returns UserDataResult when ID present; otherwise null.
 */
async function getUserDataViaAPI(
  url: string,
  siteType: string,
): Promise<UserDataResult | null> {
  try {
    const userInfo = await getApiService(siteType).fetchUserInfo({
      baseUrl: url,
      auth: {
        authType: AuthTypeEnum.Cookie,
      },
    })
    if (!userInfo || !userInfo.id) {
      return null
    }
    return {
      userId: userInfo.id,
      user: userInfo,
      siteTypeHint: siteType,
    }
  } catch (error) {
    logger.error("API 方式获取用户数据失败", error)
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
export async function autoDetectDirect(url: string): Promise<AutoDetectResult> {
  logger.debug("使用直接方式", { url })

  try {
    // 检测站点类型，避免在未知站点上下文中使用默认 API
    const siteType = await getSiteType(url)

    // 通过 API 获取用户数据
    const userData = await getUserDataViaAPI(url, siteType)

    // 组合用户数据和站点类型（公共逻辑）
    return await combineUserDataAndSiteType(userData, url)
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error),
    }
  }
}

/**
 * Fetch user data through background script flow with fallback to API.
 *
 * Creates a runtime request to content/background to read localStorage; if that
 * fails, attempts API-based fetch using cookies.
 * @param url Target site URL.
 * @param siteType Detected site type used to select an API implementation.
 * @returns User data or null when both methods fail.
 */
async function getUserDataViaBackground(
  url: string,
  siteType: string,
): Promise<UserDataResult | null> {
  try {
    const requestId = `auto-detect-${Date.now()}`
    const response = await sendRuntimeMessage({
      action: RuntimeActionIds.AutoDetectSite,
      url: url,
      requestId: requestId,
    })

    if (!response || !response.success || !response.data) {
      // Fallback: if content script/localStorage fetch fails, attempt API-based fetch
      const userInfo = await getApiService(siteType).fetchUserInfo({
        baseUrl: url,
        auth: {
          authType: AuthTypeEnum.Cookie,
        },
      })
      if (userInfo) {
        return {
          userId: userInfo.id,
          user: userInfo,
          siteTypeHint: siteType,
        }
      } else {
        return null
      }
    }

    return {
      userId: response.data.userId,
      user: response.data.user,
      accessToken: response.data.accessToken,
      sub2apiAuth: response.data.sub2apiAuth,
      siteTypeHint: response.data.siteTypeHint,
    }
  } catch (error) {
    logger.error("Background 方式获取用户数据失败", error)
    return null
  }
}

/**
 * Auto-detect via background flow (desktop browsers).
 *
 * 1) Background script opens temp window/tab to read localStorage
 * 2) Falls back to API-based fetch when storage read fails
 */
export async function autoDetectViaBackground(
  url: string,
): Promise<AutoDetectResult> {
  logger.debug("使用 Background 方式", { url })

  // 检测站点类型，避免在未知站点上下文中使用默认 API
  const siteType = await getSiteType(url)

  // 通过 Background 获取用户数据
  const userData = await getUserDataViaBackground(url, siteType)

  // 组合用户数据和站点类型（公共逻辑）
  return await combineUserDataAndSiteType(userData, url)
}

/**
 * Fetch user data from the active tab using content script, with API fallback.
 * @param url Target site URL.
 * @param siteType Detected site type used to select an API implementation.
 * @returns User data or null when not available.
 */
async function getUserDataFromCurrentTab(
  url: string,
  siteType: string,
): Promise<UserDataResult | null> {
  try {
    // 1. 获取当前活动标签页
    const tabs = await getActiveTabs()

    if (!tabs || tabs.length === 0 || !tabs[0]?.id) {
      logger.warn("无法获取当前标签页", { url })
      return null
    }

    const tabId = tabs[0].id

    // 2. 通过 content script 获取用户信息
    const userResponse = await browser.tabs.sendMessage(tabId, {
      action: RuntimeActionIds.ContentGetUserFromLocalStorage,
      url: url,
    })

    if (!userResponse || !userResponse.success || !userResponse.data) {
      // fallback
      const userInfo = await getApiService(siteType).fetchUserInfo({
        baseUrl: url,
        auth: {
          authType: AuthTypeEnum.Cookie,
        },
      })
      if (userInfo) {
        return {
          userId: userInfo.id,
          user: userInfo,
          siteTypeHint: siteType,
        }
      } else {
        return null
      }
    }

    return {
      userId: userResponse.data.userId,
      user: userResponse.data.user,
      accessToken: userResponse.data.accessToken,
      sub2apiAuth: userResponse.data.sub2apiAuth,
      siteTypeHint: userResponse.data.siteTypeHint,
    }
  } catch (error) {
    logger.error("从当前标签页获取用户数据失败", error)
    return null
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
): Promise<AutoDetectResult> {
  logger.debug("使用当前标签页方式", { url })

  // 检测站点类型，避免在未知站点上下文中使用默认 API
  const siteType = await getSiteType(url)

  // 从当前标签页获取用户数据
  const userData = await getUserDataFromCurrentTab(url, siteType)

  // 组合用户数据和站点类型（公共逻辑）
  return await combineUserDataAndSiteType(userData, url)
}

/**
 * 智能自动识别：根据平台能力和场景自动选择最佳方式
 *
 * 优先级：
 * 1. 当前标签页方式（如果 URL 匹配）
 * 2. Background 方式（桌面浏览器）
 * 3. 直接 API 方式（所有平台的 fallback）
 */
export async function autoDetectSmart(url: string): Promise<AutoDetectResult> {
  const capabilities = detectPlatformCapabilities()

  // 1. 尝试从当前标签页获取（最快，无需创建新窗口）
  if (capabilities.hasTabs) {
    try {
      // On mobile, currentWindow may be unsupported; fall back to first available tab
      const tabs = await getActiveOrAllTabs()
      const currentTab = tabs.find((t) => t.active) ?? tabs[0]

      if (currentTab?.url) {
        // 检查当前标签页是否是目标站点
        const currentUrl = new URL(currentTab.url)
        const targetUrl = new URL(url)

        if (currentUrl.origin === targetUrl.origin) {
          logger.debug("当前标签页匹配目标站点，使用当前标签页方式", {
            url,
            currentTabUrl: currentTab.url,
          })
          return await autoDetectFromCurrentTab(url)
        }
      }
    } catch (error) {
      logger.warn("当前标签页方式失败，尝试其他方式", error)
    }
  }

  // 2. 如果支持 background（桌面），使用 Background 方式
  if (capabilities.hasBackgroundMessaging) {
    // Background path opens a temp window to fetch user context without disturbing active tab
    const result = await autoDetectViaBackground(url)
    if (result.success) {
      return result
    }
    logger.debug("Background 方式失败，降级到直接方式", { url })
  }

  // 3. Fallback: 使用直接方式（手机 或其他方式失败）
  return await autoDetectDirect(url)
}
