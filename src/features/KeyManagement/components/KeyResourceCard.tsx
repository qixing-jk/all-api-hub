import { Info } from "lucide-react"
import { useId, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { CredentialAssociationMenu } from "~/components/CredentialAssociationMenu"
import Tooltip from "~/components/Tooltip"
import {
  Badge,
  Button,
  Card,
  CardContent,
  Heading6,
  IconButton,
  Spinner,
} from "~/components/ui"
import { BatchSelectionControl } from "~/features/KeyManagement/components/BatchSelectionControl"
import type { KeyCredentialAssociationStatus } from "~/features/KeyManagement/credentialAssociations"
import type {
  KeyResourceCardPresentation,
  KeyResourceDetailState,
  KeyResourceFact,
} from "~/features/KeyManagement/presentation/keyResourceCard"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import { cn } from "~/lib/utils"

export const KEY_RESOURCE_CONTENT_LAYOUTS = {
  Default: "default",
  Adaptive: "adaptive",
} as const

type KeyResourceContentLayout =
  (typeof KEY_RESOURCE_CONTENT_LAYOUTS)[keyof typeof KEY_RESOURCE_CONTENT_LAYOUTS]

export type KeyResourceCredentialAssociation = {
  status: KeyCredentialAssociationStatus
  label: string
  actionLabel: string
  saveAndAssociateLabel?: string
  associateLabel?: string
  onSaveAndAssociate?: () => void | Promise<void>
  onAssociate?: () => void
  onOpen?: () => void
  onUnlink?: () => void
  unlinkLabel?: string
}

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
  selectionDisabledReason?: string
  renderHeader?: (props: KeyResourceCardHeaderRenderProps) => ReactNode
  testId?: string
  /** Stable local target used by asynchronous in-page navigation. */
  targetId?: string
  /** Whether this card is the current route navigation target. */
  isNavigationTarget?: boolean
  association?: KeyResourceCredentialAssociation
}

export type KeyResourceCardHeaderRenderProps = {
  presentation: KeyResourceCardPresentation
  selection?: ReactNode
  detailsTrigger: ReactNode
  actions?: ReactNode
  association?: ReactNode
  providerBadges?: ReactNode
}

export type KeyResourceCardHeaderProps = {
  presentation: KeyResourceCardPresentation
  actions?: ReactNode
  association?: ReactNode
  providerBadges?: ReactNode
  selection?: ReactNode
  detailsTrigger?: ReactNode
}

export type KeyResourceFactListProps = {
  facts: KeyResourceFact[]
  testId?: string
  layout?: KeyResourceContentLayout
}

export type KeyResourceSecretDisplayProps = {
  label?: ReactNode
  secret?: ReactNode
  controls?: ReactNode
  message?: string
  layout?: KeyResourceContentLayout
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
  association,
  providerBadges,
  selection,
  detailsTrigger,
}: KeyResourceCardHeaderProps) {
  const { t } = useTranslation(["keyManagement"])

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
        {association ? (
          <KeyResourceActionGroup
            label={t("keyManagement:actionToolbar.apiCredential")}
          >
            {association}
          </KeyResourceActionGroup>
        ) : null}
        {detailsTrigger ? detailsTrigger : null}
        {actions}
      </div>
    </div>
  )
}

type KeyResourceCredentialAssociationControlProps = {
  association: KeyResourceCredentialAssociation
}

/** Renders a credential relationship as one compact action menu. */
export function KeyResourceCredentialAssociationControl({
  association,
}: KeyResourceCredentialAssociationControlProps) {
  const { t } = useTranslation(["keyManagement"])

  return (
    <CredentialAssociationMenu
      status={association.status}
      items={[
        {
          id: "credential-association",
          testId: association.onSaveAndAssociate
            ? KEY_MANAGEMENT_TEST_IDS.saveToApiProfilesButton
            : undefined,
          onSaveAndAssociate: association.onSaveAndAssociate,
          onAssociate: association.onAssociate,
          onOpen: association.onOpen,
          onUnlink: association.onUnlink,
        },
      ]}
      labels={{
        saveAndAssociate: association.saveAndAssociateLabel,
        associate: association.associateLabel,
        open: association.actionLabel,
        unlink: association.unlinkLabel,
      }}
      triggerAriaLabel={t("keyManagement:actionToolbar.apiCredential")}
      testId={KEY_MANAGEMENT_TEST_IDS.apiCredentialAssociationButton}
    />
  )
}

type KeyResourceActionToolbarProps = {
  label: string
  children: ReactNode
  testId?: string
}

/** Groups dense row actions into a wrapping, accessible toolbar. */
export function KeyResourceActionToolbar({
  label,
  children,
  testId,
}: KeyResourceActionToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      data-testid={testId}
      className="flex w-full flex-wrap items-center justify-start gap-x-2 gap-y-1 sm:w-auto sm:shrink-0 sm:justify-end"
    >
      {children}
    </div>
  )
}

type KeyResourceActionGroupProps = {
  label: string
  separated?: boolean
  children: ReactNode
}

/** Renders the desktop-only boundary between semantic action groups. */
function KeyResourceActionSeparator() {
  return (
    <span
      aria-hidden="true"
      className="dark:bg-dark-bg-tertiary hidden h-4 w-px bg-gray-200 sm:block"
    />
  )
}

/** Keeps each semantic action group and its separator together when wrapping. */
export function KeyResourceActionGroup({
  label,
  separated = false,
  children,
}: KeyResourceActionGroupProps) {
  return (
    <div className="inline-flex shrink-0 items-center gap-2">
      {separated ? <KeyResourceActionSeparator /> : null}
      <div
        role="group"
        aria-label={label}
        className="inline-flex items-center gap-0.5"
      >
        {children}
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
  layout = KEY_RESOURCE_CONTENT_LAYOUTS.Default,
}: KeyResourceFactListProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "grid",
        layout === KEY_RESOURCE_CONTENT_LAYOUTS.Adaptive
          ? "grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3.5"
          : "xs:grid-cols-2 grid-cols-1 gap-2.5 sm:grid-cols-4 sm:gap-3.5",
      )}
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
  layout = KEY_RESOURCE_CONTENT_LAYOUTS.Default,
}: KeyResourceSecretDisplayProps) {
  if (!secret && !controls && !message) {
    return null
  }

  const labelContent = label ? (
    <span className="dark:text-dark-text-tertiary shrink-0 whitespace-nowrap text-gray-500">
      {label}
    </span>
  ) : null
  const secretContent = secret ? (
    <div className="max-w-full min-w-0 font-mono text-xs break-all">
      {secret}
    </div>
  ) : null
  const controlsContent = controls ? (
    <div className="flex flex-wrap items-center gap-1.5">{controls}</div>
  ) : null
  const messageContent = message ? (
    <IconButton
      aria-label={message}
      className="dark:text-dark-text-tertiary dark:hover:bg-dark-bg-tertiary dark:hover:text-dark-text-secondary shrink-0 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
      size="xs"
      tooltip={message}
      variant="ghost"
    >
      <Info aria-hidden="true" className="h-3.5 w-3.5" />
    </IconButton>
  ) : null

  if (layout === KEY_RESOURCE_CONTENT_LAYOUTS.Adaptive) {
    return (
      <div
        data-testid={KEY_MANAGEMENT_TEST_IDS.keyResourceSecretDisplay}
        className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {labelContent}
          {secretContent}
          {messageContent}
        </div>
        {controlsContent ? (
          <div className="min-w-0 sm:justify-self-end">{controlsContent}</div>
        ) : null}
      </div>
    )
  }

  return (
    <div
      data-testid={KEY_MANAGEMENT_TEST_IDS.keyResourceSecretDisplay}
      className="flex min-w-0 flex-wrap items-center gap-2"
    >
      {labelContent}
      {secretContent}
      {messageContent}
      {controlsContent}
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
  selectionDisabledReason,
  renderHeader,
  testId,
  targetId,
  isNavigationTarget = false,
  association,
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
        size="sm"
        variant="ghost"
        onClick={() => onDetailsExpandedChange(!isDetailsExpanded)}
      >
        <Info aria-hidden="true" className="h-4 w-4" />
      </IconButton>
    </Tooltip>
  )
  const selection = (
    <BatchSelectionControl
      checked={isSelected === true}
      label={selectionLabel ?? presentation.title}
      onSelectionChange={onSelectionChange}
      disabledReason={selectionDisabledReason}
    />
  )
  const headerProps: KeyResourceCardHeaderRenderProps = {
    presentation,
    selection,
    detailsTrigger,
    actions,
    association: association ? (
      <KeyResourceCredentialAssociationControl association={association} />
    ) : undefined,
  }

  return (
    <Card
      id={targetId}
      data-testid={testId}
      data-navigation-target={isNavigationTarget ? "true" : undefined}
      tabIndex={targetId ? -1 : undefined}
      className={cn(
        isNavigationTarget &&
          "ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-900",
      )}
    >
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
