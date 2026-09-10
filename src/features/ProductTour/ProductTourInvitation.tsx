import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"

import { PRODUCT_TOUR_SOURCES } from "./constants"
import { useProductTour } from "./ProductTourContext"
import { ProductTourEntryCard } from "./ProductTourEntryCard"
import { PRODUCT_TOUR_TEST_IDS } from "./testIds"

/** Soft opt-in prompt shown on Overview until the current tour is handled. */
export function ProductTourInvitation() {
  const { t } = useTranslation("productTour")
  const { deferTourInvitation, shouldOfferTour, startTour } = useProductTour()

  if (!shouldOfferTour) return null

  return (
    <ProductTourEntryCard
      emphasized
      title={t("productTour:invitation.title")}
      description={t("productTour:invitation.description")}
      testId={PRODUCT_TOUR_TEST_IDS.invitation}
      actions={
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={deferTourInvitation}
          >
            {t("productTour:actions.later")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => startTour(PRODUCT_TOUR_SOURCES.Overview)}
          >
            {t("productTour:actions.start")}
          </Button>
        </>
      }
    />
  )
}
