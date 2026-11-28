import type { TFunction } from "i18next"
import React from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "~/components/ui"
import {
  formatGroupLabelFromRatios,
  resolveKnownGroupRatio,
} from "~/features/ModelList/groups/groupLabels"
import {
  MODEL_LIST_GROUP_SELECTION_SCOPES,
  type ModelListGroupSelectionScope,
} from "~/features/ModelList/groups/groupSelectionScopes"
import { ModelItemPerCallPricingView } from "~/features/ModelList/presentation/ModelItem/ModelItemPerCallPricingView"
import { PriceView } from "~/features/ModelList/presentation/ModelItem/ModelItemPicingView"
import {
  MODEL_PRICE_EVIDENCE_KINDS,
  ModelPriceEvidenceBadge,
} from "~/features/ModelList/presentation/ModelItem/ModelPriceEvidenceBadge"
import { ModelPriceQuote } from "~/features/ModelList/presentation/ModelItem/ModelPriceQuote"
import { ModelPublishedPricing } from "~/features/ModelList/presentation/ModelItem/ModelPublishedPricing"
import { ModelQuotaPricing } from "~/features/ModelList/presentation/ModelItem/ModelQuotaPricing"
import {
  isModelPriceUnavailable,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
  type ModelPricing,
  type ModelUnavailablePriceReason,
} from "~/services/modelList/pricingModel"
import {
  CALCULATED_PRICE_KINDS,
  PRICING_CONDITION_KINDS,
} from "~/services/modelPricing/pricingConstants"
import { normalizePublishedSchedule } from "~/services/modelPricing/publishedPricing"
import {
  formatPriceCompact,
  isTokenBillingType,
  projectTokenPrices,
  type CalculatedPrice,
} from "~/services/models/utils/modelPricing"

interface ModelItemPricingProps {
  sourceLabel?: string
  onShowDetails?: () => void
  model: ModelPricing
  calculatedPrice: CalculatedPrice
  exchangeRate: number
  showRealPrice: boolean
  showPricing: boolean
  isAvailableForUser: boolean
  isLowestPrice?: boolean
  effectiveGroup?: string
  groupRatios: Record<string, number>
  showsOptimalGroup?: boolean
  groupSelectionScope?: ModelListGroupSelectionScope
}

const PRICE_META_BADGE_KINDS = {
  OptimalGroup: "optimal-group",
  LowestPrice: "lowest-price",
} as const

interface PriceMetaBadgeViewModel {
  kind: (typeof PRICE_META_BADGE_KINDS)[keyof typeof PRICE_META_BADGE_KINDS]
  variant: "success" | "secondary"
}

interface PriceAvailabilityContext {
  effectiveGroup?: string
  groupRatios: Record<string, number>
}

/** Returns whether direct token prices still depend on an estimated group rate. */
function usesEstimatedDirectTokenPrice(model: ModelPricing): boolean {
  return (
    model.price_metadata?.source ===
      MODEL_PRICE_SOURCE_KINDS.OFFICIAL_RATE_ESTIMATE &&
    model.price_metadata?.precision === MODEL_PRICE_PRECISION_KINDS.ESTIMATED
  )
}

/**
 * Maps unavailable-price metadata to local model-list copy.
 */
export function getUnavailablePriceReasonText(
  t: TFunction<"modelList">,
  reason?: ModelUnavailablePriceReason,
) {
  switch (reason) {
    case MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY:
      return t("unavailablePriceReasons.modelListOnly")
    case MODEL_UNAVAILABLE_PRICE_REASONS.KEY_GROUP_UNKNOWN:
      return t("unavailablePriceReasons.keyGroupUnknown")
    case MODEL_UNAVAILABLE_PRICE_REASONS.NO_USABLE_GROUP:
      return t("noUsableGroupsForModel")
    case MODEL_UNAVAILABLE_PRICE_REASONS.GROUP_RATIO_UNAVAILABLE:
      return t("unavailablePriceReasons.groupRatioUnavailable")
    case MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING:
      return t("unavailablePriceReasons.officialPriceMissing")
    case MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_INVALID:
      return t("unavailablePriceReasons.officialPriceInvalid")
    case MODEL_UNAVAILABLE_PRICE_REASONS.PRICING_RULES_UNAVAILABLE:
      return t("unavailablePriceReasons.pricingRulesUnavailable")
    case MODEL_UNAVAILABLE_PRICE_REASONS.PRICING_SOURCE_UNAVAILABLE:
    default:
      return t("unavailablePriceReasons.pricingSourceUnavailable")
  }
}

/**
 * Resolves the shared unavailable-price state used by collapsed and expanded rows.
 */
export function resolveUnavailablePriceReason(
  model: ModelPricing,
  calculatedPrice: CalculatedPrice,
  context?: PriceAvailabilityContext,
): ModelUnavailablePriceReason | undefined {
  // Active structured quotes own both availability and recovery guidance.
  if (
    model.pricingPlan &&
    calculatedPrice.quote &&
    calculatedPrice.isComparisonActive !== false
  )
    return undefined

  const sourceUnavailableReason =
    model.price_metadata?.unavailable_reason ??
    (calculatedPrice.kind === CALCULATED_PRICE_KINDS.UNAVAILABLE
      ? calculatedPrice.reason
      : undefined)

  if (
    isModelPriceUnavailable(model) ||
    (calculatedPrice.kind === CALCULATED_PRICE_KINDS.UNAVAILABLE &&
      (calculatedPrice.reason !== undefined ||
        !calculatedPrice.quote ||
        calculatedPrice.isComparisonActive === false))
  ) {
    if (calculatedPrice.perMillionTokens) return undefined
    return (
      sourceUnavailableReason ??
      MODEL_UNAVAILABLE_PRICE_REASONS.PRICING_SOURCE_UNAVAILABLE
    )
  }

  if (
    context?.effectiveGroup &&
    usesEstimatedDirectTokenPrice(model) &&
    resolveKnownGroupRatio(context.effectiveGroup, context.groupRatios) ===
      undefined
  ) {
    return MODEL_UNAVAILABLE_PRICE_REASONS.GROUP_RATIO_UNAVAILABLE
  }

  return undefined
}

/**
 * Narrows calculated pricing to rows that can render numeric price values.
 */
function isAvailableCalculatedPrice(
  calculatedPrice: CalculatedPrice,
): calculatedPrice is Exclude<
  CalculatedPrice,
  { kind: typeof CALCULATED_PRICE_KINDS.UNAVAILABLE }
> {
  return calculatedPrice.kind !== CALCULATED_PRICE_KINDS.UNAVAILABLE
}

/**
 * Resolves which pricing metadata badge should be rendered for the model row.
 */
function resolvePriceMetaBadge(params: {
  effectiveGroup?: string
  isLowestPrice: boolean
  showsOptimalGroup: boolean
}): PriceMetaBadgeViewModel | null {
  const { effectiveGroup, isLowestPrice, showsOptimalGroup } = params

  if (effectiveGroup && showsOptimalGroup) {
    return {
      kind: PRICE_META_BADGE_KINDS.OptimalGroup,
      variant: isLowestPrice ? "success" : "secondary",
    }
  }

  if (!isLowestPrice) {
    return null
  }

  return {
    kind: PRICE_META_BADGE_KINDS.LowestPrice,
    variant: "success",
  }
}

export const ModelItemPricing: React.FC<ModelItemPricingProps> = ({
  model,
  calculatedPrice,
  exchangeRate,
  showRealPrice,
  showPricing,
  isAvailableForUser,
  isLowestPrice = false,
  effectiveGroup,
  groupRatios,
  showsOptimalGroup = false,
  groupSelectionScope = MODEL_LIST_GROUP_SELECTION_SCOPES.SINGLE_SOURCE,
  onShowDetails,
  sourceLabel,
}) => {
  const { t } = useTranslation("modelList")
  // Native quota multipliers remain useful when monetary pricing is disabled.
  // Keep them outside currency conversion, estimated prices and price badges.
  if (model.quotaPricing)
    return (
      <ModelQuotaPricing
        key={model.model_name}
        plan={model.quotaPricing}
        quote={calculatedPrice.quotaQuote}
        isComparisonActive={calculatedPrice.isComparisonActive === true}
        isAvailableForUser={isAvailableForUser}
      />
    )
  if (!showPricing) {
    return null
  }

  const unavailableReason = resolveUnavailablePriceReason(
    model,
    calculatedPrice,
    { effectiveGroup, groupRatios },
  )
  const tokenBillingType = isTokenBillingType(model.quota_type)
  const hasContextTiers =
    calculatedPrice.kind === CALCULATED_PRICE_KINDS.TOKEN &&
    Boolean(model.pricingPlan?.rules.length)
  const effectiveGroupLabel = effectiveGroup
    ? formatGroupLabelFromRatios(
        effectiveGroup,
        groupRatios,
        model.groupDisplayNames,
      )
    : undefined
  const priceMetaBadge = resolvePriceMetaBadge({
    effectiveGroup,
    isLowestPrice,
    showsOptimalGroup,
  })
  const isAllAccountsGroupScope =
    groupSelectionScope === MODEL_LIST_GROUP_SELECTION_SCOPES.ALL_ACCOUNTS
  const priceMetaLabel =
    priceMetaBadge?.kind === PRICE_META_BADGE_KINDS.OptimalGroup
      ? t("optimalGroup", { group: effectiveGroupLabel })
      : priceMetaBadge?.kind === PRICE_META_BADGE_KINDS.LowestPrice
        ? t("lowestPrice")
        : undefined
  const priceMetaTitle =
    priceMetaBadge?.kind === PRICE_META_BADGE_KINDS.OptimalGroup
      ? isLowestPrice
        ? isAllAccountsGroupScope
          ? t("optimalGroupLowestPriceWithinAccountFilters", {
              group: effectiveGroupLabel,
            })
          : t("optimalGroupLowestPriceWithinBillingMode", {
              group: effectiveGroupLabel,
            })
        : isAllAccountsGroupScope
          ? t("optimalGroupWithinAccountFilters", {
              group: effectiveGroupLabel,
            })
          : t("optimalGroupWithinSelectedGroups", {
              group: effectiveGroupLabel,
            })
      : priceMetaBadge?.kind === PRICE_META_BADGE_KINDS.LowestPrice
        ? isAllAccountsGroupScope
          ? t("lowestPriceWithinAccountFilters")
          : t("lowestPriceWithinBillingMode")
        : undefined
  const priceMeta = priceMetaBadge ? (
    <Badge
      variant={priceMetaBadge.variant}
      size="sm"
      className="shrink-0 text-3xs sm:text-xs"
      title={priceMetaTitle}
    >
      {priceMetaLabel}
    </Badge>
  ) : null
  const priceEvidence = (
    <ModelPriceEvidenceBadge
      kind={model.price_metadata?.precision}
      source={model.pricingPlan?.source}
    />
  )
  const hasPriceEvidence =
    model.price_metadata?.precision === MODEL_PRICE_PRECISION_KINDS.ESTIMATED

  if (
    calculatedPrice.isComparisonActive === false &&
    calculatedPrice.publishedPricing &&
    (normalizePublishedSchedule(calculatedPrice.publishedPricing.schedule)
      .length > 0 ||
      calculatedPrice.publishedPricing.source.pricingDescription ||
      calculatedPrice.publishedPricing.source.notes?.length)
  )
    return (
      <ModelPublishedPricing
        pricing={calculatedPrice.publishedPricing}
        metadata={priceMeta}
        exchangeRate={exchangeRate}
        showRealPrice={showRealPrice}
        isAvailableForUser={isAvailableForUser}
        pricePrecision={model.price_metadata?.precision}
        sourceLabel={sourceLabel}
        effectiveGroup={effectiveGroup}
      />
    )

  if (
    calculatedPrice.quote &&
    !unavailableReason &&
    calculatedPrice.isComparisonActive !== false
  )
    return (
      <ModelPriceQuote
        quote={calculatedPrice.quote}
        isLowestPrice={isLowestPrice}
        onShowDetails={onShowDetails}
        sourceLabel={sourceLabel}
        effectiveGroup={effectiveGroup}
        pricePrecision={model.price_metadata?.precision}
      />
    )

  // Native flat rates in the plan's own currency stay visible when no
  // price-sort mode is active; the published currency flows through the calc.
  const nativeRates = calculatedPrice.perMillionTokens
  const nativePrices = nativeRates ? projectTokenPrices(nativeRates) : undefined
  if (
    nativePrices &&
    calculatedPrice.isComparisonActive !== true &&
    (showRealPrice || (Number.isFinite(exchangeRate) && exchangeRate > 0))
  ) {
    return (
      <div className="mt-density-2 flex flex-wrap items-center gap-3">
        <PriceView
          prices={nativePrices.prices}
          sourceCurrency={nativePrices.currency}
          exchangeRate={exchangeRate}
          showRealPrice={showRealPrice}
          tokenBillingType={true}
          isAvailableForUser={isAvailableForUser}
          formatPriceCompact={formatPriceCompact}
        />
        {priceEvidence}
        {nativePrices.currency !== (showRealPrice ? "CNY" : "USD") && (
          <ModelPriceEvidenceBadge
            kind={MODEL_PRICE_EVIDENCE_KINDS.CONVERTED}
          />
        )}
      </div>
    )
  }

  if (unavailableReason) {
    return (
      <div className="mt-density-2">
        <span
          className={`block max-w-full text-xs leading-snug font-medium sm:text-sm ${
            isAvailableForUser
              ? "text-muted-foreground dark:text-secondary-foreground"
              : "text-muted-foreground"
          }`}
        >
          {getUnavailablePriceReasonText(t, unavailableReason)}
        </span>
      </div>
    )
  }

  if (!isAvailableCalculatedPrice(calculatedPrice)) {
    return null
  }

  return (
    <div className="mt-density-2">
      {calculatedPrice.kind === CALCULATED_PRICE_KINDS.TOKEN ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-density-3 sm:gap-x-4 sm:gap-y-density-4 md:gap-x-6 md:gap-y-density-6">
          <PriceView
            prices={calculatedPrice.usdPerMillionTokens}
            exchangeRate={exchangeRate}
            showRealPrice={showRealPrice}
            tokenBillingType={tokenBillingType}
            isAvailableForUser={isAvailableForUser}
            formatPriceCompact={formatPriceCompact}
          />

          {(priceMeta || hasPriceEvidence || hasContextTiers) && (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-density-1-5 sm:gap-x-2 sm:gap-y-density-2">
              {hasContextTiers && (
                <Badge
                  variant="secondary"
                  size="sm"
                  className="shrink-0 text-3xs sm:text-xs"
                >
                  {model.pricingPlan?.rules.some((rule) =>
                    rule.conditions.some(
                      (condition) =>
                        condition.kind === PRICING_CONDITION_KINDS.RANGE,
                    ),
                  )
                    ? t("scenario.tiered")
                    : t("scenario.conditional")}
                </Badge>
              )}
              {priceMeta}
              {priceEvidence}
            </div>
          )}
        </div>
      ) : (
        calculatedPrice.kind === CALCULATED_PRICE_KINDS.PER_CALL && (
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-density-1-5 sm:gap-x-2 sm:gap-y-density-2">
            <span className="text-xs whitespace-nowrap text-muted-foreground sm:text-sm dark:text-secondary-foreground">
              {t("perCall")}
            </span>
            <ModelItemPerCallPricingView
              perCallPrice={calculatedPrice.usdPerCall}
              isAvailableForUser={isAvailableForUser}
              exchangeRate={exchangeRate}
              showRealPrice={showRealPrice}
              tokenBillingType={tokenBillingType}
            />
            {priceMeta}
            {priceEvidence}
          </div>
        )
      )}
    </div>
  )
}
