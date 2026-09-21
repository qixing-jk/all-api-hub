import { useEffect, useRef, useState } from "react"

import type {
  ProductAnalyticsEntrypoint,
  ProductAnalyticsSurfaceId,
} from "~/services/productAnalytics/contracts"
import { trackStarPromotionPromptShown } from "~/services/productAnalytics/starPromotion"
import { STAR_PROMOTION_STATUSES } from "~/services/starPromotion/contracts"
import { starPromotionState } from "~/services/starPromotion/state"

/**
 * Reports whether the star promotion is still active, for the low-key CTA
 * surfaces (feedback menu, update log, permission onboarding) that show a star
 * link only while the promotion is unresolved.
 *
 * Stays `false` until the stored state has been read, so a promoted action
 * never appears for a user who already starred. Pass `enabled: false` while the
 * host surface is hidden (a closed dialog) to skip the storage read.
 */
export function useStarPromotionActive(enabled = true): boolean {
  const [isActive, setIsActive] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setIsActive(false)
      return
    }

    let cancelled = false
    let observedRevision = 0
    const applyState = (
      state: Awaited<ReturnType<typeof starPromotionState.getState>>,
    ) => {
      observedRevision += 1
      if (!cancelled) {
        setIsActive(state.status === STAR_PROMOTION_STATUSES.Active)
      }
    }
    const initialRevision = observedRevision
    const unwatch = starPromotionState.watchState(applyState)

    void starPromotionState.getState().then((state) => {
      if (!cancelled && observedRevision === initialRevision) {
        applyState(state)
      }
    })

    return () => {
      cancelled = true
      unwatch()
    }
  }, [enabled])

  return isActive
}

/** Records one impression whenever a promotion surface becomes visible. */
export function useStarPromotionPromptImpression(
  visible: boolean,
  context: {
    surfaceId: ProductAnalyticsSurfaceId
    entrypoint: ProductAnalyticsEntrypoint
  },
): void {
  const wasVisibleRef = useRef(false)
  const { entrypoint, surfaceId } = context

  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      trackStarPromotionPromptShown({ entrypoint, surfaceId })
    }
    wasVisibleRef.current = visible
  }, [entrypoint, surfaceId, visible])
}
