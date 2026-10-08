import type { OptionsMenuItemId } from "~/constants/optionsMenuIds"
import {
  createTab as createTabApi,
  focusTab,
  getExtensionURL,
  queryTabs as queryTabsApi,
  updateTab as updateTabApi,
} from "~/utils/browser/browserApi"
import { OPTIONS_PAGE_URL } from "~/utils/browser/extensionPageUrls"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("Navigation")

/**
 * Detects whether the current page is the extension options page.
 * @returns True if the current location matches OPTIONS_PAGE_URL.
 */
export const isOnOptionsPage = () => {
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
export const buildSearchString = (
  params?: Record<string, string | undefined>,
) => {
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
 * @param options Optional navigation behavior overrides.
 * @param options.historyMode Choose whether the in-page navigation replaces the
 * current history entry or pushes a new one that the browser back button can revisit.
 */
export const navigateWithinOptionsPage = (
  hash: string,
  searchParams?: Record<string, string | undefined>,
  options?: {
    historyMode?: "replace" | "push"
  },
) => {
  if (typeof window === "undefined") {
    return
  }

  const currentUrl = new URL(window.location.href)
  const nextUrl = new URL(window.location.href)

  nextUrl.search = buildSearchString(searchParams)

  nextUrl.hash = hash

  if (nextUrl.href === currentUrl.href) {
    window.dispatchEvent(new Event("hashchange"))
    return
  }

  const historyMethod =
    options?.historyMode === "push" ? "pushState" : "replaceState"
  window.history[historyMethod](null, "", nextUrl.toString())
  window.dispatchEvent(new Event("hashchange"))
}

/**
 * Replaces the current options-page history entry while updating hash/search.
 * Use this for URL normalization or in-place state sync that should not create
 * an extra browser back entry.
 */
export const replaceWithinOptionsPage = (
  hash: string,
  searchParams?: Record<string, string | undefined>,
) => navigateWithinOptionsPage(hash, searchParams, { historyMode: "replace" })

/**
 * Pushes a new options-page history entry while updating hash/search.
 * Use this for user-initiated transitions that leave the current workflow and
 * should be reversible via the browser back button.
 */
export const pushWithinOptionsPage = (
  hash: string,
  searchParams?: Record<string, string | undefined>,
) => navigateWithinOptionsPage(hash, searchParams, { historyMode: "push" })

/**
 * Queries tabs with error handling and executes a callback with results.
 * @param queryInfo Tab query filter.
 */
const queryTabs = async (
  queryInfo: browser.tabs._QueryQueryInfo,
): Promise<browser.tabs.Tab[]> => {
  try {
    return (await queryTabsApi(queryInfo)) || []
  } catch (error) {
    logger.warn("Failed to query tabs", error)
    return []
  }
}

export const openOrFocusOptionsPage = async (
  hash: string,
  searchParams?: Record<string, string | undefined>,
): Promise<void> => {
  const searchString = buildSearchString(searchParams)
  const baseUrl = `${OPTIONS_PAGE_URL}${searchString}${hash}`
  const tabs = await queryTabs({})

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
    const url = new URL(baseUrl)
    url.searchParams.set("refresh", "true")
    url.searchParams.set("t", Date.now().toString())
    urlWithHash = url.href
  } else {
    urlWithHash = baseUrl
  }

  if (optionsPageTab?.id) {
    await updateTabApi(optionsPageTab.id, { active: true, url: urlWithHash })
    await focusTab(optionsPageTab)
    return
  }

  await createTabApi(urlWithHash, true)
}

/**
 * Opens/focuses the options page for a specific menu item id.
 * Prefer this helper over passing ad-hoc hash strings.
 */
export const openOrFocusOptionsMenuItem = (
  menuItemId: OptionsMenuItemId,
  searchParams?: Record<string, string | undefined>,
) => {
  return openOrFocusOptionsPage(`#${menuItemId}`, searchParams)
}

export const openTargetedOptionsPage = async (params: {
  targetHash: string
  inPageSearchParams?: Record<string, string | undefined>
  newTabSearchParams?: Record<string, string | undefined>
}) => {
  if (isOnOptionsPage()) {
    pushWithinOptionsPage(params.targetHash, params.inPageSearchParams)
    return
  }

  const baseUrl = getExtensionURL("options.html")
  await createTabApi(
    `${baseUrl}${buildSearchString(params.newTabSearchParams)}${params.targetHash}`,
    true,
  )
}
