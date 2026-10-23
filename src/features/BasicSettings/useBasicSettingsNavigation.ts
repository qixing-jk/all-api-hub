import { useCallback, useEffect, useMemo, useState } from "react"

import {
  BASIC_SETTINGS_ANCHOR_TO_TAB,
  BASIC_SETTINGS_TAB_IDS,
  type BasicSettingsTabId as TabId,
} from "~/constants/basicSettingsTabs"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useOptionsTargetNavigation } from "~/features/OptionsMenu/useOptionsTargetNavigation"
import { OPTIONS_SEARCH_ANCHOR_PARAM } from "~/features/OptionsSearch/navigation"
import { parseTabFromUrl, updateUrlWithTab } from "~/utils/core/url"

const LEGACY_SYNC_TAB_ID = "sync"

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
    .get(OPTIONS_SEARCH_ANCHOR_PARAM)
    ?.trim()

  return anchor ? BASIC_SETTINGS_ANCHOR_TO_TAB[anchor] ?? null : null
}

/** Resolve only legacy heading links owned by Basic Settings. */
function getLegacySettingsAnchor() {
  const { anchor, isHeadingAnchor } = parseTabFromUrl({
    ignoreAnchors: [MENU_ITEM_IDS.BASIC],
    defaultHashPage: MENU_ITEM_IDS.BASIC,
  })
  return isHeadingAnchor &&
    anchor &&
    !Object.values(MENU_ITEM_IDS).some((pageId) => pageId === anchor)
    ? anchor
    : null
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
      tab === LEGACY_SYNC_TAB_ID ? BASIC_SETTINGS_TAB_IDS.AccountUsage : tab
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
    tabConfigs[initialSelectedTabIndex]?.id ?? BASIC_SETTINGS_TAB_IDS.General

  const [selectedTabIndex, setSelectedTabIndex] = useState(
    initialSelectedTabIndex,
  )
  const selectedTab = tabConfigs[selectedTabIndex]
  const selectedTabId = selectedTab?.id ?? BASIC_SETTINGS_TAB_IDS.General
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
    const nextIndex = resolveSelectedTabIndexFromUrl(tabConfigs)
    const nextTab = tabConfigs[nextIndex]

    if (nextTab) {
      setSelectedTabIndex(nextIndex)
      setMountedTabIds((previous) =>
        previous.includes(nextTab.id) ? previous : [...previous, nextTab.id],
      )
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

  const cancelTargetNavigation = useOptionsTargetNavigation({
    pageId: MENU_ITEM_IDS.BASIC,
    ready: !isLoading || hasResolvedInitialLoad,
    getLegacyAnchor: getLegacySettingsAnchor,
  })

  const getTabIndexFromId = useCallback(
    (tabId: string) => tabConfigs.findIndex((cfg) => cfg.id === tabId),
    [tabConfigs],
  )

  const handleTabChange = useCallback(
    (index: number) => {
      const tab = tabConfigs[index]
      if (!tab) return
      cancelTargetNavigation()
      setSelectedTabIndex(index)
      setMountedTabIds((previous) =>
        previous.includes(tab.id) ? previous : [...previous, tab.id],
      )
      updateUrlWithTab(tab.id, { hashPage: MENU_ITEM_IDS.BASIC })
    },
    [tabConfigs, cancelTargetNavigation],
  )

  return {
    selectedTabId,
    mountedTabIds,
    isInitialLoading: isLoading && !hasResolvedInitialLoad,
    selectTab: (tabId: string) => handleTabChange(getTabIndexFromId(tabId)),
  }
}
