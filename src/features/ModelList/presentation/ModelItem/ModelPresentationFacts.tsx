import { useId } from "react"

import { Badge } from "~/components/ui"
import {
  MODEL_DISPLAY_FACT_TYPES,
  MODEL_PRESENTATION_SUMMARY_LAYOUTS,
  type ModelDisplayFact,
  type ModelPresentation,
} from "~/services/models/modelDisplayFacts"

import { useModelDisplayFactText } from "./useModelDisplayFactText"

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
      return (
        <span className="break-words">
          {typeof fact.value === "string"
            ? fact.value
            : resolveLabel(fact.value)}
        </span>
      )
    case MODEL_DISPLAY_FACT_TYPES.TokenQuantity:
      return (
        <span>
          {t("modelList:displayFacts.tokenCount", {
            count: fact.value,
            formattedCount: formatNumber(fact.value),
          })}
        </span>
      )
    case MODEL_DISPLAY_FACT_TYPES.StringList:
      return (
        <ul className="flex min-w-0 flex-wrap gap-x-1 gap-y-density-1">
          {fact.values.map((value) => (
            <li key={value} className="max-w-full min-w-0">
              <Badge
                variant={value === fact.currentValue ? "default" : "secondary"}
                size="sm"
                className="max-w-full break-all"
              >
                {value === fact.currentValue
                  ? t("modelList:displayFacts.currentValue", { value })
                  : value}
              </Badge>
            </li>
          ))}
        </ul>
      )
    case MODEL_DISPLAY_FACT_TYPES.Boolean:
      return (
        <span>
          {fact.value
            ? t("modelList:displayFacts.boolean.yes", { defaultValue: "Yes" })
            : t("modelList:displayFacts.boolean.no", { defaultValue: "No" })}
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
          className="break-all text-theme-600 underline-offset-2 hover:underline dark:text-theme-400"
        >
          {resolveLabel(fact.text)}
        </a>
      )
    case MODEL_DISPLAY_FACT_TYPES.CurrencyPrice:
      return <span>{formatPrice(fact)}</span>
    case MODEL_DISPLAY_FACT_TYPES.PriceOverrides:
      return (
        <ol className="space-y-density-3">
          {fact.overrides.map((override, index) => (
            <li
              key={`${override.conditions.map(formatPriceCondition).join(":")}:${index}`}
              className="rounded-md border border-warning-border bg-warning-soft px-2 py-density-2"
            >
              <ul className="mb-density-1 list-disc space-y-0.5 pl-5 text-xs text-warning-text">
                {override.conditions.map((condition) => {
                  const conditionText = formatPriceCondition(condition)
                  return <li key={conditionText}>{conditionText}</li>
                })}
              </ul>
              <ul className="space-y-density-1">
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
                <th className="pr-3 pb-density-1">
                  {t("modelList:displayFacts.benchmarkTable.arena", {
                    defaultValue: "Arena",
                  })}
                </th>
                <th className="pr-3 pb-density-1">
                  {t("modelList:displayFacts.benchmarkTable.category", {
                    defaultValue: "Category",
                  })}
                </th>
                <th className="pr-3 pb-density-1">
                  {t("modelList:displayFacts.benchmarkTable.score", {
                    defaultValue: "Score",
                  })}
                </th>
                <th className="pr-3 pb-density-1">
                  {t("modelList:displayFacts.benchmarkTable.rank", {
                    defaultValue: "Rank",
                  })}
                </th>
                <th className="pb-density-1">
                  {t("modelList:displayFacts.benchmarkTable.winRate", {
                    defaultValue: "Win rate",
                  })}
                </th>
              </tr>
            </thead>
            <tbody>
              {fact.entries.map((entry) => (
                <tr key={`${entry.arena}:${entry.category}`}>
                  <td className="border-t py-density-1 pr-3 break-all">
                    {entry.arena}
                  </td>
                  <td className="border-t py-density-1 pr-3 break-all">
                    {entry.category}
                  </td>
                  <td className="border-t py-density-1 pr-3">
                    {formatNumber(entry.score)}
                  </td>
                  <td className="border-t py-density-1 pr-3">
                    {formatNumber(entry.rank)}
                  </td>
                  <td className="border-t py-density-1">
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
function ModelDisplayFactItem({
  fact,
  inline = false,
}: {
  fact: ModelDisplayFact
  inline?: boolean
}) {
  const { resolveLabel } = useModelDisplayFactText()

  return (
    <div
      data-testid="model-display-fact"
      className={
        inline
          ? "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-density-1"
          : "min-w-0 space-y-density-1"
      }
    >
      <dt className="shrink-0 text-xs font-medium text-muted-foreground">
        {resolveLabel(fact.label)}
      </dt>
      <dd className="min-w-0 text-sm text-secondary-foreground">
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
  const inline =
    presentation?.summaryLayout === MODEL_PRESENTATION_SUMMARY_LAYOUTS.Inline

  return (
    <dl
      className={
        inline
          ? "mt-density-2 flex min-w-0 flex-wrap gap-x-4 gap-y-density-2"
          : "mt-density-2 grid min-w-0 grid-cols-1 gap-x-2 gap-y-density-2 sm:grid-cols-2 lg:grid-cols-3"
      }
    >
      {facts.map((fact, index) => (
        <ModelDisplayFactItem
          key={`${fact.label.translationKey ?? fact.label.fallback}:${index}`}
          fact={fact}
          inline={inline}
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
    <div data-testid="model-presentation-details" className="space-y-density-4">
      {sections.map((section) => {
        const headingId = `${instanceId}-model-facts-${section.id}`

        return (
          <section key={section.id} aria-labelledby={headingId}>
            <h4
              id={headingId}
              className="mb-density-2 text-sm font-medium text-secondary-foreground"
            >
              {resolveLabel(section.label)}
            </h4>
            <dl className="grid min-w-0 grid-cols-1 gap-x-3 gap-y-density-3 md:grid-cols-2">
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
