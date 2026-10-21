import { useTranslation } from "react-i18next"

import { Badge } from "~/components/ui"
import {
  MODEL_PRICE_PRECISION_KINDS,
  type ModelPricePrecisionKind,
} from "~/services/modelList/pricingModel"

export const MODEL_PRICE_EVIDENCE_KINDS = {
  ...MODEL_PRICE_PRECISION_KINDS,
  CONVERTED: "converted",
} as const

/** Keep the price's evidence separate from currency conversion and model access. */
export function ModelPriceEvidenceBadge({
  kind,
}: {
  kind?: ModelPricePrecisionKind | typeof MODEL_PRICE_EVIDENCE_KINDS.CONVERTED
}) {
  const { t } = useTranslation("modelList")
  if (
    kind !== MODEL_PRICE_PRECISION_KINDS.ESTIMATED &&
    kind !== MODEL_PRICE_EVIDENCE_KINDS.CONVERTED
  )
    return null

  const label =
    kind === MODEL_PRICE_EVIDENCE_KINDS.CONVERTED
      ? t("convertedPrice")
      : t("estimatedPrice")
  const title =
    kind === MODEL_PRICE_EVIDENCE_KINDS.CONVERTED
      ? t("convertedPriceTitle")
      : t("estimatedPriceTitle")

  return (
    <Badge
      variant={
        kind === MODEL_PRICE_PRECISION_KINDS.ESTIMATED ? "warning" : "secondary"
      }
      size="sm"
      className="text-3xs shrink-0 sm:text-xs"
      title={title}
    >
      {label}
    </Badge>
  )
}
