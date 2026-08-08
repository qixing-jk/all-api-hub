import { useId } from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "~/components/ui"
import {
  isModelDisplayTranslationKey,
  MODEL_DISPLAY_FACT_TYPES,
  MODEL_DISPLAY_PRICE_UNITS,
  type ModelDisplayFact,
  type ModelDisplayLabel,
  type ModelDisplayPrice,
  type ModelDisplayPriceCondition,
  type ModelDisplayPriceUnit,
  type ModelPresentation,
} from "~/services/models/modelDisplayFacts"

const PRICE_UNIT_TRANSLATION_KEYS: Record<ModelDisplayPriceUnit, string> = {
  [MODEL_DISPLAY_PRICE_UNITS.MillionInputTokens]:
    "displayFacts.priceUnits.millionInputTokens",
  [MODEL_DISPLAY_PRICE_UNITS.MillionOutputTokens]:
    "displayFacts.priceUnits.millionOutputTokens",
  [MODEL_DISPLAY_PRICE_UNITS.MillionCachedInputTokens]:
    "displayFacts.priceUnits.millionCachedInputTokens",
  [MODEL_DISPLAY_PRICE_UNITS.MillionCacheWriteTokens]:
    "displayFacts.priceUnits.millionCacheWriteTokens",
  [MODEL_DISPLAY_PRICE_UNITS.MillionCacheWriteOneHourTokens]:
    "displayFacts.priceUnits.millionCacheWriteOneHourTokens",
  [MODEL_DISPLAY_PRICE_UNITS.MillionReasoningTokens]:
    "displayFacts.priceUnits.millionReasoningTokens",
  [MODEL_DISPLAY_PRICE_UNITS.MillionImageTokens]:
    "displayFacts.priceUnits.millionImageTokens",
  [MODEL_DISPLAY_PRICE_UNITS.MillionAudioInputTokens]:
    "displayFacts.priceUnits.millionAudioInputTokens",
  [MODEL_DISPLAY_PRICE_UNITS.MillionAudioOutputTokens]:
    "displayFacts.priceUnits.millionAudioOutputTokens",
  [MODEL_DISPLAY_PRICE_UNITS.MillionCachedAudioInputTokens]:
    "displayFacts.priceUnits.millionCachedAudioInputTokens",
  [MODEL_DISPLAY_PRICE_UNITS.Request]: "displayFacts.priceUnits.request",
  [MODEL_DISPLAY_PRICE_UNITS.InputImage]: "displayFacts.priceUnits.inputImage",
  [MODEL_DISPLAY_PRICE_UNITS.OutputImage]:
    "displayFacts.priceUnits.outputImage",
  [MODEL_DISPLAY_PRICE_UNITS.WebSearch]: "displayFacts.priceUnits.webSearch",
}

const PRICE_UNIT_FALLBACKS: Record<ModelDisplayPriceUnit, string> = {
  [MODEL_DISPLAY_PRICE_UNITS.MillionInputTokens]: "1M input tokens",
  [MODEL_DISPLAY_PRICE_UNITS.MillionOutputTokens]: "1M output tokens",
  [MODEL_DISPLAY_PRICE_UNITS.MillionCachedInputTokens]:
    "1M cached input tokens",
  [MODEL_DISPLAY_PRICE_UNITS.MillionCacheWriteTokens]: "1M cache-write tokens",
  [MODEL_DISPLAY_PRICE_UNITS.MillionCacheWriteOneHourTokens]:
    "1M one-hour cache-write tokens",
  [MODEL_DISPLAY_PRICE_UNITS.MillionReasoningTokens]: "1M reasoning tokens",
  [MODEL_DISPLAY_PRICE_UNITS.MillionImageTokens]: "1M image tokens",
  [MODEL_DISPLAY_PRICE_UNITS.MillionAudioInputTokens]: "1M audio input tokens",
  [MODEL_DISPLAY_PRICE_UNITS.MillionAudioOutputTokens]:
    "1M audio output tokens",
  [MODEL_DISPLAY_PRICE_UNITS.MillionCachedAudioInputTokens]:
    "1M cached audio input tokens",
  [MODEL_DISPLAY_PRICE_UNITS.Request]: "request",
  [MODEL_DISPLAY_PRICE_UNITS.InputImage]: "input image",
  [MODEL_DISPLAY_PRICE_UNITS.OutputImage]: "output image",
  [MODEL_DISPLAY_PRICE_UNITS.WebSearch]: "web search",
}

/** Resolves localized labels and value formatting for model display facts. */
function useModelDisplayFactText() {
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
    t(PRICE_UNIT_TRANSLATION_KEYS[unit], {
      defaultValue: PRICE_UNIT_FALLBACKS[unit],
    })

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
      case "minimum-prompt-tokens":
        return t("displayFacts.priceConditions.minimumPromptTokens", {
          count: condition.value,
          formattedCount: formatNumber(condition.value),
          defaultValue: "More than {{formattedCount}} prompt tokens",
        })
      case "utc-window":
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

/** Renders one typed model display fact value. */
function ModelDisplayFactValue({ fact }: { fact: ModelDisplayFact }) {
  const {
    formatDate,
    formatNumber,
    formatPercent,
    formatPrice,
    formatPriceCondition,
    resolveLabel,
    t,
  } = useModelDisplayFactText()

  switch (fact.type) {
    case MODEL_DISPLAY_FACT_TYPES.Text:
      return <span className="break-words">{fact.value}</span>
    case MODEL_DISPLAY_FACT_TYPES.TokenQuantity:
      return (
        <span>
          {t("displayFacts.tokenCount", {
            count: fact.value,
            formattedCount: formatNumber(fact.value),
          })}
        </span>
      )
    case MODEL_DISPLAY_FACT_TYPES.StringList:
      return (
        <ul className="flex min-w-0 flex-wrap gap-1">
          {fact.values.map((value) => (
            <li key={value} className="max-w-full min-w-0">
              <Badge
                variant="secondary"
                size="sm"
                className="max-w-full break-all"
              >
                {value}
              </Badge>
            </li>
          ))}
        </ul>
      )
    case MODEL_DISPLAY_FACT_TYPES.Boolean:
      return (
        <span>
          {fact.value
            ? t("displayFacts.boolean.yes", { defaultValue: "Yes" })
            : t("displayFacts.boolean.no", { defaultValue: "No" })}
        </span>
      )
    case MODEL_DISPLAY_FACT_TYPES.Number:
      return <span>{formatNumber(fact.value)}</span>
    case MODEL_DISPLAY_FACT_TYPES.Date:
      return <time dateTime={fact.value}>{formatDate(fact.value)}</time>
    case MODEL_DISPLAY_FACT_TYPES.Link:
      return (
        <a
          href={fact.href}
          target="_blank"
          rel="noreferrer noopener"
          className="break-all text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
        >
          {resolveLabel(fact.text)}
        </a>
      )
    case MODEL_DISPLAY_FACT_TYPES.CurrencyPrice:
      return <span>{formatPrice(fact)}</span>
    case MODEL_DISPLAY_FACT_TYPES.PriceOverrides:
      return (
        <ol className="space-y-3">
          {fact.overrides.map((override, index) => (
            <li
              key={`${override.conditions.map(formatPriceCondition).join(":")}:${index}`}
              className="rounded-md border border-amber-200 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-950/30"
            >
              <ul className="mb-1 list-disc space-y-0.5 pl-5 text-xs text-amber-800 dark:text-amber-200">
                {override.conditions.map((condition) => {
                  const conditionText = formatPriceCondition(condition)
                  return <li key={conditionText}>{conditionText}</li>
                })}
              </ul>
              <ul className="space-y-1">
                {override.prices.map((price) => (
                  <li
                    key={`${price.label.translationKey ?? price.label.fallback}:${price.unit}`}
                    className="flex min-w-0 flex-wrap justify-between gap-x-3"
                  >
                    <span className="break-words">
                      {resolveLabel(price.label)}
                    </span>
                    <span className="font-medium break-all">
                      {formatPrice(price)}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )
    case MODEL_DISPLAY_FACT_TYPES.BenchmarkList:
      return (
        <div className="max-w-full overflow-x-auto">
          <table
            aria-label={resolveLabel(fact.label)}
            className="w-full min-w-[32rem] border-collapse text-left text-xs"
          >
            <thead>
              <tr>
                <th className="pr-3 pb-1">
                  {t("displayFacts.benchmarkTable.arena", {
                    defaultValue: "Arena",
                  })}
                </th>
                <th className="pr-3 pb-1">
                  {t("displayFacts.benchmarkTable.category", {
                    defaultValue: "Category",
                  })}
                </th>
                <th className="pr-3 pb-1">
                  {t("displayFacts.benchmarkTable.score", {
                    defaultValue: "Score",
                  })}
                </th>
                <th className="pr-3 pb-1">
                  {t("displayFacts.benchmarkTable.rank", {
                    defaultValue: "Rank",
                  })}
                </th>
                <th className="pb-1">
                  {t("displayFacts.benchmarkTable.winRate", {
                    defaultValue: "Win rate",
                  })}
                </th>
              </tr>
            </thead>
            <tbody>
              {fact.entries.map((entry) => (
                <tr key={`${entry.arena}:${entry.category}`}>
                  <td className="border-t py-1 pr-3 break-all">
                    {entry.arena}
                  </td>
                  <td className="border-t py-1 pr-3 break-all">
                    {entry.category}
                  </td>
                  <td className="border-t py-1 pr-3">
                    {formatNumber(entry.score)}
                  </td>
                  <td className="border-t py-1 pr-3">
                    {formatNumber(entry.rank)}
                  </td>
                  <td className="border-t py-1">
                    {formatPercent(entry.winRatePercent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}

/** Renders one labelled model display fact. */
function ModelDisplayFactItem({ fact }: { fact: ModelDisplayFact }) {
  const { resolveLabel } = useModelDisplayFactText()

  return (
    <div data-testid="model-display-fact" className="min-w-0 space-y-1">
      <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {resolveLabel(fact.label)}
      </dt>
      <dd className="min-w-0 text-sm text-gray-700 dark:text-gray-200">
        <ModelDisplayFactValue fact={fact} />
      </dd>
    </div>
  )
}

/** Renders provider-selected summary facts for a model row. */
export function ModelPresentationSummary({
  presentation,
}: {
  presentation?: ModelPresentation
}) {
  const facts = presentation?.summaryFacts ?? []
  if (facts.length === 0) return null

  return (
    <dl className="mt-2 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {facts.map((fact, index) => (
        <ModelDisplayFactItem
          key={`${fact.label.translationKey ?? fact.label.fallback}:${index}`}
          fact={fact}
        />
      ))}
    </dl>
  )
}

/** Renders provider-selected detail sections for an expanded model row. */
export function ModelPresentationDetails({
  presentation,
}: {
  presentation?: ModelPresentation
}) {
  const { resolveLabel } = useModelDisplayFactText()
  const instanceId = useId()
  const sections = (presentation?.sections ?? []).filter(
    (section) => section.facts.length > 0,
  )
  if (sections.length === 0) return null

  return (
    <div data-testid="model-presentation-details" className="space-y-4">
      {sections.map((section) => {
        const headingId = `${instanceId}-model-facts-${section.id}`

        return (
          <section key={section.id} aria-labelledby={headingId}>
            <h4
              id={headingId}
              className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              {resolveLabel(section.label)}
            </h4>
            <dl className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
              {section.facts.map((fact, index) => (
                <ModelDisplayFactItem
                  key={`${fact.label.translationKey ?? fact.label.fallback}:${index}`}
                  fact={fact}
                />
              ))}
            </dl>
          </section>
        )
      })}
    </div>
  )
}
