import { getSiteApiRouter } from "~/constants/siteType"
import type { DisplaySiteData } from "~/types"
import { isExtensionPopup, OPTIONS_PAGE_URL } from "~/utils/browser"
import {
  openSidePanel as _openSidePanel,
  createTab as createTabApi,
  focusTab,
  getExtensionURL,
} from "~/utils/browserApi"
import { joinUrl } from "~/utils/url"

/**
 * Closes the current window when running inside the extension popup.
 * Safe to call in other contexts; it no-ops when not in popup.
 */
export function closeIfPopup() {
  if (isExtensionPopup()) {
    window.close()
  }
}

/**
 * Detects whether the current page is the extension options page.
 * @returns True if the current location matches OPTIONS_PAGE_URL.
 */
const isOnOptionsPage = () => {
  if (typeof window === "undefined") {
    return false
  }

  try {
    const currentUrl = new URL(window.location.href)
    const optionsUrl = new URL(OPTIONS_PAGE_URL)
    return (
      currentUrl.origin === optionsUrl.origin &&
      currentUrl.pathname === optionsUrl.pathname
    )
  } catch (error) {
    console.error("Failed to detect options page:", error)
    return false
  }
}

/**
 * Builds a serialized search string from the provided params.
 * @param params Query key-value pairs where undefined values are ignored.
 * @returns A query string starting with ? or an empty string when no params.
 */
const buildSearchString = (params?: Record<string, string | undefined>) => {
  if (!params) {
    return ""
  }

  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === "undefined") {
      return
    }
    searchParams.set(key, value)
  })

  const query = searchParams.toString()
  return query ? `?${query}` : ""
}

/**
 * Updates the hash/search of the current options page without full reload.
 * Dispatches a hashchange event when URL remains unchanged to notify listeners.
 * @param hash Target hash (including #).
 * @param searchParams Optional query params to set.
 */
export const navigateWithinOptionsPage = (
  hash: string,
  searchParams?: Record<string, string | undefined>,
) => {
  if (typeof window === "undefined") {
    return
  }

  const currentUrl = new URL(window.location.href)
  const nextUrl = new URL(window.location.href)

  if (searchParams) {
    nextUrl.search = buildSearchString(searchParams)
  }

  nextUrl.hash = hash

  if (nextUrl.href === currentUrl.href) {
    window.dispatchEvent(new Event("hashchange"))
    return
  }

  window.history.replaceState(null, "", nextUrl.toString())
  window.dispatchEvent(new Event("hashchange"))
}

const getAccountHash = () => "#account"

const getBasicSettingsHash = () => "#basic"

const getAboutHash = () => "#about"

/**
 * Creates and activates a new browser tab with the given URL.
 * @param url Target URL to open.
 */
const createActiveTab = async (url: string): Promise<void> => {
  await createTabApi(url, true)
}

/**
 * Updates an existing tab with new properties.
 * @param tabId Target tab ID.
 * @param updateInfo Fields to update on the tab.
 */
const updateTab = async (
  tabId: number,
  updateInfo: browser.tabs._UpdateUpdateProperties,
): Promise<void> => {
  await browser.tabs.update(tabId, updateInfo)
}

/**
 * Brings a tab's window to the foreground.
 * @param tab Browser tab to focus.
 */
const focusWindow = async (tab: browser.tabs.Tab) => {
  await focusTab(tab)
}

/**
 * Queries tabs with error handling and executes a callback with results.
 * @param queryInfo Tab query filter.
 * @param callback Invoked with matched tabs.
 */
const queryTabs = async (
  queryInfo: browser.tabs._QueryQueryInfo,
  callback: (tabs: browser.tabs.Tab[]) => void,
): Promise<void> => {
  try {
    const tabs = await browser.tabs.query(queryInfo)
    if (tabs) {
      callback(tabs)
    }
  } catch (error) {
    console.error(error)
  }
}

export const openOrFocusOptionsPage = (
  hash: string,
  searchParams?: Record<string, string | undefined>,
) => {
  const searchString = buildSearchString(searchParams)
  const baseUrl = `${OPTIONS_PAGE_URL}${searchString}${hash}`

  queryTabs({}, (tabs) => {
    // 查找是否已存在忽略查询参数的 options 页
    const optionsPageTab = tabs.find((tab) => {
      if (!tab.url) return false
      try {
        const tabUrl = new URL(tab.url)
        const normalizedUrl = `${tabUrl.origin}${tabUrl.pathname}${tabUrl.search}${tabUrl.hash}`
        return normalizedUrl === baseUrl
      } catch {
        return false
      }
    })

    let urlWithHash: string

    if (optionsPageTab) {
      // 已存在 → 加上 refresh 参数以强制刷新
      const url = new URL(baseUrl)
      url.searchParams.set("refresh", "true")
      url.searchParams.set("t", Date.now().toString())
      urlWithHash = url.href
    } else {
      // 不存在 → 直接使用基础 URL
      urlWithHash = baseUrl
    }

    // 打开或聚焦
    if (optionsPageTab?.id) {
      updateTab(optionsPageTab.id, { active: true, url: urlWithHash })
      focusWindow(optionsPageTab)
    } else {
      createActiveTab(urlWithHash)
    }
  })
}
/**
 * Wraps a function to auto-close the popup after execution when applicable.
 * @param fn Function to run before optional popup close.
 * @returns Wrapped function that preserves original return value.
 */
const withPopupClose = <T extends any[]>(
  fn: (...args: T) => Promise<void> | void,
) => {
  return async (...args: T) => {
    await fn(...args)
    closeIfPopup()
  }
}

// 重构后的函数 - 去掉 closeIfPopup
const _openFullManagerPage = (params?: { search?: string }) => {
  const targetHash = getAccountHash()
  const searchParams = params?.search ? { search: params.search } : undefined

  if (isOnOptionsPage()) {
    navigateWithinOptionsPage(targetHash, searchParams)
    return
  }

  openOrFocusOptionsPage(targetHash, searchParams)
}

/**
 * Navigates to the basic settings area, optionally focusing a sub-tab.
 * @param tabId Optional tab ID within settings.
 */
const navigateToBasicSettings = (tabId?: string) => {
  const targetHash = getBasicSettingsHash()
  const searchParams = tabId ? { tab: tabId } : undefined

  if (isOnOptionsPage()) {
    navigateWithinOptionsPage(targetHash, searchParams)
    return
  }

  openOrFocusOptionsPage(targetHash, searchParams)
}

const _openSettingsPage = () => {
  navigateToBasicSettings()
}

/**
 * Opens a specific settings tab by ID.
 * @param tabId Settings tab identifier.
 */
const _openSettingsTab = (tabId: string) => {
  navigateToBasicSettings(tabId)
}

/**
 * Opens the About section inside the options page.
 */
const _openAboutPage = () => {
  const targetHash = getAboutHash()
  openOrFocusOptionsPage(targetHash)
}

/**
 * Opens the Keys page, optionally pre-selecting an account.
 * @param accountId Optional account id to prefill.
 */
const _openKeysPage = async (accountId?: string) => {
  const baseUrl = getExtensionURL("options.html")
  const url = new URL(baseUrl)

  if (accountId) {
    url.searchParams.set("accountId", accountId)
  }

  url.hash = "keys"
  await createActiveTab(url.toString())
}

/**
 * Opens the Models page, optionally pre-selecting an account.
 * @param accountId Optional account id to prefill.
 */
const _openModelsPage = async (accountId?: string) => {
  const baseUrl = getExtensionURL("options.html")
  const url = new URL(baseUrl)

  if (accountId) {
    url.searchParams.set("accountId", accountId)
  }

  url.hash = "models"
  await createActiveTab(url.toString())
}

const _openUsagePage = async (account: DisplaySiteData) => {
  const logUrl = joinUrl(
    account.baseUrl,
    getSiteApiRouter(account.siteType).usagePath,
  )
  await createActiveTab(logUrl)
}

/**
 * Opens the check-in page for a given account.
 * Prefers custom check-in URL when available.
 */
const _openCheckInPage = async (account: DisplaySiteData) => {
  const checkInUrl = joinUrl(
    account.baseUrl,
    getSiteApiRouter(account.siteType).checkInPath,
  )
  await createActiveTab(checkInUrl)
}

/**
 * Opens the custom check-in page or falls back to default check-in path.
 */
const _openCustomCheckInPage = async (account: DisplaySiteData) => {
  const customCheckInUrl =
    account.checkIn?.customCheckInUrl ||
    joinUrl(account.baseUrl, getSiteApiRouter(account.siteType).checkInPath)
  await createActiveTab(customCheckInUrl)
}

/**
 * Opens redeem page using custom or default path.
 */
const _openRedeemPage = async (account: DisplaySiteData) => {
  const redeemUrl =
    account.checkIn?.customRedeemUrl ||
    joinUrl(account.baseUrl, getSiteApiRouter(account.siteType).redeemPath)
  await createActiveTab(redeemUrl)
}

// 导出带自动关闭的版本
export const openFullAccountManagerPage = withPopupClose(() =>
  _openFullManagerPage(),
)
export const openAccountManagerWithSearch = withPopupClose((search: string) =>
  _openFullManagerPage({ search }),
)
export const openSettingsPage = withPopupClose(_openSettingsPage)
export const openSettingsTab = withPopupClose(_openSettingsTab)
export const openSidePanelPage = withPopupClose(_openSidePanel)
export const openAboutPage = withPopupClose(_openAboutPage)
export const openKeysPage = withPopupClose(_openKeysPage)
export const openModelsPage = withPopupClose(_openModelsPage)
export const openUsagePage = withPopupClose(_openUsagePage)
export const openCheckInPage = withPopupClose(_openCheckInPage)
export const openCustomCheckInPage = withPopupClose(_openCustomCheckInPage)
export const openRedeemPage = withPopupClose(_openRedeemPage)

/**
 * Executes multiple navigation operations concurrently and closes popup.
 * @param operations List of actions to run.
 */
export const openMultiplePages = async (
  operations: (() => Promise<void> | void)[],
) => {
  await Promise.all(operations.map((op) => op()))
  closeIfPopup()
}

/**
 * Opens both redeem and check-in pages in parallel.
 * @param account Target account.
 */
export const openCheckInAndRedeem = async (account: DisplaySiteData) => {
  await openMultiplePages([
    () => _openRedeemPage(account),
    () => _openCustomCheckInPage(account),
  ])
}
