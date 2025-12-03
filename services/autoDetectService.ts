/**
 * 自动识别服务
 * 提供跨平台的账号自动识别功能
 *
 * 样心流程：
 * 1. 获取用户 ID (通过 localStorage 或 API)
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

import { fetchUserInfo } from "./apiService"
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
 * 通过 API 获取用户数据
 * 适用于所有平台，依赖浏览器 cookie
 */
async function getUserDataViaAPI(url: string): Promise<UserDataResult | null> {
  try {
    const userInfo = await fetchUserInfo(url)
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
 * 直接方式：通过 API 调用获取用户信息
 * 适用于 手机 或其他受限环境
 *
 * 流程：
 * 1. 调用 /api/user/self 获取用户信息（依赖浏览器 cookie）
 * 2. 从响应中提取 userId
 * 3. 检测站点类型
 *
 * 注意：
 * - Background 方式通过 localStorage 获取 userId
 * - 直接方式通过 API 获取 userId
 * - 两种方式最终返回相同的数据结构
 */
export async function autoDetectDirect(url: string): Promise<AutoDetectResult> {
  console.log("[AutoDetect] 使用直接方式")

  // 1. 通过 API 获取用户数据
  const userData = await getUserDataViaAPI(url)

  // 2. 组合用户数据和站点类型（公共逻辑）
  return await combineUserDataAndSiteType(userData, url)
}

/**
 * 通过 Background Script 获取用户数据
 * Background 会创建临时窗口/标签页并从 localStorage 获取数据
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
      // fallback
      const userInfo = await fetchUserInfo(url)
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
 * Background 方式：通过 background script 创建临时窗口/标签页
 * 适用于桌面浏览器
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
 * 从当前活动标签页获取用户数据
 * 适用于 popup 场景，用户已在目标站点登录
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
      const userInfo = await fetchUserInfo(url)
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
 * 当前标签页方式：从用户正在浏览的标签页获取信息
 * 适用于 popup 场景
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
      // 手机 不支持 currentWindow，需要 fallback
      const tabs = await getActiveOrAllTabs()
      const currentTab = tabs.find((t) => t.active) ?? tabs[0]

      if (currentTab?.url) {
        // 检查当前标签页是否是目标站点
        const currentUrl = new URL(currentTab.url)
        const targetUrl = new URL(url)

        if (currentUrl.origin === targetUrl.origin) {
          console.log("[AutoDetect] 当前标签页匹配目标站点，使用当前标签页方式")
          const result = await autoDetectFromCurrentTab(url)
          if (result.success) {
            return result
          }
        }
      }
    } catch (error) {
      console.log("[AutoDetect] 当前标签页方式不可用:", error)
    }
  }

  // 2. 尝试 background 方式（桌面浏览器）
  if (capabilities.hasBackgroundMessaging) {
    const result = await autoDetectViaBackground(url)

    // 如果成功，直接返回
    if (result.success) {
      return result
    }

    console.log("[AutoDetect] Background 方式失败，降级到直接方式")
  }

  // 3. Fallback: 使用直接方式（手机 或其他方式失败）
  return await autoDetectDirect(url)
}
