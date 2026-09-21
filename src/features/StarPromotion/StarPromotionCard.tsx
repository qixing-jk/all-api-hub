import { useCallback, useEffect, useRef, useState } from "react"

import { REPO_URL } from "~/constants/about"
import { Z_INDEX } from "~/constants/designTokens"
import { cn } from "~/lib/utils"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import {
  trackStarPromotionAction,
  trackStarPromotionPromptShown,
} from "~/services/productAnalytics/starPromotion"
import { STAR_PROMOTION_STATUSES } from "~/services/starPromotion/contracts"
import { starPromotionState } from "~/services/starPromotion/state"
import { createTab } from "~/utils/browser/browserApi"

import {
  StarPromotionCardView,
  useStarPromotionCardLabels,
} from "./StarPromotionCardView"

/**
 * Persistent "enjoying All API Hub?" star card, mirroring the orca star-nag
 * contract: once the value threshold is crossed the card stays visible until
 * the user resolves it. Starring or confirming an existing star is terminal;
 * "not now" and the close control both defer with a cooldown and doubled
 * thresholds, so the promotion can never become a recurring nag.
 */
export function StarPromotionCard() {
  const labels = useStarPromotionCardLabels()
  const [promptVisible, setPromptVisible] = useState(false)
  const promptVisibleRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    let evaluationRevision = 0

    const evaluate = async () => {
      const revision = ++evaluationRevision
      const isDue = await starPromotionState.isThresholdPromptDue()
      if (cancelled || revision !== evaluationRevision) return

      setPromptVisible(isDue)
      if (isDue && !promptVisibleRef.current) {
        trackStarPromotionPromptShown({
          surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsStarPromotionCard,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        })
      }
      promptVisibleRef.current = isDue
    }

    const unwatch = starPromotionState.watchState((state) => {
      if (state.status === STAR_PROMOTION_STATUSES.Completed) {
        evaluationRevision += 1
        promptVisibleRef.current = false
        setPromptVisible(false)
        return
      }
      void evaluate()
    })

    void evaluate()

    return () => {
      cancelled = true
      unwatch()
    }
  }, [])

  const handleStar = useCallback(() => {
    trackStarPromotionAction(PRODUCT_ANALYTICS_ACTION_IDS.ClickStarPromotion, {
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsStarPromotionCard,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    void starPromotionState.markCompleted()
    promptVisibleRef.current = false
    setPromptVisible(false)
    void createTab(REPO_URL, true)
  }, [])

  const handleAlreadyStarred = useCallback(() => {
    trackStarPromotionAction(
      PRODUCT_ANALYTICS_ACTION_IDS.ConfirmStarPromotionAlreadyStarred,
      {
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsStarPromotionCard,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      },
    )
    void starPromotionState.markCompleted()
    promptVisibleRef.current = false
    setPromptVisible(false)
  }, [])

  const handleDefer = useCallback(() => {
    trackStarPromotionAction(PRODUCT_ANALYTICS_ACTION_IDS.DeferStarPromotion, {
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsStarPromotionCard,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    void starPromotionState.deferThresholdPrompt()
    promptVisibleRef.current = false
    setPromptVisible(false)
  }, [])

  if (!promptVisible) {
    return null
  }

  return (
    <div
      className={cn(
        Z_INDEX.floating,
        // A bottom-right notification card on desktop. On small screens it
        // becomes a full-width bar with even margins, because a fixed,
        // right-anchored card reads as off-centre there. The bottom padding
        // keeps it clear of the mobile browser's safe area.
        "pb-safe-bottom fixed right-4 bottom-4 left-4 sm:left-auto sm:w-96",
      )}
    >
      <StarPromotionCardView
        {...labels}
        onStar={handleStar}
        onAlreadyStarred={handleAlreadyStarred}
        onDefer={handleDefer}
      />
    </div>
  )
}
