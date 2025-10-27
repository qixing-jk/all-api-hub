import { getSiteApiRouter } from "~/constants/siteType"
import type { DisplaySiteData } from "~/types"
import { isExtensionPopup, OPTIONS_PAGE_URL } from "~/utils/browser.ts"
import {
  openSidePanel as _openSidePanel,
  createTab as createTabApi,
  focusTab,
  getExtensionURL
} from "~/utils/browserApi"
import { joinUrl } from "~/utils/url"

export function closeIfPopup() {
  if (isExtensionPopup()) {
    window.close()
  }
}

/**
 * Creates a new tab with the specified URL
 * @param url - The URL to open in the new tab
 */
const createActiveTab = async (url: string): Promise<void> => {
  await createTabApi(url, true)
}

/**
 * Updates an existing tab with the provided update info
 * @param tabId - The ID of the tab to update
 * @param updateInfo - The properties to update on the tab
 */
const updateTab = async (
  tabId: number,
  updateInfo: browser.tabs._UpdateUpdateProperties
): Promise<void> => {
  await browser.tabs.update(tabId, updateInfo)
}

/**
 * Focuses a window by bringing it to the foreground
 * @param tab
 */
const focusWindow = async (tab: browser.tabs.Tab) => {
  await focusTab(tab)
}

/**
 * Queries tabs based on the provided query criteria with error handling
 * @param queryInfo - The query criteria for filtering tabs
 * @param callback - Function to execute with the query results
 */
const queryTabs = async (
  queryInfo: browser.tabs._QueryQueryInfo,
  callback: (tabs: browser.tabs.Tab[]) => void
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

export const openOrFocusOptionsPage = (hash: string) => {
  const baseUrl = `${OPTIONS_PAGE_URL}${hash}`

  queryTabs({}, (tabs) => {
    // 查找是否已存在忽略查询参数的 options 页
    const optionsPageTab = tabs.find((tab) => {
      if (!tab.url) return false
      try {
        const tabUrl = new URL(tab.url)
        const normalizedUrl = `${tabUrl.origin}${tabUrl.pathname}${tabUrl.hash}`
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
// 核心工具函数
const withPopupClose = <T extends any[]>(
  fn: (...args: T) => Promise<void> | void
) => {
  return async (...args: T) => {
    await fn(...args)
    closeIfPopup()
  }
}

// 重构后的函数 - 去掉 closeIfPopup
const _openFullManagerPage = () => {
  openOrFocusOptionsPage("#account")
}

const _openSettingsPage = () => {
  openOrFocusOptionsPage("#basic")
}

const _openKeysPage = async (accountId?: string) => {
  const url = accountId
    ? getExtensionURL(`options.html#keys?accountId=${accountId}`)
    : getExtensionURL("options.html#keys")
  await createActiveTab(url)
}

const _openModelsPage = async (accountId?: string) => {
  const url = accountId
    ? getExtensionURL(`options.html#models?accountId=${accountId}`)
    : getExtensionURL("options.html#models")
  await createActiveTab(url)
}

const _openUsagePage = async (account: DisplaySiteData) => {
  const logUrl = joinUrl(
    account.baseUrl,
    getSiteApiRouter(account.siteType).usagePath
  )
  await createActiveTab(logUrl)
}

const _openCheckInPage = async (account: DisplaySiteData) => {
  const checkInUrl = joinUrl(
    account.baseUrl,
    getSiteApiRouter(account.siteType).checkInPath
  )
  await createActiveTab(checkInUrl)
}

const _openCustomCheckInPage = async (account: DisplaySiteData) => {
  const customCheckInUrl =
    account.checkIn?.customCheckInUrl ||
    joinUrl(account.baseUrl, getSiteApiRouter(account.siteType).checkInPath)
  await createActiveTab(customCheckInUrl)
}

const _openRedeemPage = async (account: DisplaySiteData) => {
  const redeemUrl =
    account.checkIn?.customRedeemUrl ||
    joinUrl(account.baseUrl, getSiteApiRouter(account.siteType).redeemPath)
  await createActiveTab(redeemUrl)
}

// 导出带自动关闭的版本
export const openFullManagerPage = withPopupClose(_openFullManagerPage)
export const openSettingsPage = withPopupClose(_openSettingsPage)
export const openSidePanel = withPopupClose(_openSidePanel)
export const openKeysPage = withPopupClose(_openKeysPage)
export const openModelsPage = withPopupClose(_openModelsPage)
export const openUsagePage = withPopupClose(_openUsagePage)
export const openCheckInPage = withPopupClose(_openCheckInPage)
export const openCustomCheckInPage = withPopupClose(_openCustomCheckInPage)
export const openRedeemPage = withPopupClose(_openRedeemPage)

// 批量操作
export const openMultiplePages = async (
  operations: (() => Promise<void> | void)[]
) => {
  await Promise.all(operations.map((op) => op()))
  closeIfPopup()
}

export const openCheckInAndRedeem = async (account: DisplaySiteData) => {
  await openMultiplePages([
    () => _openRedeemPage(account),
    () => _openCustomCheckInPage(account)
  ])
}
