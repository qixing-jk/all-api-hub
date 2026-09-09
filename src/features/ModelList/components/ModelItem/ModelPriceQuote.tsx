import { useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "~/components/ui"
import { PricingConditionDetails } from "~/features/ModelList/components/PricingConditionDetails"
import {
  getPricingConditionTarget,
  getPricingConditionTargets,
  usePricingScenarioNavigation,
} from "~/features/ModelList/pricingScenarioNavigation"
import {
  pricingMeterLabels,
  pricingScenarioOptions,
} from "~/features/ModelList/pricingScenarioOptions"
import {
  PRICE_RATE_UNITS,
  PRICING_CONDITION_KINDS,
  PRICING_ISSUE_CODES,
  PRICING_RANGE_AXES,
  PRICING_SOURCE_KINDS,
  QUOTE_STATUSES,
  QUOTE_UNITS,
  TOKENS_PER_MILLION,
} from "~/services/modelPricing/pricingConstants"
import type {
  PriceMeter,
  QuoteResult,
} from "~/services/modelPricing/pricingPlan"
import { formatPrice } from "~/services/models/utils/modelPricing"

import { ModelPriceCalculationDetails } from "./ModelPriceCalculationDetails"

/** Renders exactly the quote used for ranking, including its excluded scope. */
export function ModelPriceQuote({
  quote,
  details = false,
  isLowestPrice = false,
  showSummary = true,
  onShowDetails,
  sourceLabel,
  effectiveGroup,
}: {
  quote: QuoteResult
  details?: boolean
  isLowestPrice?: boolean
  showSummary?: boolean
  onShowDetails?: () => void
  sourceLabel?: string
  effectiveGroup?: string
}) {
  const [showCalculation, setShowCalculation] = useState(false)
  const calculationId = useId()
  const { t, i18n } = useTranslation("modelList")
  const options = pricingScenarioOptions(t)
  const navigation = usePricingScenarioNavigation()
  const conditionTarget = getPricingConditionTarget(quote)
  const conditionTargets = getPricingConditionTargets(quote)
  const conditionLabel =
    conditionTarget === PRICING_RANGE_AXES.INPUT_TOKENS
      ? t("scenario.input")
      : conditionTarget === PRICING_RANGE_AXES.OUTPUT_TOKENS
        ? t("scenario.output")
        : conditionTarget === "at"
          ? t("scenario.pricingTime")
          : conditionTarget
            ? options.labels[conditionTarget]
            : undefined
  const canConfigure = quote.issues.some((issue) =>
    [
      PRICING_ISSUE_CODES.USAGE_MISSING,
      PRICING_ISSUE_CODES.USAGE_INVALID,
      PRICING_ISSUE_CODES.CONDITION_MISSING,
      PRICING_ISSUE_CODES.CACHE_BASIS_UNKNOWN,
      PRICING_ISSUE_CODES.SERVICE_TIER_UNAVAILABLE,
      PRICING_ISSUE_CODES.MODEL_LIMIT_EXCEEDED,
      PRICING_ISSUE_CODES.PRICE_RANGE_UNAVAILABLE,
    ].some((code) => code === issue.code),
  )
  const meterLabels = pricingMeterLabels(t)
  const omittedMeters = [
    ...new Set(
      quote.issues.flatMap((issue) =>
        issue.code === PRICING_ISSUE_CODES.PRICE_MISSING && issue.meter
          ? [issue.meter]
          : [],
      ),
    ),
  ]
  const publishedSchedule = (quote.publishedSchedule ?? [])
    .map((rule) => ({
      ...rule,
      rates: Object.fromEntries(
        Object.entries(rule.rates).flatMap(([meter, rate]) => {
          const amount =
            (rate.amount / rate.per) *
            (rate.unit === PRICE_RATE_UNITS.TOKEN ? TOKENS_PER_MILLION : 1)
          return Number.isFinite(amount) && amount >= 0 && rate.per > 0
            ? [
                [
                  meter,
                  {
                    ...rate,
                    amount,
                    per:
                      rate.unit === PRICE_RATE_UNITS.TOKEN
                        ? TOKENS_PER_MILLION
                        : 1,
                  },
                ],
              ]
            : []
        }),
      ),
    }))
    .filter((rule) => Object.keys(rule.rates).length > 0)
  const publishedBase = publishedSchedule.find(
    (rule) => rule.conditions.length === 0,
  )
  const hasPublishedPrices = publishedSchedule.length > 0
  const showsPublishedSchedule =
    hasPublishedPrices &&
    (quote.status !== QUOTE_STATUSES.COMPLETE || !quote.schedule.length)
  const displayedSchedule = showsPublishedSchedule
    ? publishedSchedule
    : quote.schedule
  const hasKnownSubtotal =
    quote.status === QUOTE_STATUSES.PARTIAL && quote.amount !== null
  const isPriceIndex =
    quote.unit === QUOTE_UNITS.VIDEO_SECOND ||
    quote.unit === QUOTE_UNITS.AUDIO_SECOND ||
    quote.unit === QUOTE_UNITS.PAGE ||
    quote.unit === QUOTE_UNITS.MEGAPIXEL ||
    quote.unit === QUOTE_UNITS.THOUSAND_CHARACTERS ||
    quote.unit === QUOTE_UNITS.SEARCH_UNIT ||
    quote.unit === QUOTE_UNITS.IMAGE ||
    quote.unit === QUOTE_UNITS.MILLION_SELECTED_TOKENS ||
    quote.unit === QUOTE_UNITS.MILLION_VIDEO_OUTPUT_TOKENS
  const indexUnitLabel =
    quote.unit === QUOTE_UNITS.PAGE
      ? t("scenario.page")
      : quote.unit === QUOTE_UNITS.MEGAPIXEL
        ? t("scenario.megapixel")
        : quote.unit === QUOTE_UNITS.VIDEO_SECOND ||
            quote.unit === QUOTE_UNITS.AUDIO_SECOND
          ? t("scenario.second")
          : quote.unit === QUOTE_UNITS.THOUSAND_CHARACTERS
            ? t("scenario.thousandCharacters")
            : quote.unit === QUOTE_UNITS.SEARCH_UNIT
              ? t("scenario.searchUnit")
              : quote.unit === QUOTE_UNITS.IMAGE
                ? t("scenario.image")
                : quote.unit === QUOTE_UNITS.MILLION_VIDEO_OUTPUT_TOKENS
                  ? t("scenario.perMillionVideoTokens")
                  : t("scenario.perMillionTokens")
  const hasContextTiers = displayedSchedule.some((rule) =>
    rule.conditions.some(
      (condition) => condition.kind === PRICING_CONDITION_KINDS.RANGE,
    ),
  )
  const activeRanges = quote.matchedRules.flatMap((rule) =>
    rule.conditions.filter(
      (condition) => condition.kind === PRICING_CONDITION_KINDS.RANGE,
    ),
  )
  const baseRates = quote.schedule.find(
    (rule) => rule.conditions.length === 0,
  )?.rates
  const effectiveRates = Object.assign(
    {},
    ...quote.schedule
      .filter(
        (rule) =>
          rule.conditions.length === 0 ||
          quote.matchedRules.some((matched) => matched.id === rule.id),
      )
      .map((rule) => rule.rates),
  ) as NonNullable<typeof baseRates>
  const reasons = [
    ...new Set(
      quote.issues
        .filter(
          (issue) =>
            ![
              PRICING_ISSUE_CODES.PRICE_UNAVAILABLE,
              PRICING_ISSUE_CODES.OUTPUT_TOKEN_MIX,
              PRICING_ISSUE_CODES.SOURCE_UNAVAILABLE,
            ].some((code) => code === issue.code) &&
            !(
              issue.code === PRICING_ISSUE_CODES.PRICE_MISSING &&
              quote.issues.some(
                (problem) =>
                  problem.code === PRICING_ISSUE_CODES.PRICE_UNAVAILABLE,
              )
            ) &&
            !(
              quote.requirementDetails?.length &&
              [
                PRICING_ISSUE_CODES.USAGE_MISSING,
                PRICING_ISSUE_CODES.USAGE_INVALID,
                PRICING_ISSUE_CODES.CONDITION_MISSING,
                PRICING_ISSUE_CODES.PRICE_RANGE_UNAVAILABLE,
                PRICING_ISSUE_CODES.MODEL_LIMIT_EXCEEDED,
              ].some((code) => code === issue.code)
            ) &&
            !(
              quote.conditionDetails?.length &&
              [
                PRICING_ISSUE_CODES.CONDITION_MISSING,
                PRICING_ISSUE_CODES.PRICE_RANGE_UNAVAILABLE,
              ].some((code) => code === issue.code)
            ) &&
            !(
              issue.code === PRICING_ISSUE_CODES.CONDITION_MISSING &&
              conditionTarget &&
              navigation
            ) &&
            !(
              quote.source.rulesUnavailable &&
              issue.code === PRICING_ISSUE_CODES.PRICE_MISSING
            ) &&
            !(
              hasKnownSubtotal &&
              omittedMeters.length > 0 &&
              (issue.code === PRICING_ISSUE_CODES.UNSUPPORTED_RULE ||
                issue.code === PRICING_ISSUE_CODES.PRICE_MISSING)
            ),
        )
        .map((issue) => {
          switch (issue.code) {
            case PRICING_ISSUE_CODES.SOURCE_CONFLICT:
              return t("scenario.sourceConflict")
            case PRICING_ISSUE_CODES.SERVICE_TIER_UNAVAILABLE:
              return t("scenario.serviceTierUnavailable")
            case PRICING_ISSUE_CODES.MODEL_LIMIT_EXCEEDED:
              return t("scenario.modelLimit")
            case PRICING_ISSUE_CODES.USAGE_MISSING:
            case PRICING_ISSUE_CODES.USAGE_INVALID:
              return t("scenario.needsUsage")
            case PRICING_ISSUE_CODES.CONDITION_MISSING:
              return t("scenario.needsConditions")
            case PRICING_ISSUE_CODES.CACHE_BASIS_UNKNOWN:
              return t("scenario.unverifiedCacheBasis")
            case PRICING_ISSUE_CODES.UNVERIFIED_AXIS:
            case PRICING_ISSUE_CODES.UNSUPPORTED_RULE:
              return quote.source.rulesUnavailable
                ? t("scenario.websiteRulesUnavailable")
                : t("scenario.unsupportedRule")
            case PRICING_ISSUE_CODES.PRICE_RANGE_UNAVAILABLE:
              return t("scenario.noRange")
            case PRICING_ISSUE_CODES.UNKNOWN_FEES:
              return t("scenario.unknownFees")
            case PRICING_ISSUE_CODES.GROUP_RATE_MISSING:
              return t("scenario.missingGroupRate")
            case PRICING_ISSUE_CODES.EXCHANGE_RATE_MISSING:
              return t("scenario.missingConversion")
            case PRICING_ISSUE_CODES.PRICE_MISSING:
            case PRICING_ISSUE_CODES.PRICE_INVALID:
              return issue.meter
                ? t("scenario.missingMeterRate", {
                    meter: meterLabels[issue.meter],
                  })
                : t("scenario.missingPrice")
            default:
              return t("scenario.missingPrice")
          }
        }),
    ),
  ]
  const configurationAction =
    canConfigure && navigation ? (
      <button
        type="button"
        onClick={() =>
          navigation.configure(
            conditionTargets.length ? conditionTargets : conditionTarget,
          )
        }
        className="text-primary max-w-full cursor-pointer text-xs font-medium underline underline-offset-2"
      >
        {t("scenario.configure")}
        {conditionLabel && ` · ${conditionLabel}`}
      </button>
    ) : null
  return (
    <div className="mt-2 space-y-2 text-xs">
      {showSummary && (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {(hasKnownSubtotal || isPriceIndex) && (
            <span>
              {quote.unit === QUOTE_UNITS.IMAGE
                ? t("scenario.imagePrice")
                : quote.unit === QUOTE_UNITS.REQUEST
                  ? t("scenario.knownCost")
                  : quote.unit === QUOTE_UNITS.MILLION_VIDEO_OUTPUT_TOKENS
                    ? t("scenario.videoPrice")
                    : t(
                        hasKnownSubtotal
                          ? "scenario.knownPrice"
                          : "scenario.blendedPrice",
                      )}
            </span>
          )}
          <span className="text-foreground text-sm font-semibold tracking-tight">
            {quote.amount === null
              ? hasPublishedPrices
                ? isPriceIndex
                  ? t("scenario.noComparisonPrice")
                  : t("scenario.noComparisonTotal")
                : t("scenario.unavailable")
              : formatPrice(quote.amount, quote.currency, 6)}
          </span>
          {quote.amount !== null && (
            <span>
              {quote.unit === QUOTE_UNITS.REQUEST
                ? t("scenario.perRequest")
                : `/ ${indexUnitLabel}`}
            </span>
          )}
          {configurationAction}
          {quote.status !== QUOTE_STATUSES.COMPLETE &&
            !hasKnownSubtotal &&
            !hasPublishedPrices && (
              <Badge variant="warning">{t("scenario.partial")}</Badge>
            )}
          {quote.source.kind === PRICING_SOURCE_KINDS.ESTIMATE && (
            <Badge variant="warning">{t("estimatedPrice")}</Badge>
          )}
          {isLowestPrice && quote.status === QUOTE_STATUSES.COMPLETE && (
            <Badge variant="success">{t("scenario.lowest")}</Badge>
          )}
        </div>
      )}
      {showSummary && !details && (
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
          {quote.unit === QUOTE_UNITS.MILLION_SELECTED_TOKENS && (
            <span>{t("scenario.calculationHint")}</span>
          )}
          {quote.unit === QUOTE_UNITS.MILLION_VIDEO_OUTPUT_TOKENS && (
            <span>{t("scenario.videoComparisonHint")}</span>
          )}
          {quote.calculation?.comparisonQuantity !== undefined && (
            <span>{t("scenario.taskBasis")}</span>
          )}
          <button
            type="button"
            className="text-primary cursor-pointer underline underline-offset-2"
            aria-expanded={onShowDetails ? undefined : showCalculation}
            aria-controls={onShowDetails ? undefined : calculationId}
            onClick={() =>
              onShowDetails
                ? onShowDetails()
                : setShowCalculation(!showCalculation)
            }
          >
            {t("scenario.calculationDetails")}
          </button>
        </div>
      )}
      {showSummary &&
        publishedBase &&
        quote.status !== QUOTE_STATUSES.COMPLETE && (
          <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
            <span>{t("scenario.publishedPrices")}</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {Object.entries(publishedBase.rates).map(([meter, rate]) => (
                <span key={meter}>
                  {meterLabels[meter as PriceMeter]}:{" "}
                  {formatPrice(rate.amount, rate.currency, 6)} /{" "}
                  {rate.unit === PRICE_RATE_UNITS.TOKEN
                    ? t("scenario.perMillionTokens")
                    : t("scenario.perUnit")}
                </span>
              ))}
            </div>
          </div>
        )}
      {showSummary && hasKnownSubtotal && omittedMeters.length > 0 && (
        <p className="text-muted-foreground">
          {t("scenario.excludedCosts", {
            meters: new Intl.ListFormat(i18n.language).format(
              omittedMeters.map((meter) => meterLabels[meter]),
            ),
          })}
        </p>
      )}
      {showSummary &&
        hasContextTiers &&
        activeRanges.length === 0 &&
        quote.status === QUOTE_STATUSES.COMPLETE && (
          <p className="text-muted-foreground">
            {t("scenario.currentBaseTier")}
          </p>
        )}
      {showSummary && activeRanges.length > 0 && (
        <div className="bg-muted/20 border-primary/40 space-y-1 rounded-r-md border-l-2 py-1.5 pr-2 pl-2.5">
          <Badge variant="secondary">{t("scenario.tiered")}</Badge>
          {activeRanges.map((condition, index) => (
            <p key={index}>
              {t("scenario.currentTier")} ·{" "}
              {condition.outputTokenDeductions
                ? t("scenario.netOutput")
                : condition.inputTokenDeductions
                  ? t("scenario.netInput")
                  : condition.axis === PRICING_RANGE_AXES.TOTAL_TOKENS
                    ? t("scenario.totalTokens")
                    : t("scenario.input")}{" "}
              ·{" "}
              {t("contextTokenRange", {
                min: condition.min ?? 0,
                max:
                  condition.maxExclusive === undefined
                    ? "∞"
                    : condition.maxExclusive - 1,
              })}
            </p>
          ))}
          {quote.lines.map((line) => {
            const base = baseRates?.[line.meter]
            const current = effectiveRates[line.meter]
            if (
              !base ||
              !current ||
              base.unit !== PRICE_RATE_UNITS.TOKEN ||
              current.unit !== PRICE_RATE_UNITS.TOKEN ||
              base.currency !== current.currency ||
              base.amount / base.per === current.amount / current.per
            )
              return null
            return (
              <p key={line.meter}>
                {t("scenario.rateChange", {
                  meter: meterLabels[line.meter],
                  from: formatPrice(
                    (base.amount / base.per) * TOKENS_PER_MILLION,
                    base.currency,
                  ),
                  to: formatPrice(
                    (current.amount / current.per) * TOKENS_PER_MILLION,
                    current.currency,
                  ),
                })}
              </p>
            )
          })}
        </div>
      )}
      {showSummary && (
        <PricingConditionDetails
          details={quote.conditionDetails}
          requirements={quote.requirementDetails}
          issues={quote.issues}
        />
      )}
      {showSummary && reasons.length > 0 && (
        <p className="text-muted-foreground">{reasons.join(" · ")}</p>
      )}
      {(details || showCalculation) && (
        <ModelPriceCalculationDetails
          calculationId={calculationId}
          quote={quote}
          displayedSchedule={displayedSchedule}
          showsPublishedSchedule={showsPublishedSchedule}
          indexUnitLabel={indexUnitLabel}
          meterLabels={meterLabels}
          sourceLabel={sourceLabel}
          effectiveGroup={effectiveGroup}
        />
      )}
    </div>
  )
}
