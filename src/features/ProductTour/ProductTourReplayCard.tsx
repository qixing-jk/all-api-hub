import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"

import {
  PRODUCT_TOUR_REPLAY_TARGET_ID,
  PRODUCT_TOUR_SOURCES,
} from "./constants"
import { useProductTour } from "./ProductTourContext"
import { ProductTourEntryCard } from "./ProductTourEntryCard"
import { PRODUCT_TOUR_TEST_IDS } from "./testIds"

/** Persistent About-page entry point for replaying the module introduction. */
export function ProductTourReplayCard() {
  const { t } = useTranslation("productTour")
  const { isRunning, startTour } = useProductTour()

  return (
    <ProductTourEntryCard
      id={PRODUCT_TOUR_REPLAY_TARGET_ID}
      title={t("productTour:replay.title")}
      description={t("productTour:replay.description")}
      testId={PRODUCT_TOUR_TEST_IDS.replay}
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isRunning}
          onClick={() => startTour(PRODUCT_TOUR_SOURCES.About)}
        >
          {t("productTour:actions.replay")}
        </Button>
      }
    />
  )
}
