import { Info } from "lucide-react"
import { useId, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import {
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  Heading6,
  IconButton,
  Spinner,
} from "~/components/ui"
import type {
  KeyResourceCardPresentation,
  KeyResourceDetailState,
  KeyResourceFact,
} from "~/features/KeyManagement/presentation/keyResourceCard"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"

export type KeyResourceCardProps = {
  presentation: KeyResourceCardPresentation
  secret?: ReactNode
  secretControls?: ReactNode
  actions?: ReactNode
  details?: KeyResourceDetailState
  isDetailsExpanded: boolean
  onDetailsExpandedChange: (isExpanded: boolean) => void
  isSelected?: boolean
  onSelectionChange?: (checked: boolean) => void
  selectionLabel?: string
  renderHeader?: (props: KeyResourceCardHeaderRenderProps) => ReactNode
  testId?: string
}

export type KeyResourceCardHeaderRenderProps = {
  presentation: KeyResourceCardPresentation
  selection?: ReactNode
  detailsTrigger: ReactNode
  actions?: ReactNode
}

export type KeyResourceCardHeaderProps = {
  presentation: KeyResourceCardPresentation
  actions?: ReactNode
  providerBadges?: ReactNode
  selection?: ReactNode
  detailsTrigger?: ReactNode
}

export type KeyResourceFactListProps = {
  facts: KeyResourceFact[]
  testId?: string
}

export type KeyResourceSecretDisplayProps = {
  label?: ReactNode
  secret?: ReactNode
  controls?: ReactNode
  message?: ReactNode
}

/**
 * Maps the provider-neutral status to the shared semantic badge variants.
 */
function getStatusBadgeVariant(status: KeyResourceCardPresentation["status"]) {
  switch (status) {
    case "active":
      return "success"
    case "inactive":
      return "destructive"
    case "unknown":
      return "outline"
  }
}

/**
 * Renders the shared title, status, account, and action area for a key resource.
 */
export function KeyResourceCardHeader({
  presentation,
  actions,
  providerBadges,
  selection,
  detailsTrigger,
}: KeyResourceCardHeaderProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {selection}
        <Heading6 className="min-w-0 text-sm break-words sm:text-base">
          {presentation.title}
        </Heading6>
        <Badge variant={getStatusBadgeVariant(presentation.status)} size="sm">
          {presentation.statusLabel}
        </Badge>
        <Badge
          variant="outline"
          size="sm"
          className="max-w-full break-words whitespace-normal"
        >
          {presentation.accountLabel}
        </Badge>
        {providerBadges}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {detailsTrigger ? detailsTrigger : null}
        {actions}
      </div>
    </div>
  )
}

/**
 * Renders label and value facts in a responsive, wrapping grid.
 */
export function KeyResourceFactList({
  facts,
  testId,
}: KeyResourceFactListProps) {
  return (
    <div
      data-testid={testId}
      className="xs:grid-cols-2 grid grid-cols-1 gap-2.5 sm:grid-cols-4 sm:gap-3.5"
    >
      {facts.map((fact) => (
        <div
          key={fact.id}
          className="flex min-w-0 flex-wrap items-baseline gap-x-2 break-words"
        >
          <span className="dark:text-dark-text-tertiary text-xs text-gray-500 sm:text-sm">
            {fact.label}
          </span>
          <span className="dark:text-dark-text-primary min-w-0 text-xs font-medium break-words text-gray-900 sm:text-sm">
            {fact.value}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Renders the shared secret label, caller-owned content and availability guidance.
 */
export function KeyResourceSecretDisplay({
  label,
  secret,
  controls,
  message,
}: KeyResourceSecretDisplayProps) {
  if (!secret && !controls && !message) {
    return null
  }

  return (
    <div
      data-testid={KEY_MANAGEMENT_TEST_IDS.keyResourceSecretDisplay}
      className="flex min-w-0 flex-wrap items-center gap-2"
    >
      {label ? (
        <span className="dark:text-dark-text-tertiary shrink-0 whitespace-nowrap text-gray-500">
          {label}
        </span>
      ) : null}
      {secret ? (
        <div className="max-w-full min-w-0 font-mono text-xs break-all">
          {secret}
        </div>
      ) : null}
      {controls ? (
        <div className="flex flex-wrap items-center gap-1.5">{controls}</div>
      ) : null}
      {message ? (
        <span className="dark:text-dark-text-tertiary min-w-0 text-xs break-words text-gray-500 sm:text-sm">
          {message}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Renders a provider-neutral key resource summary with controlled detail disclosure.
 */
export function KeyResourceCard({
  presentation,
  secret,
  secretControls,
  actions,
  details,
  isDetailsExpanded,
  onDetailsExpandedChange,
  isSelected,
  onSelectionChange,
  selectionLabel,
  renderHeader,
  testId,
}: KeyResourceCardProps) {
  const { t } = useTranslation(["keyManagement", "common"])
  const detailsPanelId = useId()
  const detailsTriggerId = useId()
  const detailState = details ?? {
    status: "ready" as const,
    facts: presentation.detailFacts,
  }
  const detailsLabel = t("actions.details")
  const detailsAriaLabel = t("actions.detailsFor", {
    name: presentation.title,
  })

  // Expansion is local disclosure state, so it intentionally emits no analytics.
  const detailsTrigger = (
    <Tooltip content={detailsLabel} anchorAsChild>
      <IconButton
        id={detailsTriggerId}
        type="button"
        aria-label={detailsAriaLabel}
        aria-controls={detailsPanelId}
        aria-expanded={isDetailsExpanded}
        disableAutoTitle
        size="sm"
        variant="ghost"
        onClick={() => onDetailsExpandedChange(!isDetailsExpanded)}
      >
        <Info aria-hidden="true" className="h-4 w-4" />
      </IconButton>
    </Tooltip>
  )
  const selection = onSelectionChange ? (
    <Checkbox
      checked={isSelected === true}
      aria-label={selectionLabel ?? presentation.title}
      onCheckedChange={(checked) => onSelectionChange(checked === true)}
    />
  ) : undefined
  const headerProps: KeyResourceCardHeaderRenderProps = {
    presentation,
    selection,
    detailsTrigger,
    actions,
  }

  return (
    <Card data-testid={testId}>
      <CardContent padding="default" spacing="default">
        <div className="flex min-w-0 flex-col gap-3">
          {renderHeader ? (
            renderHeader(headerProps)
          ) : (
            <KeyResourceCardHeader {...headerProps} />
          )}
          <KeyResourceSecretDisplay
            label={t("keyDetails.key")}
            secret={secret}
            controls={secretControls}
            message={presentation.secretAvailabilityMessage}
          />
          <KeyResourceFactList
            facts={presentation.summaryFacts}
            testId={KEY_MANAGEMENT_TEST_IDS.keyResourceSummaryFacts}
          />
          {isDetailsExpanded ? (
            <div
              id={detailsPanelId}
              role="region"
              aria-labelledby={detailsTriggerId}
              className="dark:border-dark-bg-tertiary flex min-w-0 flex-col gap-3 border-t border-gray-200 pt-3"
            >
              {detailState.status === "loading" ? (
                <div role="status" className="flex items-center gap-2 text-sm">
                  <Spinner aria-hidden="true" size="sm" />
                  <span>{t("details.loading")}</span>
                </div>
              ) : null}
              {detailState.status === "error" ? (
                <div
                  role="alert"
                  className="flex min-w-0 flex-wrap items-center gap-2 text-sm"
                >
                  <span className="min-w-0 break-words">
                    {detailState.message || t("details.unavailable")}
                  </span>
                  {detailState.onRetry ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={detailState.onRetry}
                    >
                      {t("common:actions.retry")}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {detailState.status === "ready" ? (
                detailState.facts.length > 0 ? (
                  <KeyResourceFactList facts={detailState.facts} />
                ) : (
                  <p className="dark:text-dark-text-secondary text-sm text-gray-600">
                    {t("details.empty")}
                  </p>
                )
              ) : null}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
