import { useEffect, useState } from "react"

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
      return
    }

    let cancelled = false
    void starPromotionState.getState().then((state) => {
      if (!cancelled) {
        setIsActive(state.status === STAR_PROMOTION_STATUSES.Active)
      }
    })

    return () => {
      cancelled = true
    }
  }, [enabled])

  return isActive
}
