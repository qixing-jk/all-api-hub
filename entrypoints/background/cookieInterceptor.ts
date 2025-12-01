import { accountStorage } from "~/services/accountStorage"
import { hasCookieInterceptorPermissions } from "~/services/permissions/permissionManager"
import { type SiteAccount } from "~/types"
import {
  registerWebRequestInterceptor,
  setupWebRequestInterceptor
} from "~/utils/cookieHelper"

async function checkCookieInterceptorRequirement(): Promise<boolean> {
  const granted = await hasCookieInterceptorPermissions()
  if (!granted) {
    console.warn(
      "[Background] Required optional permissions (cookies/webRequest) are missing; skip cookie interception"
    )
  }
  return granted
}

// 辅助函数：从账号列表提取 站点的 URL 模式
function extractAccountUrlPatterns(accounts: SiteAccount[]): string[] {
  const patterns = accounts
    .map((acc) => {
      try {
        const url = new URL(acc.site_url)
        return `${url.origin}/*`
      } catch {
        console.warn(
          `[Background] 账户 ${acc.site_name} 的 URL 无效：`,
          acc.site_url
        )
        return null
      }
    })
    .filter((pattern): pattern is string => pattern !== null)

  // 去重
  return Array.from(new Set(patterns))
}

// 初始化 Cookie 拦截器
export async function initializeCookieInterceptors(): Promise<void> {
  try {
    if (!(await checkCookieInterceptorRequirement())) {
      return
    }
    const accounts = await accountStorage.getAllAccounts()
    const urlPatterns = extractAccountUrlPatterns(accounts)
    setupWebRequestInterceptor(urlPatterns)
  } catch (error) {
    console.error("[Background] 初始化 cookie 拦截器失败：", error)
  }
}

// 更新 Cookie 拦截器（配置变更时调用）
async function updateCookieInterceptor(): Promise<void> {
  try {
    if (!(await checkCookieInterceptorRequirement())) {
      return
    }
    const accounts = await accountStorage.getAllAccounts()
    const urlPatterns = extractAccountUrlPatterns(accounts)
    registerWebRequestInterceptor(urlPatterns)
  } catch (error) {
    console.error("[Background] 更新 cookie 拦截器失败：", error)
  }
}

function handleStorageChanged(
  changes: Record<string, unknown>,
  areaName: string
) {
  if (areaName === "local" && (changes as any).site_accounts) {
    console.log("[Background] 账户配置已变更，正在更新拦截器")
    void updateCookieInterceptor().catch((error) => {
      console.error("[Background] 更新 cookie 拦截器失败：", error)
    })
  }
}

export function setupCookieInterceptorListeners() {
  browser.storage.onChanged.addListener(handleStorageChanged as any)
  chrome.permissions.onAdded.addListener(updateCookieInterceptor)
  chrome.permissions.onRemoved.addListener(updateCookieInterceptor)
}
