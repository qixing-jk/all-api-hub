import { ArrowRightLeft, Loader2, RefreshCcw } from "lucide-react"

import Tooltip from "~/components/Tooltip"
import {
  Badge,
  Button,
  CollapsibleSection,
  DestructiveConfirmDialog,
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
} from "./contracts"

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
    <ul className="max-w-sm list-disc space-y-1 pl-4 text-left">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

/** Renders one source-to-target comparison row in the migration preview. */
function PreviewComparisonRow({
  label,
  sourceValue,
  targetValue,
  missingValue,
}: {
  label: string
  sourceValue: string
  targetValue: string
  missingValue: string
}) {
  return (
    <div className="bg-border grid gap-px md:grid-cols-[minmax(0,120px)_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="bg-muted/50 px-3 py-2 text-[11px] font-medium uppercase">
        {label}
      </div>
      <div className="bg-background px-3 py-2 text-sm break-words">
        {sourceValue || missingValue}
      </div>
      <div className="bg-background px-3 py-2 text-sm break-words">
        {targetValue || missingValue}
      </div>
    </div>
  )
}

const SCROLLABLE_RESULT_LIST_CLASS =
  "max-h-[60vh] space-y-3 overflow-y-auto rounded-md border p-3 md:max-h-[min(70vh,48rem)]"

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
  const handleClose = () => {
    if (isRunning || isRecoveryRunning || refreshRequired) return
    callbacks.onClose()
  }
  const canStart = Boolean(
    preview && !preview.isLoading && !preview.error && preview.readyCount > 0,
  )

  const footer = result ? (
    <div className="flex items-center justify-between gap-3">
      <div className="text-muted-foreground text-sm">
        {labels.footerSummary}
      </div>
      <div className="flex items-center gap-2">
        {refreshRequired ? (
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
        <Button type="button" onClick={handleClose}>
          {labels.close}
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex items-center justify-between gap-3">
      <div className="text-muted-foreground text-sm">
        {labels.footerSummary}
      </div>
      <div className="flex items-center gap-2">
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
      </div>
    </div>
  )

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        closeOnBackdropClick={
          !isRunning && !isRecoveryRunning && !refreshRequired
        }
        closeOnEsc={!isRunning && !isRecoveryRunning && !refreshRequired}
        showCloseButton={!isRunning && !isRecoveryRunning && !refreshRequired}
        size="lg"
        header={
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="text-base font-semibold">{labels.title}</div>
              <Badge variant="warning" size="sm" className="shrink-0">
                {labels.beta}
              </Badge>
            </div>
            <div className="text-muted-foreground text-sm">
              {labels.description}
            </div>
          </div>
        }
        footer={footer}
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="space-y-2">
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
              leftIcon={<RefreshCcw className="h-4 w-4" />}
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

          <div className="grid gap-3 rounded-md border p-3 text-sm md:grid-cols-2">
            <div>
              <div className="text-muted-foreground text-xs uppercase">
                {labels.sourceLabel}
              </div>
              <div className="font-medium">
                {preview?.sourceLabel ?? labels.sourceLabel}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs uppercase">
                {labels.destinationLabel}
              </div>
              <div className="font-medium">
                {preview?.targetLabel ?? labels.unselectedTarget}
              </div>
            </div>
          </div>

          {refreshRequired && labels.refreshRequired ? (
            <div role="alert" className="rounded-md border p-3 text-sm">
              {labels.refreshRequired}
            </div>
          ) : null}
          {preview?.error ? (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
            >
              {preview.error}
            </div>
          ) : null}
          {!preview?.error && preview?.isLoading && !preview.isManualLoading ? (
            <div className="text-muted-foreground rounded-md border p-3 text-sm">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {labels.loadingPreview}
              </div>
            </div>
          ) : null}

          {!result && preview ? (
            <>
              {preview.generalWarnings.length ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">
                        {labels.generalWarningsTitle}
                      </div>
                      <div className="mt-1 text-xs">
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
                    className="space-y-2 rounded-md border p-3"
                  >
                    <CollapsibleSection
                      title={
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {row.name}
                            </div>
                            <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-2 text-xs">
                              <span>#{row.displayIdentifier}</span>
                              <span className="truncate">
                                {row.baseURL || labels.missingValue}
                              </span>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {row.warningText.length ? (
                              <Tooltip
                                content={
                                  <WarningTooltipContent
                                    items={row.warningText}
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
                      buttonClassName="px-0 py-0 hover:bg-transparent dark:hover:bg-transparent"
                      panelClassName="mt-3 space-y-3 border-0 bg-transparent p-0"
                    >
                      <div className="space-y-3">
                        <div className="overflow-hidden rounded-md border">
                          <div className="bg-border grid gap-px md:grid-cols-[minmax(0,120px)_minmax(0,1fr)_minmax(0,1fr)]">
                            <div className="bg-muted/50 px-3 py-2 text-[11px] font-medium uppercase">
                              {labels.fieldLabel}
                            </div>
                            <div className="bg-muted/50 px-3 py-2 text-xs font-medium">
                              {labels.sourceLabel}
                            </div>
                            <div className="bg-muted/50 px-3 py-2 text-xs font-medium">
                              {labels.destinationLabel}
                            </div>
                          </div>
                          {row.comparisons.map((comparison) => (
                            <PreviewComparisonRow
                              key={comparison.id}
                              label={comparison.label}
                              sourceValue={comparison.source}
                              targetValue={comparison.target}
                              missingValue={labels.missingValue}
                            />
                          ))}
                        </div>
                        {row.blockedReason ? (
                          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                            <div className="font-medium">
                              {row.blockedReason}
                            </div>
                            {row.blockedMessage ? (
                              <div className="mt-1">{row.blockedMessage}</div>
                            ) : null}
                          </div>
                        ) : null}
                        {row.warningText.length ? (
                          <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-xs">
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
            <div className="space-y-3">
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
                <div className="font-medium">{labels.resultsTitle}</div>
                <div className="mt-1">{result.summary}</div>
              </div>
              <div className={SCROLLABLE_RESULT_LIST_CLASS}>
                {result.items.map((item) => (
                  <div
                    key={item.rowKey}
                    className="space-y-2 rounded-md border p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {item.name}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          #{item.displayIdentifier}
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
                      <div className="text-muted-foreground text-xs">
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

      <DestructiveConfirmDialog
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
