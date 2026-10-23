import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"

import type { OptionsSearchItem } from "./types"

export const OPTIONS_SEARCH_HIGHLIGHT_PARAM = "highlight"
export const OPTIONS_SEARCH_ANCHOR_PARAM = "anchor"
const OPTIONS_SEARCH_TAB_PARAM = "tab"

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
  url.hash ||= `#${MENU_ITEM_IDS.OVERVIEW}`
  // Consuming a one-shot marker is not another navigation request.
  window.history.replaceState(window.history.state, "", url.toString())
}
