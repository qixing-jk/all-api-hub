import {
  MENU_ITEM_IDS,
  type OptionsMenuItemId,
} from "~/constants/optionsMenuIds"
import { getSiteApiRouter } from "~/constants/siteType"
import type { DisplaySiteData } from "~/types"
import { isExtensionPopup, OPTIONS_PAGE_URL } from "~/utils/browser"
import {
  openSidePanel as _openSidePanel,
  createTab as createTabApi,
  focusTab,
  getExtensionURL,
} from "~/utils/browserApi"
import { createLogger } from "~/utils/logger"
import { joinUrl } from "~/utils/url"

/**
 * Unified logger scoped to navigation helpers and options-page routing.
 */
const logger = createLogger("Navigation")

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
 * Opens/focuses the options page for a specific menu item id.
 * Prefer this helper over passing ad-hoc hash strings.
 */
export const openOrFocusOptionsMenuItem = (
  menuItemId: OptionsMenuItemId,
  searchParams?: Record<string, string | undefined>,
) => {
  openOrFocusOptionsPage(`#${menuItemId}`, searchParams)
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
    logger.warn("Failed to detect options page", error)
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

/**
 * Normalized hash used by account manager navigations to keep routing consistent.
 */
const getAccountHash = () => `#${MENU_ITEM_IDS.ACCOUNT}`

/**
 * Normalized hash used by bookmark manager navigations to keep routing consistent.
 */
const getBookmarkHash = () => `#${MENU_ITEM_IDS.BOOKMARK}`

/**
 * Canonical hash for the default settings landing page, reused across helpers.
 */
const getBasicSettingsHash = () => `#${MENU_ITEM_IDS.BASIC}`

/**
 * Hash fragment pointing to the About section inside options.html.
 */
const getAboutHash = () => `#${MENU_ITEM_IDS.ABOUT}`

/**
 * Hash fragment pointing to Managed Site channel management inside options.html.
 */
const getManagedSiteChannelsHash = () =>
  `#${MENU_ITEM_IDS.MANAGED_SITE_CHANNELS}`

/**
 * Hash fragment pointing to Managed Site model sync inside options.html.
 */
const getManagedSiteModelSyncHash = () =>
  `#${MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC}`

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
    logger.warn("Failed to query tabs", error)
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

/**
 * Opens or focuses the account manager page, preferring in-page navigation when already on options.html.
 * @param params Optional query parameters to prefilter accounts.
 * @param params.search Search keyword applied to the manager list.
 */
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
 * Opens or focuses the bookmark manager page, preferring in-page navigation when already on options.html.
 * @param params Optional query parameters to prefilter bookmarks.
 * @param params.search Search keyword applied to the bookmark list.
 */
const _openFullBookmarkManagerPage = (params?: { search?: string }) => {
  const targetHash = getBookmarkHash()
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

/**
 * Opens Managed Site channel management, optionally focusing a channel id.
 */
const _openManagedSiteChannelsPage = (params?: {
  channelId?: number | string
}) => {
  const targetHash = getManagedSiteChannelsHash()
  const searchParams =
    params?.channelId != null ? { channelId: String(params.channelId) } : {}

  if (isOnOptionsPage()) {
    navigateWithinOptionsPage(targetHash, searchParams)
    return
  }

  openOrFocusOptionsPage(targetHash, searchParams)
}

type ManagedSiteModelSyncTab = "history" | "manual"

/**
 * Opens Managed Site model sync dashboard, optionally focusing a channel and tab.
 */
const _openManagedSiteModelSyncPage = (params?: {
  channelId?: number | string
  tab?: ManagedSiteModelSyncTab
}) => {
  const targetHash = getManagedSiteModelSyncHash()
  const searchParams: Record<string, string | undefined> = {}

  if (params?.channelId != null) {
    searchParams.channelId = String(params.channelId)
  }

  if (params?.tab) {
    searchParams.tab = params.tab
  }

  const resolvedParams = Object.keys(searchParams).length ? searchParams : {}

  if (isOnOptionsPage()) {
    navigateWithinOptionsPage(targetHash, resolvedParams)
    return
  }

  openOrFocusOptionsPage(targetHash, resolvedParams)
}

/**
 * Jump to the default settings page hash, reusing the current options tab when
 * possible to minimize flicker and redundant windows.
 */
const _openSettingsPage = () => {
  navigateToBasicSettings()
}

/**
 * Navigates directly to a named settings tab.
 * @param tabId Unique identifier for the tab to activate.
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

  url.hash = MENU_ITEM_IDS.KEYS
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

  url.hash = MENU_ITEM_IDS.MODELS
  await createActiveTab(url.toString())
}

/**
 * Opens the stored account's base URL in a new browser tab.
 * This remains available even when the account is disabled so users can still reach the provider site.
 * @param account Account metadata containing the base URL to open.
 */
const _openAccountBaseUrl = async (
  account: Pick<DisplaySiteData, "baseUrl">,
) => {
  await createActiveTab(account.baseUrl)
}

/**
 * Opens the provider usage log endpoint derived from account metadata.
 * @param account Account definition containing base URL and site type.
 */
const _openUsagePage = async (account: DisplaySiteData) => {
  const logUrl = joinUrl(
    account.baseUrl,
    getSiteApiRouter(account.siteType).usagePath,
  )
  await createActiveTab(logUrl)
}

/**
 * Opens the default check-in page for a given account.
 * @param account Account metadata used to resolve the check-in URL.
 */
const _openCheckInPage = async (account: DisplaySiteData) => {
  const checkInUrl = joinUrl(
    account.baseUrl,
    getSiteApiRouter(account.siteType).checkInPath,
  )
  await createActiveTab(checkInUrl)
}

/**
 * Opens the account's custom check-in URL when present, otherwise falls back to
 * the default site-specific path so manual overrides keep working.
 * @param account Account metadata that may contain a custom check-in URL.
 */
const _openCustomCheckInPage = async (account: DisplaySiteData) => {
  const customCheckInUrl =
    account.checkIn?.customCheckIn?.url ||
    joinUrl(account.baseUrl, getSiteApiRouter(account.siteType).checkInPath)
  await createActiveTab(customCheckInUrl)
}

/**
 * Opens the redeem flow, honoring custom URLs when available.
 * @param account Account metadata that can optionally override redeem path.
 */
const _openRedeemPage = async (account: DisplaySiteData) => {
  const redeemUrl =
    account.checkIn?.customCheckIn?.redeemUrl ||
    joinUrl(account.baseUrl, getSiteApiRouter(account.siteType).redeemPath)
  await createActiveTab(redeemUrl)
}

// 导出带自动关闭的版本
/**
 * Launch the account manager root view, auto-closing the popup when invoked
 * from popup.html to prevent duplicate UI shells.
 */
export const openFullAccountManagerPage = withPopupClose(() =>
  _openFullManagerPage(),
)

/**
 * Open the account manager filtered by the provided search string before
 * closing the popup, keeping the flow consistent with popup interactions.
 */
export const openAccountManagerWithSearch = withPopupClose((search: string) =>
  _openFullManagerPage({ search }),
)

/**
 * Launch the bookmark manager root view, auto-closing the popup when invoked
 * from popup.html to prevent duplicate UI shells.
 */
export const openFullBookmarkManagerPage = withPopupClose(() =>
  _openFullBookmarkManagerPage(),
)

/**
 * Open the bookmark manager filtered by the provided search string before
 * closing the popup, keeping the flow consistent with popup interactions.
 */
export const openBookmarkManagerWithSearch = withPopupClose((search: string) =>
  _openFullBookmarkManagerPage({ search }),
)

/**
 * Navigate to the default settings landing section and close the popup if
 * applicable, so the user ends up in the options page only.
 */
export const openSettingsPage = withPopupClose(_openSettingsPage)

/**
 * Open a specific settings tab while ensuring popup teardown happens after
 * dispatching the navigation request.
 */
export const openSettingsTab = withPopupClose(_openSettingsTab)
export const openAutoCheckinPage = withPopupClose(
  (searchParams?: Record<string, string | undefined>) =>
    openOrFocusOptionsMenuItem(MENU_ITEM_IDS.AUTO_CHECKIN, searchParams),
)

/**
 * Open the extension side panel (if supported) and close the popup afterward to
 * avoid overlapping surfaces.
 */
export const openSidePanelPage = withPopupClose(async () => {
  try {
    await _openSidePanel()
  } catch (error) {
    logger.warn("Side panel unavailable, opening settings instead", error)
    openOrFocusOptionsMenuItem(MENU_ITEM_IDS.BASIC)
  }
})

/**
 * Jump straight to the About section inside the options page and close the
 * popup to keep focus on the destination UI.
 */
export const openAboutPage = withPopupClose(_openAboutPage)

/**
 * Open the Keys management page, forwarding optional account focus, then close
 * the popup to free screen real estate.
 */
export const openKeysPage = withPopupClose(_openKeysPage)

/**
 * Open the Models management page for the given account context and close the
 * popup afterwards.
 */
export const openModelsPage = withPopupClose(_openModelsPage)

/**
 * Open the stored account's base URL in a new tab and auto-close the popup when triggered from popup.html.
 */
export const openAccountBaseUrl = withPopupClose(_openAccountBaseUrl)

/**
 * Open Managed Site channel management and close the popup afterwards.
 */
export const openManagedSiteChannelsPage = withPopupClose(
  _openManagedSiteChannelsPage,
)

/**
 * Open Managed Site channel management focused on a single channel id.
 */
export const openManagedSiteChannelsForChannel = withPopupClose(
  (channelId: number) => _openManagedSiteChannelsPage({ channelId }),
)

/**
 * Open Managed Site model sync dashboard and close the popup afterwards.
 */
export const openManagedSiteModelSyncPage = withPopupClose(
  _openManagedSiteModelSyncPage,
)

/**
 * Open Managed Site model sync dashboard focused on a single channel.
 */
export const openManagedSiteModelSyncForChannel = withPopupClose(
  (channelId: number) =>
    _openManagedSiteModelSyncPage({ channelId, tab: "manual" }),
)

/**
 * Open the provider's usage log page and auto-close the popup when triggered
 * from compact contexts.
 */
export const openUsagePage = withPopupClose(_openUsagePage)

/**
 * Open the default check-in page for the provided account and shut down the
 * popup shell once the navigation has been requested.
 */
export const openCheckInPage = withPopupClose(_openCheckInPage)

/**
 * Open the account's custom check-in location when defined (falling back to
 * default) and close the popup to avoid redundant windows.
 */
export const openCustomCheckInPage = withPopupClose(_openCustomCheckInPage)

/**
 * Open the redeem page (custom or default path) and close the popup afterwards
 * so the user focuses on the newly opened tab.
 */
export const openRedeemPage = withPopupClose(_openRedeemPage)

/**
 * Execute multiple navigation operations concurrently and close the popup once
 * every action has completed.
 * @param operations List of async/sync navigation callbacks to run together.
 */
export const openMultiplePages = async (
  operations: (() => Promise<void> | void)[],
) => {
  await Promise.all(operations.map((op) => op()))
  closeIfPopup()
}

/**
 * Open both redeem and check-in pages in parallel for the given account,
 * leveraging {@link openMultiplePages} to minimize popup churn.
 * @param account Target account.
 */
export const openCheckInAndRedeem = async (account: DisplaySiteData) => {
  await openMultiplePages([
    () => _openRedeemPage(account),
    () => _openCustomCheckInPage(account),
  ])
}
