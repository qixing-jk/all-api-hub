import { ArrowRightLeft, Loader2, RefreshCw } from "lucide-react"

import Tooltip from "~/components/Tooltip"
import {
  ActionGroup,
  Badge,
  Button,
  CollapsibleSection,
  ConfirmDialog,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import type {
  ManagedSiteMigrationCallbacks,
  ManagedSiteMigrationLabels,
  ManagedSiteMigrationPreviewState,
  ManagedSiteMigrationResult,
} from "~/features/ManagedSiteChannels/presentation/contracts"
import {
  getManagedSiteMigrationComparisonTargetTestId,
  MANAGED_SITE_CHANNELS_TEST_IDS,
} from "~/features/ManagedSiteChannels/testIds"

type ManagedSiteMigrationDialogViewProps = {
  isOpen: boolean
  selectedTarget: string
  targets: Array<{ value: string; label: string }>
  preview: ManagedSiteMigrationPreviewState | null
  result?: ManagedSiteMigrationResult | null
  labels: ManagedSiteMigrationLabels
  isConfirmationOpen: boolean
  isRunning?: boolean
  isRecoveryRunning?: boolean
  refreshRequired?: boolean
  callbacks: ManagedSiteMigrationCallbacks
}

/** Renders controlled migration warnings inside the shared tooltip. */
function WarningTooltipContent({ items }: { items: string[] }) {
  return (
    <ul className="max-w-sm list-disc space-y-density-1 pl-4 text-left">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

/** Renders one source-to-target comparison row in the migration preview. */
function PreviewComparisonRow({
  fieldId,
  label,
  sourceValue,
  targetValue,
  missingValue,
}: {
  fieldId: string
  label: string
  sourceValue: string
  targetValue: string
  missingValue: string
}) {
  return (
    <div className="grid gap-px bg-border md:grid-cols-[minmax(0,120px)_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="bg-muted/50 px-3 py-density-2 text-2xs font-medium uppercase">
        {label}
      </div>
      <div className="bg-background px-3 py-density-2 text-sm break-words">
        {sourceValue || missingValue}
      </div>
      <div
        data-testid={getManagedSiteMigrationComparisonTargetTestId(fieldId)}
        className="bg-background px-3 py-density-2 text-sm break-words"
      >
        {targetValue || missingValue}
      </div>
    </div>
  )
}

const SCROLLABLE_RESULT_LIST_CLASS =
  "max-h-[60vh] space-y-density-3 overflow-y-auto rounded-md border px-3 py-density-3 md:max-h-[min(70vh,48rem)]"

/** Renders the shared migration preview, confirmation, and result workflow. */
export function ManagedSiteMigrationDialogView({
  isOpen,
  selectedTarget,
  targets,
  preview,
  result,
  labels,
  isConfirmationOpen,
  isRunning = false,
  isRecoveryRunning = false,
  refreshRequired = false,
  callbacks,
}: ManagedSiteMigrationDialogViewProps) {
  const requiresRefresh = refreshRequired || result?.refreshRequired === true
  const handleClose = () => {
    if (isRunning || isRecoveryRunning || requiresRefresh) return
    callbacks.onClose()
  }
  const canStart = Boolean(
    preview && !preview.isLoading && !preview.error && preview.readyCount > 0,
  )

  const footer = result ? (
    <div className="flex flex-col items-stretch gap-x-3 gap-y-density-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-muted-foreground">
        {labels.footerSummary}
      </div>
      <ActionGroup className="w-full sm:w-auto">
        {requiresRefresh ? (
          <Button
            type="button"
            variant="outline"
            onClick={callbacks.onRecoverRefreshRequired}
            loading={isRecoveryRunning}
            disabled={isRecoveryRunning}
          >
            {labels.refreshRequiredAction ?? labels.refreshPreview}
          </Button>
        ) : null}
        <Button
          type="button"
          onClick={handleClose}
          disabled={isRunning || isRecoveryRunning || requiresRefresh}
        >
          {labels.close}
        </Button>
      </ActionGroup>
    </div>
  ) : (
    <div className="flex flex-col items-stretch gap-x-3 gap-y-density-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-muted-foreground">
        {labels.footerSummary}
      </div>
      <ActionGroup className="w-full sm:w-auto">
        <Button
          type="button"
          variant="outline"
          onClick={handleClose}
          disabled={isRunning}
        >
          {labels.cancel}
        </Button>
        <Button
          type="button"
          leftIcon={<ArrowRightLeft className="h-4 w-4" />}
          loading={isRunning}
          disabled={!canStart}
          onClick={callbacks.onOpenConfirmation}
        >
          {isRunning ? labels.running : labels.start}
        </Button>
      </ActionGroup>
    </div>
  )

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        closeOnBackdropClick={
          !isRunning && !isRecoveryRunning && !requiresRefresh
        }
        closeOnEsc={!isRunning && !isRecoveryRunning && !requiresRefresh}
        showCloseButton={!isRunning && !isRecoveryRunning && !requiresRefresh}
        size="lg"
        header={
          <div className="space-y-density-1">
            <div className="flex items-center gap-x-2 gap-y-density-2">
              <div className="text-base font-semibold">{labels.title}</div>
              <Badge variant="warning" size="sm" className="shrink-0">
                {labels.beta}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              {labels.description}
            </div>
          </div>
        }
        footer={footer}
      >
        <div className="space-y-density-4">
          <div
            data-testid={MANAGED_SITE_CHANNELS_TEST_IDS.migrationControls}
            className="grid gap-x-3 gap-y-density-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
          >
            <div className="space-y-density-2">
              <div className="text-sm font-medium">{labels.targetLabel}</div>
              <Select
                value={selectedTarget}
                onValueChange={callbacks.onTargetChange}
                disabled={
                  isRunning ||
                  Boolean(result) ||
                  Boolean(preview?.isLoading) ||
                  !targets.length
                }
              >
                <SelectTrigger aria-label={labels.targetLabel}>
                  <SelectValue placeholder={labels.targetPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((target) => (
                    <SelectItem key={target.value} value={target.value}>
                      {target.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              leftIcon={<RefreshCw className="h-4 w-4" />}
              loading={Boolean(preview?.isManualLoading)}
              disabled={
                !selectedTarget ||
                Boolean(preview?.isLoading) ||
                isRunning ||
                Boolean(result)
              }
              onClick={callbacks.onRefreshPreview}
            >
              {preview?.isManualLoading
                ? labels.loadingPreview
                : labels.refreshPreview}
            </Button>
          </div>

          <div className="grid gap-x-3 gap-y-density-3 rounded-md border px-3 py-density-3 text-sm md:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground uppercase">
                {labels.sourceLabel}
              </div>
              <div className="font-medium">
                {preview?.sourceLabel ?? labels.sourceLabel}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase">
                {labels.destinationLabel}
              </div>
              <div className="font-medium">
                {preview?.targetLabel ?? labels.unselectedTarget}
              </div>
            </div>
          </div>

          {requiresRefresh && labels.refreshRequired ? (
            <div
              role="alert"
              className="rounded-md border px-3 py-density-3 text-sm"
            >
              {labels.refreshRequired}
            </div>
          ) : null}
          {preview?.error ? (
            <div
              role="alert"
              className="rounded-md border border-destructive-border bg-destructive-soft px-3 py-density-3 text-sm text-destructive-soft-foreground"
            >
              {preview.error}
            </div>
          ) : null}
          {!preview?.error && preview?.isLoading && !preview.isManualLoading ? (
            <div className="rounded-md border px-3 py-density-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-x-2 gap-y-density-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {labels.loadingPreview}
              </div>
            </div>
          ) : null}

          {!result && preview ? (
            <>
              {preview.generalWarnings.length ? (
                <div className="rounded-md border border-warning-border bg-warning-soft px-3 py-density-3 text-sm text-warning-soft-foreground">
                  <div className="flex items-center justify-between gap-x-3 gap-y-density-3">
                    <div className="min-w-0">
                      <div className="font-medium">
                        {labels.generalWarningsTitle}
                      </div>
                      <div className="mt-density-1 text-xs">
                        {labels.generalWarningsSummary}
                      </div>
                    </div>
                    <Tooltip
                      content={
                        <WarningTooltipContent
                          items={preview.generalWarnings}
                        />
                      }
                      position="left"
                      wrapperClassName="inline-flex"
                    >
                      <Badge
                        variant="secondary"
                        size="sm"
                        className="cursor-help whitespace-nowrap"
                      >
                        {preview.generalWarnings.length} {labels.limitsLabel}
                      </Badge>
                    </Tooltip>
                  </div>
                </div>
              ) : null}

              <div className={SCROLLABLE_RESULT_LIST_CLASS}>
                {preview.rows.map((row) => (
                  <div
                    key={row.rowKey}
                    className="space-y-density-2 rounded-md border px-3 py-density-3"
                  >
                    <CollapsibleSection
                      title={
                        <div className="flex min-w-0 items-start justify-between gap-x-3 gap-y-density-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {row.name}
                            </div>
                            <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-density-2 text-xs text-muted-foreground">
                              <span className="truncate">
                                {row.baseURL || labels.missingValue}
                              </span>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-x-2 gap-y-density-2">
                            {row.warningText.length ? (
                              <Tooltip
                                content={
                                  <WarningTooltipContent
                                    items={row.warningText}
                                  />
                                }
                                position="left"
                                // Keep the first hover placement in the same coordinate
                                // system so the popup cannot cover the pending row click.
                                positionStrategy="fixed"
                                wrapperClassName="inline-flex"
                              >
                                <Badge
                                  variant="secondary"
                                  size="sm"
                                  className="cursor-help whitespace-nowrap"
                                >
                                  {row.warningText.length}{" "}
                                  {labels.warningsLabel}
                                </Badge>
                              </Tooltip>
                            ) : null}
                            <Badge
                              variant={
                                row.status === "ready" ? "success" : "warning"
                              }
                              size="sm"
                            >
                              {row.status === "ready"
                                ? labels.ready
                                : labels.blocked}
                            </Badge>
                          </div>
                        </div>
                      }
                      defaultOpen={row.status === "blocked"}
                      buttonClassName="px-0 py-0 hover:bg-transparent"
                      panelClassName="mt-density-3 space-y-density-3 border-0 bg-transparent p-0"
                    >
                      <div className="space-y-density-3">
                        <div
                          data-testid={
                            MANAGED_SITE_CHANNELS_TEST_IDS.migrationComparison
                          }
                          className="overflow-hidden rounded-md border"
                        >
                          <div className="grid gap-px bg-border md:grid-cols-[minmax(0,120px)_minmax(0,1fr)_minmax(0,1fr)]">
                            <div className="bg-muted/50 px-3 py-density-2 text-2xs font-medium uppercase">
                              {labels.fieldLabel}
                            </div>
                            <div className="bg-muted/50 px-3 py-density-2 text-xs font-medium">
                              {labels.sourceLabel}
                            </div>
                            <div className="bg-muted/50 px-3 py-density-2 text-xs font-medium">
                              {labels.destinationLabel}
                            </div>
                          </div>
                          {row.comparisons.map((comparison) => (
                            <PreviewComparisonRow
                              key={comparison.id}
                              fieldId={comparison.id}
                              label={comparison.label}
                              sourceValue={comparison.source}
                              targetValue={comparison.target}
                              missingValue={labels.missingValue}
                            />
                          ))}
                        </div>
                        {row.blockedReason ? (
                          <div className="rounded-md border border-warning-border bg-warning-soft px-2 py-density-2 text-xs text-warning-soft-foreground">
                            <div className="font-medium">
                              {row.blockedReason}
                            </div>
                            {row.blockedMessage ? (
                              <div className="mt-density-1">
                                {row.blockedMessage}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {row.warningText.length ? (
                          <ul className="list-disc space-y-density-1 pl-5 text-xs text-muted-foreground">
                            {row.warningText.map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </CollapsibleSection>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {result ? (
            <div className="space-y-density-3">
              <div className="rounded-md border border-info-border bg-info-soft px-3 py-density-3 text-sm text-info-soft-foreground">
                <div className="font-medium">{labels.resultsTitle}</div>
                <div className="mt-density-1">{result.summary}</div>
              </div>
              <div className={SCROLLABLE_RESULT_LIST_CLASS}>
                {result.items.map((item) => (
                  <div
                    key={item.rowKey}
                    className="space-y-density-2 rounded-md border px-3 py-density-3"
                  >
                    <div className="flex items-start justify-between gap-x-3 gap-y-density-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {item.name}
                        </div>
                      </div>
                      <Badge
                        variant={
                          item.status === "success"
                            ? "success"
                            : item.status === "failed"
                              ? "danger"
                              : "secondary"
                        }
                        size="sm"
                      >
                        {item.statusLabel}
                      </Badge>
                    </div>
                    {item.message ? (
                      <div className="text-xs text-muted-foreground">
                        {item.message}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </Modal>

      <ConfirmDialog
        intent="confirm"
        icon={ArrowRightLeft}
        isOpen={isConfirmationOpen}
        onClose={callbacks.onCloseConfirmation}
        title={labels.confirmationTitle}
        description={labels.confirmationDescription}
        warningTitle={labels.confirmationWarningTitle}
        cancelLabel={labels.cancel}
        confirmLabel={labels.confirmationConfirm}
        workingLabel={labels.running}
        onConfirm={callbacks.onConfirm}
        isWorking={isRunning}
      />
    </>
  )
}
