import { useEffect, useRef, useState } from "react"

import type {
  ProductAnalyticsEntrypoint,
  ProductAnalyticsSurfaceId,
} from "~/services/productAnalytics/contracts"
import { trackStarPromotionPromptShown } from "~/services/productAnalytics/facts/starPromotion"
import { STAR_PROMOTION_STATUSES } from "~/services/starPromotion/contracts"
import { starPromotionState } from "~/services/starPromotion/state"

interface StarPromotionStateResult {
  isActive: boolean
  isStarred: boolean
  isLoading: boolean
}

/**
 * Tracks the star promotion lifecycle state.
 *
 * Stays `isStarred: false` and `isActive: false` while loading (`isLoading: true`),
 * ensuring surfaces do not prematurely flash an "already starred" badge before
 * the persistent storage state resolves.
 */
function useStarPromotionState(enabled = true): StarPromotionStateResult {
  const [result, setResult] = useState<StarPromotionStateResult>({
    isActive: false,
    isStarred: false,
    isLoading: true,
  })

  useEffect(() => {
    if (!enabled) {
      setResult({ isActive: false, isStarred: false, isLoading: false })
      return
    }

    let cancelled = false
    let observedRevision = 0
    const applyState = (
      state: Awaited<ReturnType<typeof starPromotionState.getState>>,
    ) => {
      observedRevision += 1
      if (!cancelled) {
        setResult({
          isActive: state.status === STAR_PROMOTION_STATUSES.Active,
          isStarred: state.status === STAR_PROMOTION_STATUSES.Completed,
          isLoading: false,
        })
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

  return result
}

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
  return useStarPromotionState(enabled).isActive
}

/**
 * Reports whether the repository is confirmed starred (status === "completed").
 * Stays `false` while loading so that "already starred" indicators do not flash
 * prematurely before stored state arrives.
 */
export function useIsStarred(enabled = true): boolean {
  return useStarPromotionState(enabled).isStarred
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
