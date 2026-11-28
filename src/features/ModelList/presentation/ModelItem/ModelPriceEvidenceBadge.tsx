import { useTranslation } from "react-i18next"

import { Badge } from "~/components/ui"
import {
  MODEL_PRICE_PRECISION_KINDS,
  type ModelPricePrecisionKind,
} from "~/services/modelList/pricingModel"
import {
  PRICING_SOURCE_KINDS,
  PRICING_SOURCE_NOTE_KINDS,
} from "~/services/modelPricing/pricingConstants"
import type { PricingPlan } from "~/services/modelPricing/pricingPlan"

export const MODEL_PRICE_EVIDENCE_KINDS = {
  ...MODEL_PRICE_PRECISION_KINDS,
  CONVERTED: "converted",
} as const

/** Keep the price's evidence separate from currency conversion and model access. */
export function ModelPriceEvidenceBadge({
  kind,
  source,
}: {
  kind?: ModelPricePrecisionKind | typeof MODEL_PRICE_EVIDENCE_KINDS.CONVERTED
  source?: PricingPlan["source"]
}) {
  const { t } = useTranslation("modelList")
  const minimum = source?.notes?.find(
    (note) => note.kind === PRICING_SOURCE_NOTE_KINDS.CHANNEL_MINIMUM,
  )
  if (
    !minimum &&
    kind !== MODEL_PRICE_PRECISION_KINDS.ESTIMATED &&
    kind !== MODEL_PRICE_EVIDENCE_KINDS.CONVERTED
  )
    return null

  const label = minimum
    ? t("minimumReferencePrice")
    : kind === MODEL_PRICE_EVIDENCE_KINDS.CONVERTED
      ? t("convertedPrice")
      : t("estimatedPrice")
  const title = minimum
    ? minimum.scope === PRICING_SOURCE_KINDS.ACCOUNT
      ? t("pricingNotes.accountChannelMinimum")
      : t("pricingNotes.catalogChannelMinimum")
    : kind === MODEL_PRICE_EVIDENCE_KINDS.CONVERTED
      ? t("convertedPriceTitle")
      : t("estimatedPriceTitle")

  return (
    <Badge
      variant={
        minimum || kind === MODEL_PRICE_PRECISION_KINDS.ESTIMATED
          ? "warning"
          : "secondary"
      }
      size="sm"
      className="shrink-0 text-3xs sm:text-xs"
      title={title}
    >
      {label}
    </Badge>
  )
}
