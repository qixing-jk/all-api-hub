import type { TFunction } from "i18next"
import { Loader2, RefreshCcw, SendToBack } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import {
  Badge,
  Button,
  Checkbox,
  DestructiveConfirmDialog,
  Modal,
} from "~/components/ui"
import {
  executeManagedSiteTokenBatchExport,
  prepareManagedSiteTokenBatchExportPreview,
} from "~/services/managedSites/tokenBatchExport"
import { getManagedSiteLabel } from "~/services/managedSites/utils/managedSite"
import type {
  ManagedSiteTokenBatchExportExecutionResult,
  ManagedSiteTokenBatchExportItemInput,
  ManagedSiteTokenBatchExportPreview,
  ManagedSiteTokenBatchExportPreviewItem,
} from "~/types/managedSiteTokenBatchExport"
import {
  MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES,
} from "~/types/managedSiteTokenBatchExport"
import { getErrorMessage } from "~/utils/core/error"

interface ManagedSiteTokenBatchExportDialogProps {
  isOpen: boolean
  onClose: () => void
  items: ManagedSiteTokenBatchExportItemInput[]
  onCompleted?: (result: ManagedSiteTokenBatchExportExecutionResult) => void
}

const isExecutablePreviewItem = (
  item: ManagedSiteTokenBatchExportPreviewItem,
) =>
  Boolean(item.draft) &&
  (item.status === MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY ||
    item.status === MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING)

const formatValues = (items: string[] | undefined) =>
  items && items.length > 0 ? items.join(", ") : "-"

const getWarningText = (t: TFunction, code: string) => {
  switch (code) {
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.MODEL_PREFILL_FAILED:
      return t(
        "keyManagement:batchManagedSiteExport.warnings.modelPrefillFailed",
      )
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.MATCH_REQUIRES_CONFIRMATION:
      return t(
        "keyManagement:batchManagedSiteExport.warnings.matchRequiresConfirmation",
      )
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.EXACT_VERIFICATION_UNAVAILABLE:
      return t(
        "keyManagement:batchManagedSiteExport.warnings.exactVerificationUnavailable",
      )
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.BACKEND_SEARCH_FAILED:
      return t(
        "keyManagement:batchManagedSiteExport.warnings.backendSearchFailed",
      )
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.DEDUPE_UNSUPPORTED:
    default:
      return t(
        "keyManagement:batchManagedSiteExport.warnings.dedupeUnsupported",
      )
  }
}

const getBlockedReasonText = (t: TFunction, code?: string) => {
  switch (code) {
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.CONFIG_MISSING:
      return t(
        "keyManagement:batchManagedSiteExport.blockedReasons.configMissing",
      )
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.SECRET_RESOLUTION_FAILED:
      return t(
        "keyManagement:batchManagedSiteExport.blockedReasons.secretResolutionFailed",
      )
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.NAME_REQUIRED:
      return t(
        "keyManagement:batchManagedSiteExport.blockedReasons.nameRequired",
      )
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.KEY_REQUIRED:
      return t(
        "keyManagement:batchManagedSiteExport.blockedReasons.keyRequired",
      )
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.REAL_KEY_REQUIRED:
      return t(
        "keyManagement:batchManagedSiteExport.blockedReasons.realKeyRequired",
      )
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.BASE_URL_REQUIRED:
      return t(
        "keyManagement:batchManagedSiteExport.blockedReasons.baseUrlRequired",
      )
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.MODELS_REQUIRED:
      return t(
        "keyManagement:batchManagedSiteExport.blockedReasons.modelsRequired",
      )
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.INPUT_PREPARATION_FAILED:
    default:
      return t(
        "keyManagement:batchManagedSiteExport.blockedReasons.inputPreparationFailed",
      )
  }
}

const getStatusBadge = (
  t: TFunction,
  item: ManagedSiteTokenBatchExportPreviewItem,
) => {
  switch (item.status) {
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY:
      return {
        label: t("keyManagement:batchManagedSiteExport.status.ready"),
        variant: "success" as const,
      }
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING:
      return {
        label: t("keyManagement:batchManagedSiteExport.status.warning"),
        variant: "warning" as const,
      }
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.SKIPPED:
      return {
        label: t("keyManagement:batchManagedSiteExport.status.skipped"),
        variant: "secondary" as const,
      }
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED:
    default:
      return {
        label: t("keyManagement:batchManagedSiteExport.status.blocked"),
        variant: "danger" as const,
      }
  }
}

/**
 * Preview and execute selected Key Management tokens as managed-site channels.
 */
export function ManagedSiteTokenBatchExportDialog({
  isOpen,
  onClose,
  items,
  onCompleted,
}: ManagedSiteTokenBatchExportDialogProps) {
  const { t } = useTranslation(["keyManagement", "settings", "common"])
  const [preview, setPreview] =
    useState<ManagedSiteTokenBatchExportPreview | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [executionResult, setExecutionResult] =
    useState<ManagedSiteTokenBatchExportExecutionResult | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!isOpen) {
      setPreview(null)
      setSelectedIds(new Set())
      setIsLoadingPreview(false)
      setPreviewError(null)
      setIsConfirmOpen(false)
      setIsRunning(false)
      setExecutionResult(null)
      setRefreshKey(0)
      return
    }

    let cancelled = false
    setPreview(null)
    setSelectedIds(new Set())
    setPreviewError(null)
    setExecutionResult(null)
    setIsLoadingPreview(true)

    void (async () => {
      try {
        const nextPreview = await prepareManagedSiteTokenBatchExportPreview({
          items,
        })
        if (cancelled) return
        setPreview(nextPreview)
        setSelectedIds(
          new Set(
            nextPreview.items
              .filter(isExecutablePreviewItem)
              .map((item) => item.id),
          ),
        )
      } catch (error) {
        if (cancelled) return
        setPreviewError(getErrorMessage(error))
      } finally {
        if (!cancelled) {
          setIsLoadingPreview(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, items, refreshKey])

  const executableItems = useMemo(
    () => preview?.items.filter(isExecutablePreviewItem) ?? [],
    [preview],
  )
  const selectedExecutableCount = executableItems.filter((item) =>
    selectedIds.has(item.id),
  ).length
  const allExecutableSelected =
    executableItems.length > 0 &&
    selectedExecutableCount === executableItems.length

  const selectedExecutionIds = useMemo(
    () => Array.from(selectedIds),
    [selectedIds],
  )

  const handleClose = () => {
    if (isRunning) return
    onClose()
  }

  const handleRefreshPreview = () => {
    if (isLoadingPreview || isRunning) return
    setRefreshKey((value) => value + 1)
  }

  const handleToggleAll = () => {
    if (!preview || executionResult) return
    setSelectedIds(
      allExecutableSelected
        ? new Set()
        : new Set(executableItems.map((item) => item.id)),
    )
  }

  const handleToggleItem = (item: ManagedSiteTokenBatchExportPreviewItem) => {
    if (!isExecutablePreviewItem(item) || executionResult) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(item.id)) {
        next.delete(item.id)
      } else {
        next.add(item.id)
      }
      return next
    })
  }

  const handleConfirm = async () => {
    if (!preview || selectedExecutionIds.length === 0) return

    setIsConfirmOpen(false)
    setIsRunning(true)
    try {
      const result = await executeManagedSiteTokenBatchExport({
        preview,
        selectedItemIds: selectedExecutionIds,
      })
      setExecutionResult(result)
      onCompleted?.(result)
      toast.success(
        t("keyManagement:batchManagedSiteExport.messages.completed", {
          created: result.createdCount,
          failed: result.failedCount,
          skipped: result.skippedCount,
        }),
      )
    } catch (error) {
      setPreviewError(getErrorMessage(error))
    } finally {
      setIsRunning(false)
    }
  }

  const footer = executionResult ? (
    <div className="flex items-center justify-between gap-3">
      <div className="text-muted-foreground text-sm">
        {t("keyManagement:batchManagedSiteExport.results.summary", {
          created: executionResult.createdCount,
          failed: executionResult.failedCount,
          skipped: executionResult.skippedCount,
          total: executionResult.items.length,
        })}
      </div>
      <Button type="button" onClick={handleClose}>
        {t("common:actions.close")}
      </Button>
    </div>
  ) : (
    <div className="flex items-center justify-between gap-3">
      <div className="text-muted-foreground text-sm">
        {preview
          ? t("keyManagement:batchManagedSiteExport.preview.summary", {
              ready: preview.readyCount,
              warning: preview.warningCount,
              skipped: preview.skippedCount,
              blocked: preview.blockedCount,
              total: preview.totalCount,
            })
          : t("keyManagement:batchManagedSiteExport.preview.selected", {
              selectedCount: items.length,
            })}
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleClose}
          disabled={isRunning}
        >
          {t("common:actions.cancel")}
        </Button>
        <Button
          type="button"
          leftIcon={
            isRunning || isLoadingPreview ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SendToBack className="h-4 w-4" />
            )
          }
          disabled={
            isRunning ||
            isLoadingPreview ||
            !preview ||
            selectedExecutableCount === 0 ||
            Boolean(previewError)
          }
          onClick={() => setIsConfirmOpen(true)}
        >
          {isRunning
            ? t("keyManagement:batchManagedSiteExport.actions.running")
            : t("keyManagement:batchManagedSiteExport.actions.start")}
        </Button>
      </div>
    </div>
  )

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        closeOnBackdropClick={!isRunning}
        closeOnEsc={!isRunning}
        showCloseButton={!isRunning}
        size="lg"
        header={
          <div className="space-y-1">
            <div className="text-base font-semibold">
              {t("keyManagement:batchManagedSiteExport.title")}
            </div>
            <div className="text-muted-foreground text-sm">
              {preview
                ? t("keyManagement:batchManagedSiteExport.description", {
                    site: getManagedSiteLabel(t, preview.siteType),
                    selectedCount: preview.totalCount,
                  })
                : t("keyManagement:batchManagedSiteExport.loadingDescription", {
                    selectedCount: items.length,
                  })}
            </div>
          </div>
        }
        footer={footer}
      >
        <div className="space-y-4">
          {previewError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
              {t("keyManagement:batchManagedSiteExport.preview.loadFailed", {
                error: previewError,
              })}
            </div>
          ) : null}

          {isLoadingPreview ? (
            <div className="text-muted-foreground rounded-md border p-3 text-sm">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("keyManagement:batchManagedSiteExport.preview.loading")}
              </div>
            </div>
          ) : null}

          {preview && !executionResult ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={allExecutableSelected}
                  disabled={executableItems.length === 0}
                  onCheckedChange={handleToggleAll}
                />
                {t("keyManagement:batchManagedSiteExport.actions.selectAll", {
                  selected: selectedExecutableCount,
                  total: executableItems.length,
                })}
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                leftIcon={<RefreshCcw className="h-4 w-4" />}
                disabled={isLoadingPreview || isRunning}
                onClick={handleRefreshPreview}
              >
                {t(
                  "keyManagement:batchManagedSiteExport.actions.refreshPreview",
                )}
              </Button>
            </div>
          ) : null}

          {preview ? (
            <div className="max-h-[60vh] space-y-3 overflow-y-auto rounded-md border p-3 md:max-h-[min(70vh,48rem)]">
              {preview.items.map((item) => {
                const badge = getStatusBadge(t, item)
                const result = executionResult?.items.find(
                  (resultItem) => resultItem.id === item.id,
                )

                return (
                  <div
                    key={item.id}
                    className="space-y-2 rounded-md border p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <label className="flex min-w-0 items-start gap-2">
                        <Checkbox
                          className="mt-0.5"
                          checked={selectedIds.has(item.id)}
                          disabled={
                            !isExecutablePreviewItem(item) || !!executionResult
                          }
                          onCheckedChange={() => handleToggleItem(item)}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {item.accountName} / {item.tokenName}
                          </span>
                          <span className="text-muted-foreground block truncate text-xs">
                            {item.draft?.name ?? "-"}
                          </span>
                        </span>
                      </label>
                      <div className="flex shrink-0 flex-wrap justify-end gap-2">
                        {result ? (
                          <Badge
                            variant={
                              result.success
                                ? "success"
                                : result.skipped
                                  ? "secondary"
                                  : "danger"
                            }
                            size="sm"
                          >
                            {result.success
                              ? t(
                                  "keyManagement:batchManagedSiteExport.results.status.success",
                                )
                              : result.skipped
                                ? t(
                                    "keyManagement:batchManagedSiteExport.results.status.skipped",
                                  )
                                : t(
                                    "keyManagement:batchManagedSiteExport.results.status.failed",
                                  )}
                          </Badge>
                        ) : (
                          <Badge variant={badge.variant} size="sm">
                            {badge.label}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-2 text-xs md:grid-cols-2">
                      <div>
                        <span className="text-muted-foreground">
                          {t(
                            "keyManagement:batchManagedSiteExport.fields.baseUrl",
                          )}
                        </span>
                        <span className="ml-2 break-all">
                          {item.draft?.base_url || "-"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          {t(
                            "keyManagement:batchManagedSiteExport.fields.groups",
                          )}
                        </span>
                        <span className="ml-2">
                          {formatValues(item.draft?.groups)}
                        </span>
                      </div>
                      <div className="md:col-span-2">
                        <span className="text-muted-foreground">
                          {t(
                            "keyManagement:batchManagedSiteExport.fields.models",
                          )}
                        </span>
                        <span className="ml-2 break-words">
                          {formatValues(item.draft?.models)}
                        </span>
                      </div>
                    </div>

                    {item.matchedChannel ? (
                      <div className="text-muted-foreground dark:bg-dark-bg-tertiary rounded-md bg-gray-50 p-2 text-xs">
                        {t(
                          "keyManagement:batchManagedSiteExport.messages.duplicate",
                          {
                            channel: item.matchedChannel.name,
                          },
                        )}
                      </div>
                    ) : null}

                    {item.warningCodes.length > 0 ? (
                      <ul className="list-disc space-y-1 pl-5 text-xs text-amber-700 dark:text-amber-300">
                        {item.warningCodes.map((code) => (
                          <li key={code}>{getWarningText(t, code)}</li>
                        ))}
                      </ul>
                    ) : null}

                    {item.blockingReasonCode ? (
                      <div className="rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
                        {getBlockedReasonText(t, item.blockingReasonCode)}
                        {item.blockingMessage
                          ? `: ${item.blockingMessage}`
                          : ""}
                      </div>
                    ) : null}

                    {result?.error ? (
                      <div className="rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
                        {result.error}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      </Modal>

      <DestructiveConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirm}
        title={t("keyManagement:batchManagedSiteExport.confirm.title")}
        description={t(
          "keyManagement:batchManagedSiteExport.confirm.description",
          {
            selectedCount: selectedExecutableCount,
          },
        )}
        confirmLabel={t("keyManagement:batchManagedSiteExport.actions.start")}
        cancelLabel={t("common:actions.cancel")}
        isWorking={isRunning}
      />
    </>
  )
}
