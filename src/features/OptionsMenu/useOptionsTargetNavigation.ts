import { useCallback, useEffect, useRef } from "react"

import {
  clearHighlightSearchParam,
  OPTIONS_SEARCH_ANCHOR_PARAM,
  OPTIONS_SEARCH_HIGHLIGHT_PARAM,
} from "~/features/OptionsSearch/navigation"
import { scrollToNavigationTarget } from "~/utils/dom/navigationTarget"
import { temporarilyHighlight } from "~/utils/dom/temporaryHighlight"

const TARGET_RETRY_INTERVAL_MS = 50
const TARGET_MAX_WAIT_MS = 2000

/** Ignore destinations in retained but inactive settings tabs. */
function findTarget(id: string | null) {
  const target = id ? document.getElementById(id) : null
  return target?.closest('[hidden], [data-state="inactive"]') ? null : target
}

/** Own one cancellable landing scroll and highlight for an options-page request. */
export function useOptionsTargetNavigation({
  pageId,
  ready = true,
  getLegacyAnchor,
}: {
  pageId: string
  ready?: boolean
  getLegacyAnchor?: () => string | null
}) {
  const cleanupRef = useRef<(() => void) | undefined>(undefined)
  const cancel = useCallback(() => {
    cleanupRef.current?.()
    cleanupRef.current = undefined
  }, [])

  useEffect(() => {
    const apply = () => {
      cancel()
      if (!ready) return
      const requestUrl = window.location.href
      const url = new URL(requestUrl)
      const legacyAnchor = getLegacyAnchor?.()
      if (url.hash.split("?")[0] !== `#${pageId}` && !legacyAnchor) return
      const anchor =
        url.searchParams.get(OPTIONS_SEARCH_ANCHOR_PARAM) || legacyAnchor
      const highlight = url.searchParams.get(OPTIONS_SEARCH_HIGHLIGHT_PARAM)
      if (!anchor && !highlight) return

      let timer: number | undefined
      let clearHighlight: (() => void) | undefined
      let scrolled = false
      let remainingMs = TARGET_MAX_WAIT_MS
      const attempt = () => {
        // Also catches URL changes made without a navigation event.
        if (window.location.href !== requestUrl) return
        const destination = findTarget(anchor || highlight)
        const highlightTarget = findTarget(highlight)
        if (destination && !scrolled) {
          scrollToNavigationTarget(destination)
          scrolled = true
        }
        if (highlightTarget && !clearHighlight) {
          clearHighlight = temporarilyHighlight(highlightTarget)
        }
        const resolved =
          (!anchor || scrolled) && (!highlight || highlightTarget)
        if (resolved || remainingMs <= 0) {
          if (highlight) clearHighlightSearchParam()
          return
        }
        remainingMs -= TARGET_RETRY_INTERVAL_MS
        timer = window.setTimeout(attempt, TARGET_RETRY_INTERVAL_MS)
      }
      // Let the route/tab selection commit before resolving retained DOM targets.
      const frame = window.requestAnimationFrame(attempt)
      cleanupRef.current = () => {
        window.cancelAnimationFrame(frame)
        window.clearTimeout(timer)
        clearHighlight?.()
      }
    }
    apply()
    window.addEventListener("popstate", apply)
    window.addEventListener("hashchange", apply)
    return () => {
      cancel()
      window.removeEventListener("popstate", apply)
      window.removeEventListener("hashchange", apply)
    }
  }, [pageId, ready, getLegacyAnchor, cancel])

  return cancel
}
