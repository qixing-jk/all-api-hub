import { useEffect, useRef } from "react"

import {
  PRODUCT_ANALYTICS_EVENTS,
  trackProductAnalyticsEvent,
  type ProductAnalyticsEntrypoint,
  type ProductAnalyticsPageId,
} from "~/services/productAnalytics/events"
import { isDevelopmentMode } from "~/utils/core/environment"

interface UseProductAnalyticsPageViewParams {
  entrypoint: ProductAnalyticsEntrypoint
  pageId: ProductAnalyticsPageId
}

const STRICT_MODE_DEDUPE_TTL_MS = 500
const recentTrackedEvents = new Map<string, number>()

/**
 * Returns whether an analytics event key has not been tracked in the short dedupe window.
 */
function shouldTrackRecentEvent(eventKey: string): boolean {
  if (!isDevelopmentMode()) return true

  const now = Date.now()
  const lastTrackedAt = recentTrackedEvents.get(eventKey)

  for (const [key, trackedAt] of recentTrackedEvents) {
    if (now - trackedAt > STRICT_MODE_DEDUPE_TTL_MS) {
      recentTrackedEvents.delete(key)
    }
  }

  if (
    typeof lastTrackedAt === "number" &&
    now - lastTrackedAt <= STRICT_MODE_DEDUPE_TTL_MS
  ) {
    return false
  }

  recentTrackedEvents.set(eventKey, now)
  return true
}

/**
 * Tracks one app-open event for a mounted UI entrypoint and page views on route changes.
 */
export function useProductAnalyticsPageView({
  entrypoint,
  pageId,
}: UseProductAnalyticsPageViewParams) {
  const hasTrackedAppOpenedRef = useRef(false)

  useEffect(() => {
    if (hasTrackedAppOpenedRef.current) return

    hasTrackedAppOpenedRef.current = true
    const eventKey = `${PRODUCT_ANALYTICS_EVENTS.AppOpened}:${entrypoint}`

    // React StrictMode can immediately replay effects through remounts in dev.
    if (!shouldTrackRecentEvent(eventKey)) return

    void trackProductAnalyticsEvent(PRODUCT_ANALYTICS_EVENTS.AppOpened, {
      entrypoint,
    })
  }, [entrypoint])

  useEffect(() => {
    const eventKey = `${PRODUCT_ANALYTICS_EVENTS.PageViewed}:${entrypoint}:${pageId}`

    if (!shouldTrackRecentEvent(eventKey)) return

    void trackProductAnalyticsEvent(PRODUCT_ANALYTICS_EVENTS.PageViewed, {
      entrypoint,
      page_id: pageId,
    })
  }, [entrypoint, pageId])
}
