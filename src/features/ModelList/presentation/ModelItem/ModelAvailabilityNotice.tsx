import { useTranslation } from "react-i18next"

import { HelpHintIcon } from "~/components/icons/productIcons"
import Tooltip from "~/components/Tooltip"
import { IconButton } from "~/components/ui"
import type { ModelPricing } from "~/services/modelList/pricingModel"
import { isModelDisplayTranslationKey } from "~/services/models/modelDisplayFacts"

/** Keeps access explanations readable while leaving discovery and recovery usable. */
export function ModelAvailabilityNotice({
  availability,
  unavailable,
  unknown,
  groupHint,
  groupDetails,
}: {
  availability: ModelPricing["availability"]
  unavailable: boolean
  unknown: boolean
  groupHint?: string
  groupDetails?: string
}) {
  const { t } = useTranslation("modelList")
  if (!unavailable && !unknown) return null

  const providerBlocked = availability?.available === false
  const reasonLabel = providerBlocked ? availability.reasonLabel : undefined
  const reason = reasonLabel
    ? reasonLabel.translationKey &&
      isModelDisplayTranslationKey(reasonLabel.translationKey)
      ? t(reasonLabel.translationKey, { defaultValue: reasonLabel.fallback })
      : reasonLabel.fallback
    : providerBlocked
      ? t("availability.restrictedHint")
      : groupHint || t("availability.unknownHint")
  const rawReason = availability?.reason

  return (
    <div className="text-muted-foreground gap-y-density-1 flex flex-wrap items-center gap-x-1.5 text-xs">
      <span className="shrink-0 font-medium">
        {unavailable
          ? t("availability.unavailable")
          : t("availability.unknown")}
      </span>
      <span aria-hidden="true">·</span>
      <span className="min-w-0 break-words">{reason}</span>
      {rawReason && (
        <Tooltip content={rawReason} anchorAsChild>
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={t("availability.details")}
          >
            <HelpHintIcon className="h-3.5 w-3.5" aria-hidden="true" />
          </IconButton>
        </Tooltip>
      )}
      {!providerBlocked && groupDetails && (
        <span className="text-muted-foreground basis-full">{groupDetails}</span>
      )}
    </div>
  )
}
