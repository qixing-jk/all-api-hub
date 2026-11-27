import { useEffect, useState } from "react"

import {
  BROWSER_TAB_SITE_URL_MODES,
  getRecentBrowserTabSites,
  type BrowserTabSiteUrlMode,
  type RecentBrowserTabSite,
} from "~/utils/browser/recentTabSites"
import { getAllTabs } from "~/utils/browser/tabs"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("RecentBrowserTabSites")

/** Loads open web tabs in activity order when a picker becomes available. */
export function useRecentBrowserTabSites(
  enabled = true,
  urlMode: BrowserTabSiteUrlMode = BROWSER_TAB_SITE_URL_MODES.ORIGIN,
) {
  const [options, setOptions] = useState<RecentBrowserTabSite[]>([])

  useEffect(() => {
    setOptions((previous) => (previous.length ? [] : previous))
    if (!enabled) return

    let active = true
    void getAllTabs()
      .then((tabs) => {
        if (active) setOptions(getRecentBrowserTabSites(tabs, urlMode))
      })
      .catch((error) => {
        if (active) logger.warn("Could not load recent tab sites", { error })
      })
    return () => {
      active = false
    }
  }, [enabled, urlMode])

  return options
}
