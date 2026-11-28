import { useTranslation } from "react-i18next"

import {
  createModelDisplayLabel,
  isModelDisplayTranslationKey,
  MODEL_DISPLAY_PRICE_CONDITION_TYPES,
  MODEL_DISPLAY_PRICE_UNITS,
  type ModelDisplayLabel,
  type ModelDisplayPrice,
  type ModelDisplayPriceCondition,
  type ModelDisplayPriceUnit,
} from "~/services/models/modelDisplayFacts"

/** Keep each unit's translation key and fallback together. */
const PRICE_UNIT_LABELS: Record<ModelDisplayPriceUnit, ModelDisplayLabel> = {
  [MODEL_DISPLAY_PRICE_UNITS.MillionInputTokens]: createModelDisplayLabel(
    "displayFacts.priceUnits.millionInputTokens",
    "1M input tokens",
  ),
  [MODEL_DISPLAY_PRICE_UNITS.MillionOutputTokens]: createModelDisplayLabel(
    "displayFacts.priceUnits.millionOutputTokens",
    "1M output tokens",
  ),
  [MODEL_DISPLAY_PRICE_UNITS.MillionCachedInputTokens]: createModelDisplayLabel(
    "displayFacts.priceUnits.millionCachedInputTokens",
    "1M cached input tokens",
  ),
  [MODEL_DISPLAY_PRICE_UNITS.MillionCacheWriteTokens]: createModelDisplayLabel(
    "displayFacts.priceUnits.millionCacheWriteTokens",
    "1M cache-write tokens",
  ),
  [MODEL_DISPLAY_PRICE_UNITS.MillionCacheWriteOneHourTokens]:
    createModelDisplayLabel(
      "displayFacts.priceUnits.millionCacheWriteOneHourTokens",
      "1M one-hour cache-write tokens",
    ),
  [MODEL_DISPLAY_PRICE_UNITS.MillionReasoningTokens]: createModelDisplayLabel(
    "displayFacts.priceUnits.millionReasoningTokens",
    "1M reasoning tokens",
  ),
  [MODEL_DISPLAY_PRICE_UNITS.MillionImageTokens]: createModelDisplayLabel(
    "displayFacts.priceUnits.millionImageTokens",
    "1M image tokens",
  ),
  [MODEL_DISPLAY_PRICE_UNITS.MillionAudioInputTokens]: createModelDisplayLabel(
    "displayFacts.priceUnits.millionAudioInputTokens",
    "1M audio input tokens",
  ),
  [MODEL_DISPLAY_PRICE_UNITS.MillionAudioOutputTokens]: createModelDisplayLabel(
    "displayFacts.priceUnits.millionAudioOutputTokens",
    "1M audio output tokens",
  ),
  [MODEL_DISPLAY_PRICE_UNITS.MillionCachedAudioInputTokens]:
    createModelDisplayLabel(
      "displayFacts.priceUnits.millionCachedAudioInputTokens",
      "1M cached audio input tokens",
    ),
  [MODEL_DISPLAY_PRICE_UNITS.Request]: createModelDisplayLabel(
    "displayFacts.priceUnits.request",
    "request",
  ),
  [MODEL_DISPLAY_PRICE_UNITS.InputImage]: createModelDisplayLabel(
    "displayFacts.priceUnits.inputImage",
    "input image",
  ),
  [MODEL_DISPLAY_PRICE_UNITS.OutputImage]: createModelDisplayLabel(
    "displayFacts.priceUnits.outputImage",
    "output image",
  ),
  [MODEL_DISPLAY_PRICE_UNITS.WebSearch]: createModelDisplayLabel(
    "displayFacts.priceUnits.webSearch",
    "web search",
  ),
}

/** Resolves localized labels and value formatting for model display facts. */
export function useModelDisplayFactText() {
  const { t, i18n } = useTranslation("modelList")

  const resolveLabel = (label: ModelDisplayLabel) =>
    label.translationKey && isModelDisplayTranslationKey(label.translationKey)
      ? t(label.translationKey, { defaultValue: label.fallback })
      : label.fallback

  const formatNumber = (value: number) =>
    new Intl.NumberFormat(i18n.language, {
      maximumFractionDigits: 8,
    }).format(value)

  const formatPercent = (value: number) =>
    new Intl.NumberFormat(i18n.language, {
      style: "percent",
      maximumFractionDigits: 2,
    }).format(value / 100)

  const formatCurrency = (price: ModelDisplayPrice) =>
    new Intl.NumberFormat(i18n.language, {
      style: "currency",
      currency: price.currency,
      minimumFractionDigits: price.amount === 0 || price.amount >= 0.01 ? 2 : 0,
      maximumFractionDigits: 8,
    }).format(price.amount)

  const formatPriceUnit = (unit: ModelDisplayPriceUnit) =>
    resolveLabel(PRICE_UNIT_LABELS[unit])

  const formatPrice = (price: ModelDisplayPrice) =>
    `${formatCurrency(price)} / ${formatPriceUnit(price.unit)}`

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(`${value}T00:00:00Z`))

  const formatClock = (value: number) => {
    // OpenRouter encodes UTC pricing bounds as base-100 HHMM integers.
    const padded = value.toString().padStart(4, "0")
    return `${padded.slice(0, 2)}:${padded.slice(2)}`
  }

  const formatPriceCondition = (condition: ModelDisplayPriceCondition) => {
    switch (condition.type) {
      case MODEL_DISPLAY_PRICE_CONDITION_TYPES.MinimumPromptTokens:
        return t("displayFacts.priceConditions.minimumPromptTokens", {
          count: condition.value,
          formattedCount: formatNumber(condition.value),
          defaultValue: "More than {{formattedCount}} prompt tokens",
        })
      case MODEL_DISPLAY_PRICE_CONDITION_TYPES.UtcWindow:
        return t("displayFacts.priceConditions.utcWindow", {
          start: formatClock(condition.start),
          end: formatClock(condition.end),
          defaultValue: "{{start}}–{{end}} UTC",
        })
    }
  }

  return {
    formatDate,
    formatNumber,
    formatPercent,
    formatPrice,
    formatPriceCondition,
    resolveLabel,
    t,
  }
}
