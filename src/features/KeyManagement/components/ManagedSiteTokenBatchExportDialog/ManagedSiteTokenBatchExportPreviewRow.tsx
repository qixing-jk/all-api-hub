import type { TFunction } from "i18next"
import { RefreshCcw } from "lucide-react"
import { useId } from "react"

import { ManagedSiteChannelAssessmentSignalsRow } from "~/components/ManagedSiteChannelAssessmentSignals"
import {
  Badge,
  Button,
  Checkbox,
  CompactMultiSelect,
  type CompactMultiSelectOption,
} from "~/components/ui"
import type { ManagedSiteType } from "~/constants/siteType"
import {
  getManagedSiteBatchExportRowSelectTestId,
  KEY_MANAGEMENT_TEST_IDS,
} from "~/features/KeyManagement/testIds"
import type {
  ManagedSiteTokenBatchExportExecutionItem,
  ManagedSiteTokenBatchExportMatchedChannel,
  ManagedSiteTokenBatchExportPreviewItem,
} from "~/types/managedSiteTokenBatchExport"
import {
  isExecutableManagedSiteTokenBatchExportPreviewItem as isExecutablePreviewItem,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS,
} from "~/types/managedSiteTokenBatchExport"

import {
  canEditItemModels,
  getPreviewItemVerificationCandidate,
} from "../managedSiteTokenBatchExportPreview"
import {
  formatBatchExportValues,
  getBatchExportBlockedDetailText,
  getBatchExportBlockedReasonText,
  getBatchExportExecutionErrorText,
  getBatchExportStatusBadge,
  getBatchExportWarningText,
} from "./batchExportDialogText"

interface ManagedSiteTokenBatchExportPreviewRowProps {
  t: TFunction
  item: ManagedSiteTokenBatchExportPreviewItem
  siteType: ManagedSiteType
  result?: ManagedSiteTokenBatchExportExecutionItem
  isNotSelected: boolean
  modelOptions: CompactMultiSelectOption[]
  isSelected: boolean
  hasExecutionResult: boolean
  isLoadingPreview: boolean
  isRunning: boolean
  verifyingItemId: string | null
  isVerificationDialogOpen: boolean
  onToggleItem: (item: ManagedSiteTokenBatchExportPreviewItem) => void
  onItemModelsChange: (
    item: ManagedSiteTokenBatchExportPreviewItem,
    models: string[],
  ) => void
  onVerifyAndRefresh: (
    item: ManagedSiteTokenBatchExportPreviewItem,
    candidate: ManagedSiteTokenBatchExportMatchedChannel,
  ) => void
}

const getExecutionResultVariant = (
  result: ManagedSiteTokenBatchExportExecutionItem,
) =>
  result.result === MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.UNCERTAIN
    ? "warning"
    : result.success
      ? "success"
      : result.skipped
        ? "secondary"
        : "danger"

const getExecutionResultLabel = (
  t: TFunction,
  result: ManagedSiteTokenBatchExportExecutionItem,
) =>
  result.result === MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.UNCERTAIN
    ? t("keyManagement:batchManagedSiteExport.results.status.uncertain")
    : result.success
      ? t("keyManagement:batchManagedSiteExport.results.status.success")
      : result.skipped
        ? t("keyManagement:batchManagedSiteExport.results.status.skipped")
        : t("keyManagement:batchManagedSiteExport.results.status.failed")

/**
 * Renders a single managed-site token batch export preview row.
 */
export function ManagedSiteTokenBatchExportPreviewRow({
  t,
  item,
  siteType,
  result,
  isNotSelected,
  modelOptions,
  isSelected,
  hasExecutionResult,
  isLoadingPreview,
  isRunning,
  verifyingItemId,
  isVerificationDialogOpen,
  onToggleItem,
  onItemModelsChange,
  onVerifyAndRefresh,
}: ManagedSiteTokenBatchExportPreviewRowProps) {
  const badge = getBatchExportStatusBadge(t, item)
  const checkboxId = useId()
  const verificationCandidate = getPreviewItemVerificationCandidate(
    item,
    siteType,
  )
  const isCurrentItemVerifying = verifyingItemId === item.id
  const runtimeKeyName =
    item.runtimeKeyName ||
    t("keyManagement:batchManagedSiteExport.fallbackLabels.createdKey")
  const blockingDetail = getBatchExportBlockedDetailText(
    t,
    item.blockingDetailCode,
  )

  const verificationButton = verificationCandidate ? (
    <Button
      type="button"
      size="sm"
      variant="outline"
      loading={isCurrentItemVerifying}
      leftIcon={<RefreshCcw className="h-4 w-4" />}
      disabled={
        isLoadingPreview ||
        isRunning ||
        hasExecutionResult ||
        isVerificationDialogOpen ||
        Boolean(verifyingItemId)
      }
      onClick={() => onVerifyAndRefresh(item, verificationCandidate)}
      data-testid={KEY_MANAGEMENT_TEST_IDS.managedSiteBatchExportVerifyButton}
    >
      {isCurrentItemVerifying
        ? t("keyManagement:batchManagedSiteExport.actions.verifying")
        : t("keyManagement:batchManagedSiteExport.actions.verifyAndRefresh")}
    </Button>
  ) : null

  return (
    <div className="space-y-density-2 py-density-3 rounded-md border px-3">
      <div className="gap-density-3 flex items-start justify-between">
        <div className="gap-density-2 flex min-w-0 items-start">
          <Checkbox
            id={checkboxId}
            className="mt-0.5"
            checked={isSelected}
            aria-label={`${item.accountName} / ${runtimeKeyName}`}
            disabled={
              !isExecutablePreviewItem(item) || hasExecutionResult || isRunning
            }
            onCheckedChange={() => onToggleItem(item)}
            data-testid={getManagedSiteBatchExportRowSelectTestId(item.id)}
          />
          <label htmlFor={checkboxId} className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {item.accountName} / {runtimeKeyName}
            </span>
            <span className="text-muted-foreground block truncate text-xs">
              {item.draft?.name ?? "-"}
            </span>
          </label>
        </div>
        <div className="gap-density-2 flex shrink-0 flex-wrap items-center justify-end">
          {result ? (
            <Badge variant={getExecutionResultVariant(result)} size="sm">
              {getExecutionResultLabel(t, result)}
            </Badge>
          ) : isNotSelected ? (
            <Badge variant="secondary" size="sm">
              {t(
                "keyManagement:batchManagedSiteExport.results.status.notSelected",
              )}
            </Badge>
          ) : (
            <Badge variant={badge.variant} size="sm">
              {badge.label}
            </Badge>
          )}
          {verificationButton}
        </div>
      </div>

      <div className="gap-density-2 grid text-xs md:grid-cols-2">
        <div>
          <span className="text-muted-foreground">
            {t("keyManagement:batchManagedSiteExport.fields.baseUrl")}
          </span>
          <span className="ml-2 break-all">{item.draft?.base_url || "-"}</span>
        </div>
        <div>
          <span className="text-muted-foreground">
            {t("keyManagement:batchManagedSiteExport.fields.groups")}
          </span>
          <span className="ml-2">
            {formatBatchExportValues(item.draft?.groups)}
          </span>
        </div>
        <div className="md:col-span-2">
          <span className="text-muted-foreground">
            {t("keyManagement:batchManagedSiteExport.fields.models")}
          </span>
          {item.draft && !hasExecutionResult && canEditItemModels(item) ? (
            <div className="mt-density-1">
              <CompactMultiSelect
                options={modelOptions}
                selected={item.draft.models}
                onChange={(models) => onItemModelsChange(item, models)}
                size="default"
                placeholder={t("channelDialog:fields.models.placeholder")}
                aria-label={t(
                  "keyManagement:batchManagedSiteExport.fields.editModelsLabel",
                  {
                    name: `${item.accountName} / ${runtimeKeyName}`,
                  },
                )}
                allowCustom
                disabled={isRunning}
              />
            </div>
          ) : (
            <span className="ml-2 break-words">
              {formatBatchExportValues(item.draft?.models)}
            </span>
          )}
        </div>
      </div>

      {item.matchedChannel ? (
        <div className="text-muted-foreground dark:bg-secondary bg-surface-subtle py-density-2 rounded-md px-2 text-xs">
          {t("keyManagement:batchManagedSiteExport.messages.duplicate", {
            channel: item.matchedChannel.name,
          })}
        </div>
      ) : null}

      {item.warningCodes.length > 0 ? (
        <div className="border-warning-border bg-warning-soft text-warning-soft-foreground space-y-density-2 py-density-2 rounded-md border px-2 text-xs">
          <ul className="space-y-density-1 list-disc pl-4 leading-5">
            {item.warningCodes.map((code) => (
              <li key={code}>{getBatchExportWarningText(t, code)}</li>
            ))}
          </ul>
          {item.assessment ? (
            <ManagedSiteChannelAssessmentSignalsRow
              assessment={item.assessment}
              managedSiteType={siteType}
            />
          ) : null}
        </div>
      ) : null}

      {item.blockingReasonCode ? (
        <div className="bg-destructive-soft text-destructive-soft-foreground py-density-2 rounded-md px-2 text-xs">
          {getBatchExportBlockedReasonText(t, item.blockingReasonCode) ??
            t(
              "keyManagement:batchManagedSiteExport.blockedReasons.inputPreparationFailed",
            )}
          {item.blockingMessage ? `: ${item.blockingMessage}` : ""}
          {blockingDetail ? `: ${blockingDetail}` : ""}
        </div>
      ) : null}

      {result?.error ? (
        <div className="bg-destructive-soft text-destructive-soft-foreground py-density-2 rounded-md px-2 text-xs">
          {getBatchExportExecutionErrorText(t, result.error)}
        </div>
      ) : null}
    </div>
  )
}
