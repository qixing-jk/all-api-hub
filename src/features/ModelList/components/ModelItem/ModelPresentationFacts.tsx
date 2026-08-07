import { useId } from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "~/components/ui"
import {
  isModelDisplayTranslationKey,
  MODEL_DISPLAY_FACT_TYPES,
  type ModelDisplayFact,
  type ModelDisplayLabel,
  type ModelPresentation,
} from "~/services/models/modelDisplayFacts"

/** Resolves localized labels and value formatting for model display facts. */
function useModelDisplayFactText() {
  const { t, i18n } = useTranslation("modelList")

  const resolveLabel = (label: ModelDisplayLabel) =>
    label.translationKey && isModelDisplayTranslationKey(label.translationKey)
      ? t(label.translationKey, { defaultValue: label.fallback })
      : label.fallback

  const formatTokenQuantity = (value: number) =>
    t("displayFacts.tokenCount", {
      count: value,
      formattedCount: new Intl.NumberFormat(i18n.language).format(value),
    })

  return { formatTokenQuantity, resolveLabel }
}

/** Renders one typed model display fact value. */
function ModelDisplayFactValue({ fact }: { fact: ModelDisplayFact }) {
  const { formatTokenQuantity } = useModelDisplayFactText()

  switch (fact.type) {
    case MODEL_DISPLAY_FACT_TYPES.Text:
      return <span className="break-words">{fact.value}</span>
    case MODEL_DISPLAY_FACT_TYPES.TokenQuantity:
      return <span>{formatTokenQuantity(fact.value)}</span>
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
