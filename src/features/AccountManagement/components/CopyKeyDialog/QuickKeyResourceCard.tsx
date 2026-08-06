import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/outline"
import { useId, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Badge, Card, CardContent } from "~/components/ui"
import {
  KEY_RESOURCE_CONTENT_LAYOUTS,
  KeyResourceFactList,
  KeyResourceSecretDisplay,
} from "~/features/KeyManagement/components/KeyResourceCard"
import type { KeyResourceCardPresentation } from "~/features/KeyManagement/presentation/keyResourceCard"

type QuickKeyResourceCardProps = {
  presentation: KeyResourceCardPresentation
  secret?: ReactNode
  secretControls?: ReactNode
  isExpanded: boolean
  onExpandedChange: (isExpanded: boolean) => void
  testId?: string
}

const getStatusVariant = (
  status: KeyResourceCardPresentation["status"],
): "success" | "secondary" | "outline" => {
  switch (status) {
    case "active":
      return "success"
    case "inactive":
      return "secondary"
    default:
      return "outline"
  }
}

/**
 * Keeps the quick-list density and disclosure interaction while rendering the
 * normalized facts and capability-governed controls owned by each provider.
 */
export function QuickKeyResourceCard({
  presentation,
  secret,
  secretControls,
  isExpanded,
  onExpandedChange,
  testId,
}: QuickKeyResourceCardProps) {
  const { t } = useTranslation("keyManagement")
  const detailsPanelId = useId()
  const detailsTriggerId = useId()
  const headerFact = presentation.contextFact
  const expandedSummaryFacts = presentation.summaryFacts.filter(
    (fact) => fact.id !== headerFact?.id,
  )
  const summaryFactIds = new Set(
    presentation.summaryFacts.map((fact) => fact.id),
  )
  const expandedDetailFacts = presentation.detailFacts.filter(
    (fact) => !summaryFactIds.has(fact.id),
  )

  return (
    <Card variant="interactive" padding="none" data-testid={testId}>
      <button
        id={detailsTriggerId}
        type="button"
        className="dark:hover:bg-dark-bg-tertiary flex w-full items-center justify-between gap-3 rounded-lg p-3 text-left transition-colors hover:bg-gray-50"
        aria-label={t("actions.detailsFor", { name: presentation.title })}
        aria-controls={detailsPanelId}
        aria-expanded={isExpanded}
        onClick={() => onExpandedChange(!isExpanded)}
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="dark:text-dark-text-primary max-w-full truncate text-sm font-medium text-gray-900">
            {presentation.title}
          </span>
          {headerFact ? (
            <Badge
              variant="outline"
              size="sm"
              className="max-w-full truncate"
              title={`${headerFact.label}: ${headerFact.value}`}
            >
              {headerFact.value}
            </Badge>
          ) : null}
        </span>

        <span className="flex shrink-0 items-center gap-2">
          <Badge variant={getStatusVariant(presentation.status)} size="sm">
            {presentation.statusLabel}
          </Badge>
          {isExpanded ? (
            <ChevronDownIcon aria-hidden="true" className="h-4 w-4" />
          ) : (
            <ChevronRightIcon aria-hidden="true" className="h-4 w-4" />
          )}
        </span>
      </button>

      {isExpanded ? (
        <CardContent
          id={detailsPanelId}
          role="region"
          aria-labelledby={detailsTriggerId}
          padding="sm"
          spacing="sm"
          className="dark:border-dark-bg-tertiary border-t border-gray-200"
        >
          <KeyResourceSecretDisplay
            label={t("keyDetails.key")}
            secret={secret}
            controls={secretControls}
            layout={KEY_RESOURCE_CONTENT_LAYOUTS.Adaptive}
          />
          {expandedSummaryFacts.length > 0 ? (
            <KeyResourceFactList
              facts={expandedSummaryFacts}
              layout={KEY_RESOURCE_CONTENT_LAYOUTS.Adaptive}
            />
          ) : null}
          {expandedDetailFacts.length > 0 ? (
            <div className="dark:border-dark-bg-tertiary border-t border-gray-200 pt-3">
              <KeyResourceFactList
                facts={expandedDetailFacts}
                layout={KEY_RESOURCE_CONTENT_LAYOUTS.Adaptive}
              />
            </div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  )
}
