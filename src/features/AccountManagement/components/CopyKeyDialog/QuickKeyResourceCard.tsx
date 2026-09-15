import { ChevronDown, ChevronRight } from "lucide-react"
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
        className="dark:hover:bg-secondary hover:bg-surface-subtle gap-y-density-3 py-density-3 flex w-full items-center justify-between gap-x-3 rounded-[var(--corner-inner-radius)] px-3 text-left transition-colors aria-expanded:rounded-b-none"
        aria-label={t("actions.detailsFor", { name: presentation.title })}
        aria-controls={detailsPanelId}
        aria-expanded={isExpanded}
        onClick={() => onExpandedChange(!isExpanded)}
      >
        <span className="gap-y-density-1-5 flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5">
          <span className="text-foreground max-w-full truncate text-sm font-medium">
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

        <span className="gap-y-density-2 flex shrink-0 items-center gap-x-2">
          <Badge variant={getStatusVariant(presentation.status)} size="sm">
            {presentation.statusLabel}
          </Badge>
          {isExpanded ? (
            <ChevronDown aria-hidden="true" className="h-4 w-4" />
          ) : (
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
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
          className="border-border border-t"
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
            <div className="border-border pt-density-3 border-t">
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
