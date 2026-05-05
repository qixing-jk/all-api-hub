import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { replaceWithinOptionsPage } from "~/utils/navigation"

import type { OptionsSearchItem } from "./types"

export const OPTIONS_SEARCH_HIGHLIGHT_PARAM = "highlight"
export const OPTIONS_SEARCH_ANCHOR_PARAM = "anchor"
const OPTIONS_SEARCH_TAB_PARAM = "tab"
const OPTIONS_SEARCH_HIGHLIGHT_CLASSNAMES = [
  "ring-2",
  "ring-blue-500",
  "ring-offset-2",
  "ring-offset-white",
  "dark:ring-offset-slate-900",
]

/**
 * Navigates to the page, tab, and target referenced by a selected search item.
 */
export function navigateFromSearchItem(
  item: OptionsSearchItem,
  onPageNavigate: (
    pageId: string,
    params?: Record<string, string | undefined>,
  ) => void,
) {
  if (item.kind === "page") {
    onPageNavigate(item.pageId)
    return
  }

  const targetId = item.targetId
  const searchParams: Record<string, string | undefined> = {}

  if (item.pageId === MENU_ITEM_IDS.BASIC && item.tabId) {
    searchParams[OPTIONS_SEARCH_TAB_PARAM] = item.tabId
  }

  if (targetId) {
    searchParams[OPTIONS_SEARCH_ANCHOR_PARAM] = targetId
    searchParams[OPTIONS_SEARCH_HIGHLIGHT_PARAM] = targetId
  }

  onPageNavigate(item.pageId, searchParams)
}

/**
 * Removes the temporary highlight query parameter from the current options URL.
 */
export function clearHighlightSearchParam() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has(OPTIONS_SEARCH_HIGHLIGHT_PARAM)) {
    return
  }

  url.searchParams.delete(OPTIONS_SEARCH_HIGHLIGHT_PARAM)
  replaceWithinOptionsPage(
    url.hash || `#${MENU_ITEM_IDS.BASIC}`,
    Object.fromEntries(url.searchParams.entries()),
  )
}

/**
 * Scrolls to and temporarily highlights the target element for a search result.
 */
export function highlightSearchTarget(targetId: string) {
  const element = document.getElementById(targetId)
  if (!element) {
    return false
  }

  element.scrollIntoView({ behavior: "smooth", block: "start" })
  element.classList.add(...OPTIONS_SEARCH_HIGHLIGHT_CLASSNAMES)
  window.setTimeout(() => {
    element.classList.remove(...OPTIONS_SEARCH_HIGHLIGHT_CLASSNAMES)
  }, 1800)

  return true
}
