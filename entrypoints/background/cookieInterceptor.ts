import { ACCOUNT_STORAGE_KEYS, accountStorage } from "~/services/accountStorage"
import { hasCookieInterceptorPermissions } from "~/services/permissions/permissionManager"
import { AccountStorageConfig, type SiteAccount } from "~/types"
import { isSameStringSet } from "~/utils"
import {
  registerWebRequestInterceptor,
  setupWebRequestInterceptor,
} from "~/utils/cookieHelper"
import { isProtectionBypassFirefoxEnv } from "~/utils/protectionBypass"

const temporaryUrlPatternExpiry = new Map<string, number>()
const DEFAULT_TEMP_PATTERN_TTL_MS = 5 * 60 * 1000

/**
 * Checks whether cookie interception should run (Firefox + permissions).
 * Logs helpful warnings when optional permissions were not granted.
 */
export async function checkCookieInterceptorRequirement(): Promise<boolean> {
  // 仅 Firefox 使用这个功能
  if (isProtectionBypassFirefoxEnv()) {
    // 检查权限
    const granted = await hasCookieInterceptorPermissions()
    if (!granted) {
      console.warn(
        "[Background] Required optional permissions (cookies/webRequest) are missing; skip cookie interception",
      )
    }
    return granted
  }

  // 非 Firefox 不需要拦截器
  return false
}

/**
 * Converts stored account URLs into unique origin match patterns usable by webRequest APIs.
 * @param accounts Site accounts stored locally.
 * @returns Deduplicated pattern list (origin/*).
 */
function extractAccountUrlPatterns(accounts: SiteAccount[]): string[] {
  const patterns = accounts
    .map((acc) => {
      try {
        const url = new URL(acc.site_url)
        return `${url.origin}/*`
      } catch {
        console.warn(
          `[Background] 账户 ${acc.site_name} 的 URL 无效：`,
          acc.site_url,
        )
        return null
      }
    })
    .filter((pattern): pattern is string => pattern !== null)

  // 去重
  return Array.from(new Set(patterns))
}

/**
 * Returns temporary url match patterns used to widen the webRequest listener scope.
 *
 * When patterns expire, they are removed and the interceptor registration is
 * refreshed on a best-effort basis.
 * @param now Timestamp used to evaluate expirations.
 */
function extractTemporaryUrlPatterns(now: number = Date.now()): string[] {
  let changed = false
  for (const [pattern, expiry] of temporaryUrlPatternExpiry.entries()) {
    if (expiry <= now) {
      temporaryUrlPatternExpiry.delete(pattern)
      changed = true
      console.debug(
        "[Background] Temporary cookie interceptor pattern expired:",
        pattern,
      )
    }
  }

  if (changed) {
    // Best-effort refresh; do not await here to avoid cascading failures.
    void updateCookieInterceptor()
  }

  return Array.from(temporaryUrlPatternExpiry.keys())
}

/**
 * Merge account-derived url patterns with temporary patterns.
 * @param accountPatterns Patterns derived from persisted accounts.
 */
function mergeUrlPatterns(accountPatterns: string[]): string[] {
  const merged = [...accountPatterns, ...extractTemporaryUrlPatterns()]
  return Array.from(new Set(merged))
}

/**
 * Temporarily allow-list a site origin for the cookie webRequest interceptor.
 *
 * This is used by auto-detect flows so that requests to a newly discovered site
 * can be intercepted even before the account is saved to storage.
 * @param url Any URL under the target origin.
 * @param ttlMs How long to keep the pattern alive before removing it.
 */
export async function trackCookieInterceptorUrl(
  url: string,
  ttlMs: number = DEFAULT_TEMP_PATTERN_TTL_MS,
): Promise<void> {
  if (!url) return

  let pattern: string | null = null
  try {
    const parsed = new URL(url)
    pattern = `${parsed.origin}/*`
  } catch {
    return
  }

  const now = Date.now()
  const expiry = now + Math.max(1, ttlMs)
  const previousExpiry = temporaryUrlPatternExpiry.get(pattern)
  if (!previousExpiry || previousExpiry < expiry) {
    temporaryUrlPatternExpiry.set(pattern, expiry)
  }

  console.debug("[Background] Temporary cookie interceptor pattern tracked:", {
    pattern,
    ttlMs,
  })

  setTimeout(
    () => {
      void extractTemporaryUrlPatterns(Date.now())
    },
    Math.max(1, expiry - now),
  )

  await updateCookieInterceptor()
}

/**
 * Installs the cookie interceptors if requirements are satisfied.
 * Fetches account list to derive URL patterns.
 */
export async function initializeCookieInterceptors(): Promise<void> {
  try {
    if (!(await checkCookieInterceptorRequirement())) {
      return
    }
    const accounts = await accountStorage.getAllAccounts()
    const urlPatterns = mergeUrlPatterns(extractAccountUrlPatterns(accounts))
    setupWebRequestInterceptor(urlPatterns)
  } catch (error) {
    console.error("[Background] 初始化 cookie 拦截器失败：", error)
  }
}

/**
 * Refreshes interceptor registrations when account data or permissions change.
 * Reuses URL extraction logic to keep listeners aligned with current config.
 */
async function updateCookieInterceptor(): Promise<void> {
  try {
    if (!(await checkCookieInterceptorRequirement())) {
      return
    }
    const accounts = await accountStorage.getAllAccounts()
    const urlPatterns = mergeUrlPatterns(extractAccountUrlPatterns(accounts))
    registerWebRequestInterceptor(urlPatterns)
  } catch (error) {
    console.error("[Background] 更新 cookie 拦截器失败：", error)
  }
}

/**
 * Extracts unique origin-based URL patterns from stored account data.
 * @param value Raw storage value (string or parsed object).
 * @returns Set of URL patterns in the format `origin/*`.
 */
function extractStoredAccountUrlPatternSet(value: unknown): Set<string> {
  // Initialize empty set
  const patterns = new Set<string>()
  // Return empty set if no value
  if (!value) {
    return patterns
  }

  // Handle both string (serialized) and object (direct) inputs
  let data: AccountStorageConfig | undefined
  if (typeof value === "string") {
    try {
      data = JSON.parse(value)
    } catch (e) {
      console.log("[Background] 解析变更数据失败：", e)
      return patterns
    }
  } else if (typeof value === "object" && value !== null) {
    data = value as AccountStorageConfig
  }

  // Extract accounts from parsed data
  const accounts: SiteAccount[] = data?.accounts ?? []

  // Add each account's origin to the set
  for (const account of accounts) {
    const siteUrl = account.site_url
    try {
      const url = new URL(siteUrl)
      patterns.add(url.origin)
    } catch {
      console.warn("[Background] 无效的 URL:", siteUrl)
    }
  }
  return patterns
}

/**
 * Handles storage change events to refresh interceptors when site accounts update.
 * @param changes Storage diff payload.
 * @param areaName Storage area name (local/sync/etc).
 */
async function handleStorageChanged(
  changes: Record<string, browser.storage.StorageChange>,
  areaName: string,
) {
  // Only care about local storage changes
  if (areaName !== "local") return
  // Check if cookie interceptor is required
  if (!(await checkCookieInterceptorRequirement())) {
    return
  }

  // Extract account storage changes
  const siteAccountsChange = changes[ACCOUNT_STORAGE_KEYS.ACCOUNTS] as {
    oldValue?: AccountStorageConfig
    newValue?: AccountStorageConfig
  }
  if (!siteAccountsChange) return

  // Extract old and new patterns from storage changes
  const oldPatterns = extractStoredAccountUrlPatternSet(
    siteAccountsChange.oldValue,
  )
  const newPatterns = extractStoredAccountUrlPatternSet(
    siteAccountsChange.newValue,
  )

  // Skip if patterns are the same
  if (isSameStringSet(oldPatterns, newPatterns)) {
    return
  }

  console.log("[Background] 账户 URL 已变更，正在更新拦截器")
  void updateCookieInterceptor().catch((error) => {
    console.error("[Background] 更新 cookie 拦截器失败：", error)
  })
}

/**
 * Registers listeners to keep cookie interception lifecycle in sync with storage and permission changes.
 */
export function setupCookieInterceptorListeners() {
  // Listen for storage changes
  browser.storage.onChanged.addListener(handleStorageChanged)

  // Listen for permission additions and removals
  chrome.permissions.onAdded.addListener(updateCookieInterceptor)
  chrome.permissions.onRemoved.addListener(updateCookieInterceptor)
}
