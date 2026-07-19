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
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import type {
  ManagedSiteTokenBatchExportExecutionItem,
  ManagedSiteTokenBatchExportMatchedChannel,
  ManagedSiteTokenBatchExportPreviewItem,
} from "~/types/managedSiteTokenBatchExport"
import { isExecutableManagedSiteTokenBatchExportPreviewItem as isExecutablePreviewItem } from "~/types/managedSiteTokenBatchExport"

import {
  canEditItemModels,
  getPreviewItemVerificationCandidate,
} from "../managedSiteTokenBatchExportPreview"
import {
  formatBatchExportValues,
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
) => (result.success ? "success" : result.skipped ? "secondary" : "danger")

const getExecutionResultLabel = (
  t: TFunction,
  result: ManagedSiteTokenBatchExportExecutionItem,
) =>
  result.success
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
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Checkbox
            id={checkboxId}
            className="mt-0.5"
            checked={isSelected}
            aria-label={`${item.accountName} / ${item.runtimeKeyName}`}
            disabled={
              !isExecutablePreviewItem(item) || hasExecutionResult || isRunning
            }
            onCheckedChange={() => onToggleItem(item)}
            data-testid={
              KEY_MANAGEMENT_TEST_IDS.managedSiteBatchExportRowSelectCheckbox
            }
          />
          <label htmlFor={checkboxId} className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {item.accountName} / {item.runtimeKeyName}
            </span>
            <span className="text-muted-foreground block truncate text-xs">
              {item.draft?.name ?? "-"}
            </span>
          </label>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {result ? (
            <Badge variant={getExecutionResultVariant(result)} size="sm">
              {getExecutionResultLabel(t, result)}
            </Badge>
          ) : (
            <Badge variant={badge.variant} size="sm">
              {badge.label}
            </Badge>
          )}
          {verificationButton}
        </div>
      </div>

      <div className="grid gap-2 text-xs md:grid-cols-2">
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
            <div className="mt-1">
              <CompactMultiSelect
                options={modelOptions}
                selected={item.draft.models}
                onChange={(models) => onItemModelsChange(item, models)}
                size="default"
                placeholder={t("channelDialog:fields.models.placeholder")}
                aria-label={t(
                  "keyManagement:batchManagedSiteExport.fields.editModelsLabel",
                  {
                    name: `${item.accountName} / ${item.runtimeKeyName}`,
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
        <div className="text-muted-foreground dark:bg-dark-bg-tertiary rounded-md bg-gray-50 p-2 text-xs">
          {t("keyManagement:batchManagedSiteExport.messages.duplicate", {
            channel: item.matchedChannel.name,
          })}
        </div>
      ) : null}

      {item.warningCodes.length > 0 ? (
        <div className="space-y-2 rounded-md border border-amber-200/70 bg-amber-50/55 p-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
          <ul className="list-disc space-y-1 pl-4 leading-5">
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
        <div className="rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
          {getBatchExportBlockedReasonText(t, item.blockingReasonCode) ??
            t(
              "keyManagement:batchManagedSiteExport.blockedReasons.inputPreparationFailed",
            )}
          {item.blockingMessage ? `: ${item.blockingMessage}` : ""}
        </div>
      ) : null}

      {result?.error ? (
        <div className="rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
          {getBatchExportExecutionErrorText(t, result.error)}
        </div>
      ) : null}
    </div>
  )
}
