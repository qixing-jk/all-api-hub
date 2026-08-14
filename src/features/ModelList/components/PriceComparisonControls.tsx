import { CircleHelp } from "lucide-react"
import { useEffect, useState } from "react"
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

interface PriceComparisonControlsProps {
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
}: PriceComparisonControlsProps) {
  const { t } = useTranslation("modelList")
  const [draftWeights, setDraftWeights] = useState<
    Record<ModelPriceComparisonWeightKey, string>
  >(
    () =>
      Object.fromEntries(
        MODEL_PRICE_COMPARISON_WEIGHT_KEYS.map((key) => [
          key,
          weights[key] === null ? "" : String(weights[key]),
        ]),
      ) as Record<ModelPriceComparisonWeightKey, string>,
  )

  useEffect(() => {
    setDraftWeights(
      Object.fromEntries(
        MODEL_PRICE_COMPARISON_WEIGHT_KEYS.map((key) => [
          key,
          weights[key] === null ? "" : String(weights[key]),
        ]),
      ) as Record<ModelPriceComparisonWeightKey, string>,
    )
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
      return
    }

    onWeightsChange({ ...MODEL_PRICE_COMPARISON_PRESETS[nextPresetId].weights })
  }

  const handleWeightChange = (
    key: ModelPriceComparisonWeightKey,
    value: string,
  ) => {
    setDraftWeights((current) => ({ ...current, [key]: value }))

    if (value.trim() === "") {
      onPresetIdChange(MODEL_PRICE_COMPARISON_PRESET_IDS.CUSTOM)
      onWeightsChange({ ...weights, [key]: null })
      return
    }

    const parsedValue = Number(value)
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      return
    }

    onPresetIdChange(MODEL_PRICE_COMPARISON_PRESET_IDS.CUSTOM)
    onWeightsChange({ ...weights, [key]: parsedValue })
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

  return (
    <section
      aria-labelledby="model-price-comparison-title"
      aria-describedby="model-price-comparison-description model-price-comparison-helper"
      className="dark:border-dark-bg-tertiary dark:bg-dark-bg-primary/40 mt-4 rounded-md border border-gray-200 bg-gray-50/70 p-3"
    >
      <div className="space-y-1">
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

      <div className="mt-3 grid grid-cols-1 gap-3 [@container(min-width:32rem)]:grid-cols-2 [@container(min-width:48rem)]:grid-cols-[minmax(11rem,1.25fr)_repeat(4,minmax(6rem,1fr))]">
        <div className="space-y-2 [@container(min-width:32rem)]:col-span-2 [@container(min-width:48rem)]:col-span-1">
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
          <SearchableSelect
            id="model-price-comparison-preset"
            aria-label={t("priceComparison.presetLabel")}
            options={presetOptions}
            value={presetId}
            onChange={handlePresetChange}
          />
        </div>
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
              onChange={(event) => handleWeightChange(key, event.target.value)}
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
          className="dark:text-dark-text-tertiary text-xs leading-5 text-gray-500 [@container(min-width:32rem)]:col-span-2 [@container(min-width:48rem)]:col-span-5"
        >
          {t("priceComparison.helperNote")}
        </p>
      </div>
    </section>
  )
}
