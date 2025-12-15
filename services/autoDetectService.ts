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

import {
  getActiveOrAllTabs,
  getActiveTabs,
  sendRuntimeMessage,
} from "~/utils/browserApi"
import { getErrorMessage } from "~/utils/error"

import { getApiService } from "./apiService"
import { getSiteType } from "./detectSiteType"

export interface AutoDetectResult {
  success: boolean
  data?: {
    userId: number
    user: any
    siteType: string
  }
  error?: string
}

export interface UserDataResult {
  userId: number
  user: any
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
    const siteType = await getSiteType(url)
    return {
      success: true,
      data: {
        userId: userData.userId,
        user: userData.user,
        siteType,
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
 * @returns UserDataResult when ID present; otherwise null.
 */
async function getUserDataViaAPI(url: string): Promise<UserDataResult | null> {
  try {
    const userInfo = await getApiService(undefined).fetchUserInfo(url)
    if (!userInfo || !userInfo.id) {
      return null
    }
    return {
      userId: userInfo.id,
      user: userInfo,
    }
  } catch (error) {
    console.error("[AutoDetect] API 方式获取用户数据失败:", error)
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
  console.log("[AutoDetect] 使用直接方式")

  // 1. 通过 API 获取用户数据
  const userData = await getUserDataViaAPI(url)

  // 2. 组合用户数据和站点类型（公共逻辑）
  return await combineUserDataAndSiteType(userData, url)
}

/**
 * Fetch user data through background script flow with fallback to API.
 *
 * Creates a runtime request to content/background to read localStorage; if that
 * fails, attempts API-based fetch using cookies.
 * @param url Target site URL.
 * @returns User data or null when both methods fail.
 */
async function getUserDataViaBackground(
  url: string,
): Promise<UserDataResult | null> {
  try {
    const requestId = `auto-detect-${Date.now()}`
    const response = await sendRuntimeMessage({
      action: "autoDetectSite",
      url: url,
      requestId: requestId,
    })

    if (!response || !response.success || !response.data) {
      // Fallback: if content script/localStorage fetch fails, attempt API-based fetch
      const userInfo = await getApiService(undefined).fetchUserInfo(url)
      if (userInfo) {
        return {
          userId: userInfo.id,
          user: userInfo,
        }
      } else {
        return null
      }
    }

    return {
      userId: response.data.userId,
      user: response.data.user,
    }
  } catch (error) {
    console.error("[AutoDetect] Background 方式获取用户数据失败:", error)
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
  console.log("[AutoDetect] 使用 Background 方式")

  // 1. 通过 Background 获取用户数据
  const userData = await getUserDataViaBackground(url)

  // 2. 组合用户数据和站点类型（公共逻辑）
  return await combineUserDataAndSiteType(userData, url)
}

/**
 * Fetch user data from the active tab using content script, with API fallback.
 * @param url Target site URL.
 * @returns User data or null when not available.
 */
async function getUserDataFromCurrentTab(
  url: string,
): Promise<UserDataResult | null> {
  try {
    // 1. 获取当前活动标签页
    const tabs = await getActiveTabs()

    if (!tabs || tabs.length === 0 || !tabs[0]?.id) {
      console.log("[AutoDetect] 无法获取当前标签页")
      return null
    }

    const tabId = tabs[0].id

    // 2. 通过 content script 获取用户信息
    const userResponse = await browser.tabs.sendMessage(tabId, {
      action: "getUserFromLocalStorage",
      url: url,
    })

    if (!userResponse || !userResponse.success || !userResponse.data) {
      // fallback
      const userInfo = await getApiService(undefined).fetchUserInfo(url)
      if (userInfo) {
        return {
          userId: userInfo.id,
          user: userInfo,
        }
      } else {
        return null
      }
    }

    return {
      userId: userResponse.data.userId,
      user: userResponse.data.user,
    }
  } catch (error) {
    console.error("[AutoDetect] 从当前标签页获取用户数据失败:", error)
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
  console.log("[AutoDetect] 使用当前标签页方式")

  // 1. 从当前标签页获取用户数据
  const userData = await getUserDataFromCurrentTab(url)

  // 2. 组合用户数据和站点类型（公共逻辑）
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
          console.log("[AutoDetect] 当前标签页匹配目标站点，使用当前标签页方式")
          return await autoDetectFromCurrentTab(url)
        }
      }
    } catch (error) {
      console.warn("[AutoDetect] 当前标签页方式失败，尝试其他方式", error)
    }
  }

  // 2. 如果支持 background（桌面），使用 Background 方式
  if (capabilities.hasBackgroundMessaging) {
    // Background path opens a temp window to fetch user context without disturbing active tab
    const result = await autoDetectViaBackground(url)
    if (result.success) {
      return result
    }
    console.log("[AutoDetect] Background 方式失败，降级到直接方式")
  }

  // 3. Fallback: 使用直接方式（手机 或其他方式失败）
  return await autoDetectDirect(url)
}
