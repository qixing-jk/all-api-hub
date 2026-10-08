import type { TFunction } from "i18next"
import type { HTMLAttributes } from "react"
import { forwardRef, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Virtuoso } from "react-virtuoso"

import { formatLatency } from "~/components/dialogs/VerifyApiDialog/utils"
import { VerificationModeSelect } from "~/components/dialogs/VerifyApiDialog/VerificationMode"
import {
  ActionGroup,
  Alert,
  Badge,
  Button,
  Checkbox,
  Heading5,
  Modal,
  SearchableSelect,
} from "~/components/ui"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { formatModelListSourceLabel } from "~/features/ModelList/catalog/sourceLabels"
import {
  getBatchVerifyModelCheckboxTestId,
  getBatchVerifyRowTestId,
} from "~/features/ModelList/testIds"
import {
  MODEL_LIST_BATCH_VERIFY_API_TYPE_MODES,
  type BatchVerifyApiTypeMode,
  type BatchVerifyModelItem,
} from "~/features/ModelList/verification/batchVerification"
import {
  BATCH_VERIFY_ROW_STATUSES,
  BATCH_VERIFY_ROW_SUMMARIES,
  type BatchVerifyRow,
  type BatchVerifyRowStatus,
} from "~/features/ModelList/verification/batchVerificationState"
import { cn } from "~/lib/utils"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import {
  API_TYPES,
  API_VERIFICATION_PROBE_STATUSES,
  getApiVerificationProbeDefinitions,
  type ApiVerificationProbeId,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import {
  getApiVerificationApiTypeLabel,
  getApiVerificationModeLabel,
  getApiVerificationProbeLabel,
} from "~/services/verification/aiApiVerification/i18n"

import { useBatchVerifyModels } from "../hooks/useBatchVerifyModels"

/** Resolve a failed probe row to localized, stable user-facing feedback. */
function resolveFailureSummaryText(
  t: TFunction,
  result: ApiVerificationProbeResult,
) {
  const fallback =
    result.summary.trim() || t("modelList:batchVerify.messages.unexpected")

  if (!result.summaryKey) {
    return fallback
  }

  return t(`aiApiVerification:${result.summaryKey}`, {
    ...(result.summaryParams ?? {}),
    defaultValue: fallback,
  })
}

/** Translate the current row outcome without changing or replaying its probes. */
function getRowSummary(t: TFunction, row: BatchVerifyRow): string {
  switch (row.summary) {
    case BATCH_VERIFY_ROW_SUMMARIES.Pending:
      return t("modelList:batchVerify.messages.pending")
    case BATCH_VERIFY_ROW_SUMMARIES.Running:
      return t("modelList:batchVerify.status.running")
    case BATCH_VERIFY_ROW_SUMMARIES.NoKey:
      return t("modelList:batchVerify.messages.noCompatibleRuntimeKey")
    case BATCH_VERIFY_ROW_SUMMARIES.NoProbes:
      return t("modelList:batchVerify.messages.noApplicableProbes")
    case BATCH_VERIFY_ROW_SUMMARIES.Stopped:
      return t("modelList:batchVerify.messages.stopped")
    case BATCH_VERIFY_ROW_SUMMARIES.NotSelected:
      return t("modelList:batchVerify.messages.notSelected")
    case BATCH_VERIFY_ROW_SUMMARIES.Failed:
      return row.results[0]
        ? resolveFailureSummaryText(t, row.results[0])
        : t("modelList:batchVerify.messages.unexpected")
    case BATCH_VERIFY_ROW_SUMMARIES.Results:
      return t("modelList:batchVerify.messages.probeSummary", {
        count: row.results.length,
        pass: row.results.filter(
          (result) => result.status === API_VERIFICATION_PROBE_STATUSES.Pass,
        ).length,
        fail: row.results.filter(
          (result) => result.status === API_VERIFICATION_PROBE_STATUSES.Fail,
        ).length,
        unsupported: row.results.filter(
          (result) =>
            result.status === API_VERIFICATION_PROBE_STATUSES.Unsupported,
        ).length,
      })
    default:
      return row.summary
  }
}

/** Cap the batch row list to half the viewport while preserving a test-safe fallback. */
function getBatchVerifyListMaxHeight() {
  return typeof window === "undefined" ? 360 : window.innerHeight * 0.5
}

const BatchVerifyRowsList = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function BatchVerifyRowsList({ children, className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn("min-w-0 overflow-x-hidden", className)}
      {...props}
    >
      {children}
    </div>
  )
})

const BatchVerifyRowsItem = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function BatchVerifyRowsItem({ children, className, ...props }, ref) {
  return (
    <div ref={ref} className={cn("py-density-2 px-2", className)} {...props}>
      {children}
    </div>
  )
})

type BatchVerifyModelsDialogProps = {
  isOpen: boolean
  onClose: () => void
  items: BatchVerifyModelItem[]
}
/**
 * Dialog for running a New API-style batch model availability test over the
 * currently filtered model list snapshot.
 */
export function BatchVerifyModelsDialog({
  isOpen,
  onClose,
  items,
}: BatchVerifyModelsDialogProps) {
  const { t } = useTranslation(["modelList", "aiApiVerification"])
  const {
    rows,
    selectedModelKeys,
    verificationMode,
    setVerificationMode,
    apiTypeMode,
    setApiTypeMode,
    selectedProbeIds,
    selectedModelKeySet,
    isRunning,
    hasStarted,
    summary,
    canClose,
    canStart,
    areAllModelsSelected,
    toggleProbe,
    toggleModel,
    selectAllModels,
    clearSelectedModels,
    runBatch,
    stopBatch,
  } = useBatchVerifyModels({ isOpen, items })
  const [listHeight, setListHeight] = useState(0)
  useEffect(() => {
    if (!hasStarted) setListHeight(0)
  }, [rows, hasStarted])
  const apiTypeOptions = useMemo(
    () => [
      {
        value: MODEL_LIST_BATCH_VERIFY_API_TYPE_MODES.AUTO,
        label: t("modelList:batchVerify.apiType.auto"),
      },
      {
        value: API_TYPES.OPENAI_COMPATIBLE,
        label: getApiVerificationApiTypeLabel(t, API_TYPES.OPENAI_COMPATIBLE),
      },
      {
        value: API_TYPES.OPENAI,
        label: getApiVerificationApiTypeLabel(t, API_TYPES.OPENAI),
      },
      {
        value: API_TYPES.ANTHROPIC,
        label: getApiVerificationApiTypeLabel(t, API_TYPES.ANTHROPIC),
      },
      {
        value: API_TYPES.GOOGLE,
        label: getApiVerificationApiTypeLabel(t, API_TYPES.GOOGLE),
      },
    ],
    [t],
  )

  const probeOptions = useMemo(() => {
    const seenProbeIds = new Set<ApiVerificationProbeId>()
    return Object.values(API_TYPES).flatMap((apiType) =>
      getApiVerificationProbeDefinitions(apiType).flatMap((probe) => {
        if (seenProbeIds.has(probe.id)) return []
        seenProbeIds.add(probe.id)
        return [
          {
            id: probe.id,
            label: getApiVerificationProbeLabel(t, probe.id),
          },
        ]
      }),
    )
  }, [t])

  const statusVariant = (status: BatchVerifyRowStatus) => {
    if (status === BATCH_VERIFY_ROW_STATUSES.PASS) return "success"
    if (status === BATCH_VERIFY_ROW_STATUSES.FAIL) return "danger"
    if (status === BATCH_VERIFY_ROW_STATUSES.SKIPPED) return "secondary"
    if (status === BATCH_VERIFY_ROW_STATUSES.RUNNING) return "info"
    return "outline"
  }

  const renderRow = (row: BatchVerifyRow) => {
    const sourceLabel = formatModelListSourceLabel(
      row.item.source,
      {
        formatProfileLabel: ({ name, host }) =>
          t("modelList:sourceLabels.profileBadge", { name, host }),
        formatProviderCatalogLabel: ({ providerName }) =>
          t("modelList:sourceLabels.providerCatalogBadge", {
            provider: providerName,
          }),
        formatPersonalizedCatalogLabel: ({ accountName }) =>
          t("modelList:sourceLabels.personalizedCatalogBadge", {
            account: accountName,
          }),
      },
      row.item.sourceIdentity,
    )

    return (
      <div
        data-testid={getBatchVerifyRowTestId(row.item.key)}
        className="dark:border-border border-border-subtle py-density-3 rounded-md border px-3"
      >
        <div className="gap-y-density-3 flex items-start justify-between gap-x-3">
          <Checkbox
            checked={selectedModelKeySet.has(row.item.key)}
            onCheckedChange={() => toggleModel(row.item.key)}
            disabled={isRunning}
            aria-label={t("modelList:batchVerify.modelSelection.toggle", {
              model: row.item.modelId,
            })}
            data-testid={getBatchVerifyModelCheckboxTestId(row.item.key)}
            className="mt-0.5"
          />
          <div className="min-w-0 flex-1">
            <div className="gap-y-density-2 flex min-w-0 flex-wrap items-center gap-x-2">
              <div className="text-foreground min-w-0 truncate text-sm font-medium">
                {row.item.modelId}
              </div>
              <Badge
                variant="outline"
                size="sm"
                className="max-w-full min-w-0"
                title={sourceLabel.title ?? sourceLabel.label}
              >
                <span className="min-w-0 truncate">{sourceLabel.label}</span>
              </Badge>
              <Badge variant={statusVariant(row.status)} size="sm">
                {row.status === BATCH_VERIFY_ROW_STATUSES.PASS
                  ? t("modelList:batchVerify.status.pass")
                  : row.status === BATCH_VERIFY_ROW_STATUSES.FAIL
                    ? t("modelList:batchVerify.status.fail")
                    : row.status === BATCH_VERIFY_ROW_STATUSES.SKIPPED
                      ? t("modelList:batchVerify.status.skipped")
                      : row.status === BATCH_VERIFY_ROW_STATUSES.RUNNING
                        ? t("modelList:batchVerify.status.running")
                        : t("modelList:batchVerify.status.pending")}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {formatLatency(row.latencyMs)}
              </span>
            </div>
            <div className="dark:text-secondary-foreground text-muted-foreground mt-density-1 text-xs">
              {getRowSummary(t, row)}
            </div>
            {row.runtimeKeyName ? (
              <div className="text-muted-foreground mt-density-1 text-xs">
                {t("modelList:batchVerify.runtimeKeyUsed", {
                  name: row.runtimeKeyName,
                })}
              </div>
            ) : null}
            {row.results.length > 0 ? (
              <div className="mt-density-2 space-y-density-1-5">
                <div className="gap-y-density-1-5 flex flex-wrap gap-x-1.5">
                  {row.results.map((result) => (
                    <Badge
                      key={result.id}
                      variant={statusVariant(
                        result.status ===
                          API_VERIFICATION_PROBE_STATUSES.Unsupported
                          ? BATCH_VERIFY_ROW_STATUSES.SKIPPED
                          : result.status,
                      )}
                      size="sm"
                    >
                      {getApiVerificationProbeLabel(t, result.id)}
                      {result.mode ? (
                        <>
                          {" · "}
                          {getApiVerificationModeLabel(t, result.mode)}
                        </>
                      ) : null}
                      {" · "}
                      {result.status === API_VERIFICATION_PROBE_STATUSES.Pass
                        ? t("modelList:batchVerify.status.pass")
                        : result.status === API_VERIFICATION_PROBE_STATUSES.Fail
                          ? t("modelList:batchVerify.status.fail")
                          : t(
                              "aiApiVerification:verifyDialog.status.unsupported",
                            )}
                      {" · "}
                      {formatLatency(result.latencyMs)}
                    </Badge>
                  ))}
                </div>
                {row.results
                  .filter(
                    (result) =>
                      result.status === API_VERIFICATION_PROBE_STATUSES.Fail,
                  )
                  .map((result) => (
                    <div
                      key={`${result.id}-summary`}
                      className="text-destructive-text text-xs break-words"
                    >
                      {resolveFailureSummaryText(t, result)}
                    </div>
                  ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  const header = (
    <div className="min-w-0">
      <Heading5 className="truncate">
        {t("modelList:batchVerify.title")}
      </Heading5>
      <div className="text-muted-foreground mt-density-1 truncate text-xs">
        {t("modelList:batchVerify.subtitle", { count: items.length })}
      </div>
    </div>
  )

  const footer = (
    <ProductAnalyticsScope
      entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
      featureId={PRODUCT_ANALYTICS_FEATURE_IDS.ModelList}
      surfaceId={
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListBatchVerifyDialog
      }
    >
      <div className="gap-y-density-2 flex flex-col gap-x-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-muted-foreground text-xs">
          {hasStarted
            ? t("modelList:batchVerify.summary", {
                ...summary,
                count: summary.total,
              })
            : t("modelList:batchVerify.idleHint")}
        </div>
        <ActionGroup>
          <Button variant="secondary" onClick={onClose} disabled={!canClose}>
            {t("aiApiVerification:verifyDialog.actions.close")}
          </Button>
          {isRunning ? (
            <Button
              variant="secondary"
              onClick={stopBatch}
              analyticsAction={
                PRODUCT_ANALYTICS_ACTION_IDS.StopBatchModelVerify
              }
            >
              {t("modelList:batchVerify.actions.stop")}
            </Button>
          ) : (
            <Button onClick={runBatch} disabled={!canStart}>
              {hasStarted
                ? t("modelList:batchVerify.actions.rerun")
                : t("modelList:batchVerify.actions.start")}
            </Button>
          )}
        </ActionGroup>
      </div>
    </ProductAnalyticsScope>
  )
  const listMaxHeight = getBatchVerifyListMaxHeight()
  const listContainerHeight = Math.min(
    listHeight || listMaxHeight,
    listMaxHeight,
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={canClose ? onClose : () => {}}
      header={header}
      footer={footer}
      size="lg"
      closeOnEsc={canClose}
      closeOnBackdropClick={canClose}
    >
      <ProductAnalyticsScope
        entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
        featureId={PRODUCT_ANALYTICS_FEATURE_IDS.ModelList}
        surfaceId={
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListBatchVerifyDialog
        }
      >
        <div className="space-y-density-4">
          <div className="gap-y-density-3 grid gap-x-3 sm:grid-cols-2">
            <div className="space-y-density-1-5">
              <div className="text-muted-foreground text-xs">
                {t("modelList:batchVerify.apiType.label")}
              </div>
              <SearchableSelect
                aria-label={t("modelList:batchVerify.apiType.label")}
                options={apiTypeOptions}
                value={apiTypeMode}
                onChange={(value) =>
                  setApiTypeMode(value as BatchVerifyApiTypeMode)
                }
                disabled={isRunning}
              />
            </div>

            <VerificationModeSelect
              value={verificationMode}
              onChange={setVerificationMode}
              disabled={isRunning}
            />

            <div className="gap-y-density-2 flex flex-wrap items-end gap-x-2 sm:col-span-2 sm:justify-end">
              <Badge variant="secondary">
                {t("modelList:batchVerify.counts.total", {
                  value: summary.total,
                })}
              </Badge>
              <Badge variant="success">
                {t("modelList:batchVerify.counts.pass", {
                  value: summary.pass,
                })}
              </Badge>
              <Badge variant="danger">
                {t("modelList:batchVerify.counts.fail", {
                  value: summary.fail,
                })}
              </Badge>
              <Badge variant="secondary">
                {t("modelList:batchVerify.counts.skipped", {
                  value: summary.skipped,
                })}
              </Badge>
            </div>
          </div>

          <div className="space-y-density-2">
            <div className="text-muted-foreground text-xs">
              {t("modelList:batchVerify.probes.label")}
            </div>
            <div className="gap-y-density-2 flex flex-wrap gap-x-2">
              {probeOptions.map((probe) => (
                <label
                  key={probe.id}
                  className="dark:border-border border-border-subtle gap-y-density-2 py-density-1-5 flex cursor-pointer items-center gap-x-2 rounded-md border px-2 text-xs"
                >
                  <Checkbox
                    checked={selectedProbeIds.includes(probe.id)}
                    onCheckedChange={() => toggleProbe(probe.id)}
                    disabled={isRunning}
                  />
                  <span>{probe.label}</span>
                </label>
              ))}
            </div>
            {selectedProbeIds.length === 0 ? (
              <div className="text-destructive-text text-xs">
                {t("modelList:batchVerify.probes.noneSelected")}
              </div>
            ) : null}
          </div>

          <div className="space-y-density-2">
            <div className="gap-y-density-2 flex flex-wrap items-center justify-between gap-x-2">
              <div className="text-muted-foreground text-xs">
                {t("modelList:batchVerify.modelSelection.label")}
              </div>
              <div className="gap-y-density-2 flex items-center gap-x-2">
                <span className="text-muted-foreground text-xs">
                  {t("modelList:batchVerify.modelSelection.selectedSummary", {
                    count: selectedModelKeys.length,
                    selected: selectedModelKeys.length,
                    total: items.length,
                  })}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={
                    areAllModelsSelected ? clearSelectedModels : selectAllModels
                  }
                  disabled={isRunning || items.length === 0}
                  analyticsAction={
                    PRODUCT_ANALYTICS_ACTION_IDS.ToggleBatchModelSelection
                  }
                >
                  {areAllModelsSelected
                    ? t("modelList:batchVerify.modelSelection.clearAll")
                    : t("modelList:batchVerify.modelSelection.selectAll")}
                </Button>
              </div>
            </div>
            {selectedModelKeys.length === 0 ? (
              <div className="text-destructive-text text-xs">
                {t("modelList:batchVerify.modelSelection.noneSelected")}
              </div>
            ) : null}
          </div>

          <Alert variant="warning">
            <p>{t("modelList:batchVerify.warning")}</p>
          </Alert>

          <div
            className="dark:border-border border-border-subtle overflow-hidden rounded-md border"
            style={{ height: listContainerHeight }}
          >
            <Virtuoso
              className="h-full"
              data={rows}
              computeItemKey={(_, row) => row.item.key}
              components={{
                Item: BatchVerifyRowsItem,
                List: BatchVerifyRowsList,
              }}
              totalListHeightChanged={setListHeight}
              style={{ height: "100%" }}
              itemContent={(_, row) => renderRow(row)}
            />
          </div>
        </div>
      </ProductAnalyticsScope>
    </Modal>
  )
}
