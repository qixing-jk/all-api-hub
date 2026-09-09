import { ChevronDown, CircleHelp, SlidersHorizontal } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { FormField, Input, SearchableSelect } from "~/components/ui"
import {
  MODEL_PRICE_COMPARISON_PRESET_IDS,
  MODEL_PRICE_COMPARISON_PRESETS,
  MODEL_PRICE_COMPARISON_WEIGHT_KEYS,
  type ModelPriceComparisonPresetId,
  type ModelPriceComparisonWeightKey,
  type ModelPriceComparisonWeights,
} from "~/features/ModelList/priceComparison"
import { trackProductAnalyticsActionCompleted } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODEL_PRICE_COMPARISON_PRESETS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
  type ProductAnalyticsModelPriceComparisonPreset,
} from "~/services/productAnalytics/contracts"

const ANALYTICS_PRESET_BY_PRICE_COMPARISON_PRESET: Record<
  ModelPriceComparisonPresetId,
  ProductAnalyticsModelPriceComparisonPreset
> = {
  [MODEL_PRICE_COMPARISON_PRESET_IDS.AZURE_CONVERSATION]:
    PRODUCT_ANALYTICS_MODEL_PRICE_COMPARISON_PRESETS.AzureConversation,
  [MODEL_PRICE_COMPARISON_PRESET_IDS.MOONCAKE_TOOL_AGENT]:
    PRODUCT_ANALYTICS_MODEL_PRICE_COMPARISON_PRESETS.MooncakeToolAgent,
  [MODEL_PRICE_COMPARISON_PRESET_IDS.AZURE_CODE]:
    PRODUCT_ANALYTICS_MODEL_PRICE_COMPARISON_PRESETS.AzureCode,
  [MODEL_PRICE_COMPARISON_PRESET_IDS.TRACELAB_CODING_AGENT]:
    PRODUCT_ANALYTICS_MODEL_PRICE_COMPARISON_PRESETS.TracelabCodingAgent,
  [MODEL_PRICE_COMPARISON_PRESET_IDS.CUSTOM]:
    PRODUCT_ANALYTICS_MODEL_PRICE_COMPARISON_PRESETS.Custom,
}

/** Counts the price meters included in the current comparison. */
function countModeledMeters(weights: ModelPriceComparisonWeights): number {
  return MODEL_PRICE_COMPARISON_WEIGHT_KEYS.filter(
    (key) => weights[key] !== null,
  ).length
}

/** Counts which price meters differ between two comparison settings. */
function countChangedMeters(
  currentWeights: ModelPriceComparisonWeights,
  nextWeights: ModelPriceComparisonWeights,
): number {
  return MODEL_PRICE_COMPARISON_WEIGHT_KEYS.filter(
    (key) => !Object.is(currentWeights[key], nextWeights[key]),
  ).length
}

/** Records a privacy-safe summary of a price-comparison adjustment. */
function trackPriceComparisonConfiguration(
  presetId: ModelPriceComparisonPresetId,
  changedMeterCount: number,
  modeledMeterCount: number,
) {
  void trackProductAnalyticsActionCompleted({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
    actionId: PRODUCT_ANALYTICS_ACTION_IDS.ConfigureModelPriceComparison,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListControlPanel,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    result: PRODUCT_ANALYTICS_RESULTS.Success,
    insights: {
      targetKind: PRODUCT_ANALYTICS_TARGET_KINDS.ModelFilter,
      priceComparisonPreset:
        ANALYTICS_PRESET_BY_PRICE_COMPARISON_PRESET[presetId],
      changedMeterCount,
      modeledMeterCount,
    },
  })
}

/** Preserves excluded meters as blank fields for both initial and updated weights. */
function toDraftWeights(weights: ModelPriceComparisonWeights) {
  return Object.fromEntries(
    MODEL_PRICE_COMPARISON_WEIGHT_KEYS.map((key) => [
      key,
      weights[key] === null ? "" : String(weights[key]),
    ]),
  ) as Record<ModelPriceComparisonWeightKey, string>
}

interface PriceComparisonControlsProps {
  conditionFields?: ReactNode
  conditionSummary?: ReactNode
  embedded?: boolean
  presetId: ModelPriceComparisonPresetId
  onPresetIdChange: (presetId: ModelPriceComparisonPresetId) => void
  weights: ModelPriceComparisonWeights
  onWeightsChange: (weights: ModelPriceComparisonWeights) => void
}

/** Price-comparison workload presets and editable token-bucket weights. */
export function PriceComparisonControls({
  presetId,
  onPresetIdChange,
  weights,
  onWeightsChange,
  embedded = false,
  conditionFields,
  conditionSummary,
}: PriceComparisonControlsProps) {
  const { t, i18n } = useTranslation("modelList")
  const [draftWeights, setDraftWeights] = useState(() =>
    toDraftWeights(weights),
  )

  useEffect(() => {
    setDraftWeights(toDraftWeights(weights))
  }, [weights])

  const presetOptions = [
    {
      value: MODEL_PRICE_COMPARISON_PRESET_IDS.AZURE_CONVERSATION,
      label: t("priceComparison.presets.generalChat"),
    },
    {
      value: MODEL_PRICE_COMPARISON_PRESET_IDS.MOONCAKE_TOOL_AGENT,
      label: t("priceComparison.presets.toolAgent"),
    },
    {
      value: MODEL_PRICE_COMPARISON_PRESET_IDS.AZURE_CODE,
      label: t("priceComparison.presets.codeCompletion"),
    },
    {
      value: MODEL_PRICE_COMPARISON_PRESET_IDS.TRACELAB_CODING_AGENT,
      label: t("priceComparison.presets.codingAgent"),
    },
    {
      value: MODEL_PRICE_COMPARISON_PRESET_IDS.CUSTOM,
      label: t("priceComparison.presets.custom"),
    },
  ]
  const sourceDetailsByPresetId: Partial<
    Record<ModelPriceComparisonPresetId, string>
  > = {
    [MODEL_PRICE_COMPARISON_PRESET_IDS.AZURE_CONVERSATION]: t(
      "priceComparison.sourceDetails.azureConversation",
    ),
    [MODEL_PRICE_COMPARISON_PRESET_IDS.MOONCAKE_TOOL_AGENT]: t(
      "priceComparison.sourceDetails.mooncakeToolAgent",
    ),
    [MODEL_PRICE_COMPARISON_PRESET_IDS.AZURE_CODE]: t(
      "priceComparison.sourceDetails.azureCode",
    ),
    [MODEL_PRICE_COMPARISON_PRESET_IDS.TRACELAB_CODING_AGENT]: t(
      "priceComparison.sourceDetails.tracelabCodingAgent",
    ),
  }
  const sourceDetails = sourceDetailsByPresetId[presetId]
  const weightLabels: Record<ModelPriceComparisonWeightKey, string> = {
    input: t("priceComparison.weights.input"),
    output: t("priceComparison.weights.output"),
    cacheRead: t("priceComparison.weights.cacheRead"),
    cacheWrite: t("priceComparison.weights.cacheWrite"),
  }

  const handlePresetChange = (value: string) => {
    const nextPresetId = value as ModelPriceComparisonPresetId
    onPresetIdChange(nextPresetId)

    if (nextPresetId === MODEL_PRICE_COMPARISON_PRESET_IDS.CUSTOM) {
      trackPriceComparisonConfiguration(
        nextPresetId,
        0,
        countModeledMeters(weights),
      )
      return
    }

    const nextWeights = {
      ...MODEL_PRICE_COMPARISON_PRESETS[nextPresetId].weights,
    }
    onWeightsChange(nextWeights)
    trackPriceComparisonConfiguration(
      nextPresetId,
      countChangedMeters(weights, nextWeights),
      countModeledMeters(nextWeights),
    )
  }

  const handleWeightChange = (
    key: ModelPriceComparisonWeightKey,
    value: string,
  ) => {
    setDraftWeights((current) => ({ ...current, [key]: value }))

    if (value.trim() === "") {
      const nextWeights = { ...weights, [key]: null }
      onPresetIdChange(MODEL_PRICE_COMPARISON_PRESET_IDS.CUSTOM)
      onWeightsChange(nextWeights)
      trackPriceComparisonConfiguration(
        MODEL_PRICE_COMPARISON_PRESET_IDS.CUSTOM,
        countChangedMeters(weights, nextWeights),
        countModeledMeters(nextWeights),
      )
      return
    }

    const parsedValue = Number(value)
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      return
    }

    const nextWeights = { ...weights, [key]: parsedValue }
    onPresetIdChange(MODEL_PRICE_COMPARISON_PRESET_IDS.CUSTOM)
    onWeightsChange(nextWeights)
    trackPriceComparisonConfiguration(
      MODEL_PRICE_COMPARISON_PRESET_IDS.CUSTOM,
      countChangedMeters(weights, nextWeights),
      countModeledMeters(nextWeights),
    )
  }

  const handleWeightBlur = (key: ModelPriceComparisonWeightKey) => {
    const draftValue = draftWeights[key].trim()
    if (draftValue === "") {
      return
    }

    const parsedValue = Number(draftValue)
    if (Number.isFinite(parsedValue) && parsedValue >= 0) {
      return
    }

    setDraftWeights((current) => ({
      ...current,
      [key]: weights[key] === null ? "" : String(weights[key]),
    }))
  }

  const weightTotal = MODEL_PRICE_COMPARISON_WEIGHT_KEYS.reduce(
    (total, key) => total + Math.max(0, weights[key] ?? 0),
    0,
  )
  return (
    <section
      aria-labelledby="model-price-comparison-title"
      aria-describedby="model-price-comparison-helper"
      className={
        embedded
          ? undefined
          : "dark:border-dark-bg-tertiary dark:bg-dark-bg-primary/40 relative mt-4 rounded-md border border-gray-200 bg-gray-50/70 p-3"
      }
    >
      {!embedded && (
        <div className="space-y-1 [@container(min-width:48rem)]:pr-44">
          <h3
            id="model-price-comparison-title"
            className="text-foreground text-sm font-semibold"
          >
            {t("priceComparison.sectionTitle")}
          </h3>
          <p
            id="model-price-comparison-description"
            className="dark:text-dark-text-tertiary text-xs text-gray-500"
          >
            {t("priceComparison.sectionDescription")}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="model-price-comparison-preset"
              className="text-foreground text-sm font-medium"
            >
              {t("priceComparison.presetLabel")}
            </label>
            {sourceDetails && (
              <Tooltip content={sourceDetails} wrapperClassName="inline-flex">
                <button
                  type="button"
                  aria-label={sourceDetails}
                  className="dark:text-dark-text-tertiary inline-flex h-4 w-4 items-center justify-center rounded-full text-gray-400 transition-colors hover:text-gray-600 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:outline-none dark:hover:text-gray-300"
                >
                  <CircleHelp className="h-4 w-4" aria-hidden="true" />
                </button>
              </Tooltip>
            )}
          </div>
          <div className="w-52 max-w-full">
            <SearchableSelect
              id="model-price-comparison-preset"
              aria-label={t("priceComparison.presetLabel")}
              options={presetOptions}
              value={presetId}
              onChange={handlePresetChange}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <dl className="flex flex-wrap gap-x-6 gap-y-2">
            {MODEL_PRICE_COMPARISON_WEIGHT_KEYS.filter(
              (key) => (weights[key] ?? 0) > 0,
            ).map((key) => (
              <div key={key} className="flex items-baseline gap-1">
                <dt className="text-muted-foreground text-xs">
                  {weightLabels[key]}
                </dt>
                <dd className="text-foreground text-sm font-medium tabular-nums">
                  {new Intl.NumberFormat(i18n?.language ?? "en", {
                    style: "percent",
                    maximumFractionDigits: 0,
                  }).format((weights[key] ?? 0) / weightTotal)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      {conditionSummary && <div className="mt-2">{conditionSummary}</div>}
      <details className="group mt-2">
        <summary className="bg-background text-foreground hover:bg-muted/70 inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border px-3 text-sm font-medium shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:outline-none [&::-webkit-details-marker]:hidden [@container(min-width:48rem)]:absolute [@container(min-width:48rem)]:top-3 [@container(min-width:48rem)]:right-3">
          <SlidersHorizontal
            className="text-muted-foreground size-3.5"
            aria-hidden="true"
          />
          <span>{t("priceComparison.customize")}</span>
          <ChevronDown
            className="text-muted-foreground size-3.5 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="mt-3 grid items-start gap-5 border-t pt-3 [@container(min-width:48rem)]:grid-cols-2">
          <div className="min-w-0 space-y-3">
            <div className="space-y-0.5">
              <h4 className="text-sm font-medium">
                {t("priceComparison.weightSectionTitle")}
              </h4>
              <p className="text-muted-foreground text-xs">
                {t("priceComparison.weightEffect")}
              </p>
            </div>
            <div className="grid max-w-md grid-cols-2 gap-3">
              {MODEL_PRICE_COMPARISON_WEIGHT_KEYS.map((key) => (
                <FormField
                  key={key}
                  label={weightLabels[key]}
                  htmlFor={`model-price-comparison-weight-${key}`}
                >
                  <Input
                    id={`model-price-comparison-weight-${key}`}
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    placeholder={t("priceComparison.unmodeledPlaceholder")}
                    aria-describedby="model-price-comparison-helper"
                    value={draftWeights[key]}
                    onChange={(event) =>
                      handleWeightChange(key, event.target.value)
                    }
                    onBlur={() => handleWeightBlur(key)}
                    onClear={() => handleWeightChange(key, "")}
                    clearButtonLabel={t("priceComparison.clearWeight", {
                      meter: weightLabels[key],
                    })}
                  />
                </FormField>
              ))}
              <p
                id="model-price-comparison-helper"
                className="dark:text-dark-text-tertiary col-span-2 text-xs leading-5 text-gray-500"
              >
                {t("priceComparison.helperNote")}
              </p>
            </div>
          </div>
          {conditionFields}
        </div>
      </details>
    </section>
  )
}
