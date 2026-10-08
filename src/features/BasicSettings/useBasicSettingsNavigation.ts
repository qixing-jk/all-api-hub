import { useCallback, useEffect, useMemo, useState } from "react"

import {
  BASIC_SETTINGS_ANCHOR_TO_TAB,
  BASIC_SETTINGS_TAB_IDS,
  type BasicSettingsTabId as TabId,
} from "~/constants/basicSettingsTabs"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  clearHighlightSearchParam,
  highlightSearchTarget,
  OPTIONS_SEARCH_HIGHLIGHT_PARAM,
} from "~/features/OptionsSearch/navigation"
import {
  navigateToAnchor,
  parseTabFromUrl,
  updateUrlWithTab,
} from "~/utils/core/url"

/**
 * Resolve legacy anchor-only Basic Settings links to the tab that owns them.
 * New overview/search links pass an explicit `tab` param; this fallback can be
 * removed after old anchor-only URLs no longer need compatibility.
 */
function getTabFromSearchAnchor(): TabId | null {
  if (typeof window === "undefined") {
    return null
  }

  const anchor = new URLSearchParams(window.location.search)
    .get("anchor")
    ?.trim()

  return anchor ? BASIC_SETTINGS_ANCHOR_TO_TAB[anchor] ?? null : null
}

/**
 * Resolve the currently requested Basic Settings tab from the URL state.
 */
function resolveSelectedTabIndexFromUrl(
  tabConfigs: readonly { id: TabId }[],
): number {
  if (typeof window === "undefined") {
    return 0
  }

  const { tab, anchor, isHeadingAnchor } = parseTabFromUrl({
    ignoreAnchors: [MENU_ITEM_IDS.BASIC],
    defaultHashPage: MENU_ITEM_IDS.BASIC,
  })

  if (tab) {
    const normalizedTab =
      tab === "sync" ? BASIC_SETTINGS_TAB_IDS.AccountUsage : tab
    const index = tabConfigs.findIndex((config) => config.id === normalizedTab)
    if (index >= 0) {
      return index
    }
  }

  const tabFromSearchAnchor = getTabFromSearchAnchor()
  if (tabFromSearchAnchor) {
    const index = tabConfigs.findIndex(
      (config) => config.id === tabFromSearchAnchor,
    )
    if (index >= 0) {
      return index
    }
  }

  if (isHeadingAnchor && anchor) {
    const targetTab = BASIC_SETTINGS_ANCHOR_TO_TAB[anchor]
    if (targetTab) {
      const index = tabConfigs.findIndex((config) => config.id === targetTab)
      if (index >= 0) {
        return index
      }
    }
  }

  return 0
}

/**
 * Owns URL selection, visited-tab mounting and one-shot search navigation.
 */
export function useBasicSettingsNavigation(
  tabConfigs: readonly { id: TabId }[],
) {
  const { isLoading } = useUserPreferencesContext()
  const initialSelectedTabIndex = useMemo(
    () => resolveSelectedTabIndexFromUrl(tabConfigs),
    [tabConfigs],
  )
  const initialSelectedTabId =
    tabConfigs[initialSelectedTabIndex]?.id ?? "general"

  const [selectedTabIndex, setSelectedTabIndex] = useState(
    initialSelectedTabIndex,
  )
  const selectedTab = tabConfigs[selectedTabIndex]
  const selectedTabId = selectedTab?.id ?? "general"
  const [mountedTabIds, setMountedTabIds] = useState<TabId[]>([
    initialSelectedTabId,
  ])
  const [hasResolvedInitialLoad, setHasResolvedInitialLoad] = useState(false)

  useEffect(() => {
    if (!isLoading) {
      setHasResolvedInitialLoad(true)
    }
  }, [isLoading])

  const applyUrlState = useCallback(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const pendingAnchor = searchParams.get("anchor")
    const pendingHighlight = searchParams.get(OPTIONS_SEARCH_HIGHLIGHT_PARAM)
    const { anchor, isHeadingAnchor } = parseTabFromUrl({
      ignoreAnchors: [MENU_ITEM_IDS.BASIC],
      defaultHashPage: MENU_ITEM_IDS.BASIC,
    })
    const nextIndex = resolveSelectedTabIndexFromUrl(tabConfigs)
    const nextTab = tabConfigs[nextIndex]

    if (nextTab) {
      setSelectedTabIndex(nextIndex)
      setMountedTabIds((previous) =>
        previous.includes(nextTab.id) ? previous : [...previous, nextTab.id],
      )

      if (pendingAnchor) {
        window.setTimeout(() => {
          navigateToAnchor(pendingAnchor)
        }, 150)
      }

      if (!pendingAnchor && isHeadingAnchor && anchor) {
        window.setTimeout(() => {
          navigateToAnchor(anchor)
        }, 150)
      }

      if (pendingHighlight) {
        window.setTimeout(() => {
          if (!highlightSearchTarget(pendingHighlight)) {
            clearHighlightSearchParam()
            return
          }

          clearHighlightSearchParam()
        }, 220)
      }
    }
  }, [tabConfigs])

  useEffect(() => {
    applyUrlState()
    window.addEventListener("popstate", applyUrlState)
    window.addEventListener("hashchange", applyUrlState)
    return () => {
      window.removeEventListener("popstate", applyUrlState)
      window.removeEventListener("hashchange", applyUrlState)
    }
  }, [applyUrlState])

  const getTabIndexFromId = useCallback(
    (tabId: string) => tabConfigs.findIndex((cfg) => cfg.id === tabId),
    [tabConfigs],
  )

  const handleTabChange = useCallback(
    (index: number) => {
      const tab = tabConfigs[index]
      if (!tab) return
      setSelectedTabIndex(index)
      setMountedTabIds((previous) =>
        previous.includes(tab.id) ? previous : [...previous, tab.id],
      )
      updateUrlWithTab(tab.id, { hashPage: MENU_ITEM_IDS.BASIC })
    },
    [tabConfigs],
  )

  return {
    selectedTabId,
    mountedTabIds,
    isInitialLoading: isLoading && !hasResolvedInitialLoad,
    selectTab: (tabId: string) => handleTabChange(getTabIndexFromId(tabId)),
  }
}
