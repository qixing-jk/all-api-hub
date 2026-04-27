import type { TFunction } from "i18next"
import { ArrowRightLeft, Loader2, RefreshCcw } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

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
import { ChannelTypeNames, type ChannelType } from "~/constants/managedSite"
import { OctopusOutboundTypeNames } from "~/constants/octopus"
import { OCTOPUS } from "~/constants/siteType"
import {
  executeManagedSiteChannelMigration,
  prepareManagedSiteChannelMigrationPreview,
} from "~/services/managedSites/channelMigration"
import { getNumericChannelType } from "~/services/managedSites/utils/channelType"
import {
  getManagedSiteLabel,
  type ManagedSiteTargetOption,
} from "~/services/managedSites/utils/managedSite"
import type { UserPreferences } from "~/services/preferences/userPreferences"
import {
  MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES,
  MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES,
  MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES,
  type ManagedSiteChannelMigrationBlockedReasonCode,
  type ManagedSiteChannelMigrationExecutionItem,
  type ManagedSiteChannelMigrationExecutionResult,
  type ManagedSiteChannelMigrationGeneralWarningCode,
  type ManagedSiteChannelMigrationItemWarningCode,
  type ManagedSiteChannelMigrationPreview,
} from "~/types/managedSiteMigration"
import { getErrorMessage } from "~/utils/core/error"

import type { ChannelRow } from "../types"

interface ManagedSiteChannelMigrationDialogProps {
  isOpen: boolean
  onClose: () => void
  channels: ChannelRow[]
  preferences: UserPreferences
  sourceSiteType: ManagedSiteTargetOption["siteType"]
  availableTargets: ManagedSiteTargetOption[]
  resolveNewApiSourceKey?: (params: {
    channelId: number
    channelName: string
  }) => Promise<string>
}

const getGeneralWarningText = (
  t: TFunction,
  code: ManagedSiteChannelMigrationGeneralWarningCode,
) => {
  switch (code) {
    case MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES.CREATE_ONLY:
      return t("managedSiteChannels:migration.generalWarnings.createOnly")
    case MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES.NO_DEDUPE_OR_SYNC:
      return t("managedSiteChannels:migration.generalWarnings.noDedupeOrSync")
    case MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES.NO_ROLLBACK:
    default:
      return t("managedSiteChannels:migration.generalWarnings.noRollback")
  }
}

const getItemWarningText = (
  t: TFunction,
  code: ManagedSiteChannelMigrationItemWarningCode,
) => {
  switch (code) {
    case MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_MODEL_MAPPING:
      return t("managedSiteChannels:migration.itemWarnings.dropsModelMapping")
    case MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_STATUS_CODE_MAPPING:
      return t(
        "managedSiteChannels:migration.itemWarnings.dropsStatusCodeMapping",
      )
    case MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_ADVANCED_SETTINGS:
      return t(
        "managedSiteChannels:migration.itemWarnings.dropsAdvancedSettings",
      )
    case MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_MULTI_KEY_STATE:
      return t("managedSiteChannels:migration.itemWarnings.dropsMultiKeyState")
    case MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_REMAPS_CHANNEL_TYPE:
      return t(
        "managedSiteChannels:migration.itemWarnings.targetRemapsChannelType",
      )
    case MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_NORMALIZES_BASE_URL:
      return t(
        "managedSiteChannels:migration.itemWarnings.targetNormalizesBaseUrl",
      )
    case MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_FORCES_DEFAULT_GROUP:
      return t(
        "managedSiteChannels:migration.itemWarnings.targetForcesDefaultGroup",
      )
    case MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_IGNORES_PRIORITY:
      return t(
        "managedSiteChannels:migration.itemWarnings.targetIgnoresPriority",
      )
    case MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_IGNORES_WEIGHT:
      return t("managedSiteChannels:migration.itemWarnings.targetIgnoresWeight")
    case MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_SIMPLIFIES_STATUS:
    default:
      return t(
        "managedSiteChannels:migration.itemWarnings.targetSimplifiesStatus",
      )
  }
}

const getBlockedReasonText = (
  t: TFunction,
  code?: ManagedSiteChannelMigrationBlockedReasonCode,
) => {
  switch (code) {
    case MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING:
      return t("managedSiteChannels:migration.blockedReasons.sourceKeyMissing")
    case MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED:
    default:
      return t(
        "managedSiteChannels:migration.blockedReasons.sourceKeyResolutionFailed",
      )
  }
}

const getExecutionBadge = (
  t: TFunction,
  item: ManagedSiteChannelMigrationExecutionItem,
) => {
  if (item.success) {
    return {
      text: t("managedSiteChannels:migration.results.status.success"),
      variant: "success" as const,
    }
  }

  if (item.skipped) {
    return {
      text: t("managedSiteChannels:migration.results.status.skipped"),
      variant: "secondary" as const,
    }
  }

  return {
    text: t("managedSiteChannels:migration.results.status.failed"),
    variant: "danger" as const,
  }
}

const getStatusText = (t: TFunction, status?: number) => {
  switch (status) {
    case 1:
      return t("managedSiteChannels:statusLabels.enabled")
    case 2:
      return t("managedSiteChannels:statusLabels.manualPause")
    case 3:
      return t("managedSiteChannels:statusLabels.autoDisabled")
    case 0:
    default:
      return t("managedSiteChannels:statusLabels.unknown")
  }
}

const getChannelTypeText = (
  siteType: ManagedSiteTargetOption["siteType"],
  type?: number,
) => {
  if (typeof type !== "number") {
    return "—"
  }

  return siteType === OCTOPUS
    ? OctopusOutboundTypeNames[type] ?? String(type)
    : ChannelTypeNames[type as ChannelType] ?? String(type)
}

const formatDelimitedValues = (value: string | null | undefined) => {
  const items =
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? []

  return items.length > 0 ? items.join(", ") : "—"
}

const formatArrayValues = (items: string[] | null | undefined) =>
  items && items.length > 0 ? items.join(", ") : "—"

/**
 * Render a single source-to-target field comparison row in the migration preview.
 */
function PreviewComparisonRow({
  label,
  sourceValue,
  targetValue,
}: {
  label: string
  sourceValue: string
  targetValue: string
}) {
  return (
    <div className="bg-border grid gap-px md:grid-cols-[minmax(0,120px)_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="bg-muted/50 px-3 py-2 text-[11px] font-medium uppercase">
        {label}
      </div>
      <div className="bg-background px-3 py-2 text-sm break-words">
        {sourceValue}
      </div>
      <div className="bg-background px-3 py-2 text-sm break-words">
        {targetValue}
      </div>
    </div>
  )
}

/**
 * Render the warning list shown inside tooltip popovers in the migration dialog.
 */
function WarningTooltipContent({ items }: { items: string[] }) {
  return (
    <ul className="max-w-sm list-disc space-y-1 pl-4 text-left">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

/**
 * Modal flow for selecting a managed-site migration target, reviewing the
 * create-only preview, and showing per-channel execution results.
 */
export function ManagedSiteChannelMigrationDialog({
  isOpen,
  onClose,
  channels,
  preferences,
  sourceSiteType,
  availableTargets,
  resolveNewApiSourceKey,
}: ManagedSiteChannelMigrationDialogProps) {
  const { t } = useTranslation([
    "managedSiteChannels",
    "settings",
    "channelDialog",
  ])
  const [targetSiteType, setTargetSiteType] = useState<string>("")
  const [preview, setPreview] =
    useState<ManagedSiteChannelMigrationPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [executionResult, setExecutionResult] =
    useState<ManagedSiteChannelMigrationExecutionResult | null>(null)
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0)

  const selectedCount = channels.length
  const selectedTarget = useMemo(
    () =>
      availableTargets.find((target) => target.siteType === targetSiteType) ??
      null,
    [availableTargets, targetSiteType],
  )

  useEffect(() => {
    if (!isOpen) {
      setTargetSiteType("")
      setPreview(null)
      setPreviewError(null)
      setIsLoadingPreview(false)
      setIsConfirmOpen(false)
      setIsRunning(false)
      setExecutionResult(null)
      setPreviewRefreshKey(0)
      return
    }

    setTargetSiteType((current) => {
      if (
        current &&
        availableTargets.some((target) => target.siteType === current)
      ) {
        return current
      }

      return availableTargets[0]?.siteType ?? ""
    })
    setPreview(null)
    setPreviewError(null)
    setExecutionResult(null)
    setPreviewRefreshKey(0)
  }, [availableTargets, isOpen])

  useEffect(() => {
    if (!isOpen || !targetSiteType) {
      return
    }

    let cancelled = false

    setPreview(null)
    setPreviewError(null)
    setIsLoadingPreview(true)

    void (async () => {
      try {
        const nextPreview = await prepareManagedSiteChannelMigrationPreview({
          preferences,
          sourceSiteType,
          targetSiteType: targetSiteType as ManagedSiteTargetOption["siteType"],
          channels,
          resolveNewApiSourceKey,
        })

        if (cancelled) return
        setPreview(nextPreview)
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
  }, [
    channels,
    isOpen,
    preferences,
    previewRefreshKey,
    resolveNewApiSourceKey,
    sourceSiteType,
    targetSiteType,
  ])

  const handleClose = () => {
    if (isRunning) return
    onClose()
  }

  const handleRefreshPreview = () => {
    if (isLoadingPreview || isRunning) return
    setExecutionResult(null)
    setPreviewRefreshKey((value) => value + 1)
  }

  const handleConfirm = async () => {
    if (!preview || preview.readyCount === 0) return

    setIsRunning(true)
    setIsConfirmOpen(false)
    try {
      const result = await executeManagedSiteChannelMigration({
        preview,
      })
      setExecutionResult(result)
    } catch (error) {
      setPreviewError(getErrorMessage(error))
    } finally {
      setIsRunning(false)
    }
  }

  const footer = executionResult ? (
    <div className="flex items-center justify-between gap-3">
      <div className="text-muted-foreground text-sm">
        {t("managedSiteChannels:migration.results.summary", {
          created: executionResult.createdCount,
          failed: executionResult.failedCount,
          skipped: executionResult.skippedCount,
          total: executionResult.totalSelected,
        })}
      </div>
      <Button type="button" onClick={handleClose}>
        {t("managedSiteChannels:migration.actions.close")}
      </Button>
    </div>
  ) : (
    <div className="flex items-center justify-between gap-3">
      <div className="text-muted-foreground text-sm">
        {preview
          ? t("managedSiteChannels:migration.preview.summary", {
              ready: preview.readyCount,
              blocked: preview.blockedCount,
              total: preview.totalCount,
            })
          : t("managedSiteChannels:migration.preview.selectedCount", {
              selectedCount,
            })}
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleClose}
          disabled={isRunning}
        >
          {t("managedSiteChannels:migration.actions.cancel")}
        </Button>
        <Button
          type="button"
          leftIcon={
            isLoadingPreview || isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRightLeft className="h-4 w-4" />
            )
          }
          disabled={
            isLoadingPreview ||
            isRunning ||
            !preview ||
            preview.readyCount === 0 ||
            Boolean(previewError)
          }
          onClick={() => setIsConfirmOpen(true)}
        >
          {isRunning
            ? t("managedSiteChannels:migration.actions.running")
            : t("managedSiteChannels:migration.actions.start")}
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
            <div className="flex items-center gap-2">
              <div className="text-base font-semibold">
                {t("managedSiteChannels:migration.title")}
              </div>
              <Badge variant="warning" size="sm" className="shrink-0">
                {t("managedSiteChannels:migration.betaBadge")}
              </Badge>
            </div>
            <div className="text-muted-foreground text-sm">
              {t("managedSiteChannels:migration.description", {
                selectedCount,
              })}
            </div>
          </div>
        }
        footer={footer}
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="space-y-2">
              <div className="text-sm font-medium">
                {t("managedSiteChannels:migration.target.label")}
              </div>
              <Select
                value={targetSiteType}
                onValueChange={setTargetSiteType}
                disabled={
                  isLoadingPreview ||
                  isRunning ||
                  !!executionResult ||
                  !availableTargets.length
                }
              >
                <SelectTrigger
                  aria-label={t("managedSiteChannels:migration.target.label")}
                >
                  <SelectValue
                    placeholder={
                      t("managedSiteChannels:migration.target.placeholder") ??
                      ""
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableTargets.map((target) => (
                    <SelectItem key={target.siteType} value={target.siteType}>
                      {getManagedSiteLabel(t, target.siteType)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              leftIcon={<RefreshCcw className="h-4 w-4" />}
              disabled={
                !targetSiteType ||
                isLoadingPreview ||
                isRunning ||
                !!executionResult
              }
              onClick={handleRefreshPreview}
            >
              {t("managedSiteChannels:migration.actions.refreshPreview")}
            </Button>
          </div>

          <div className="grid gap-3 rounded-md border p-3 text-sm md:grid-cols-2">
            <div>
              <div className="text-muted-foreground text-xs uppercase">
                {t("managedSiteChannels:migration.target.sourceLabel")}
              </div>
              <div className="font-medium">
                {getManagedSiteLabel(t, sourceSiteType)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs uppercase">
                {t("managedSiteChannels:migration.target.destinationLabel")}
              </div>
              <div className="font-medium">
                {selectedTarget
                  ? getManagedSiteLabel(t, selectedTarget.siteType)
                  : t("managedSiteChannels:migration.target.unselected")}
              </div>
            </div>
          </div>

          {previewError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
              {t("managedSiteChannels:migration.preview.loadFailed", {
                error: previewError,
              })}
            </div>
          )}

          {!previewError && isLoadingPreview && (
            <div className="text-muted-foreground rounded-md border p-3 text-sm">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("managedSiteChannels:migration.preview.loading")}
              </div>
            </div>
          )}

          {!executionResult && preview && (
            <>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {t("managedSiteChannels:migration.generalWarnings.title")}
                    </div>
                    <div className="mt-1 text-xs">
                      {t(
                        "managedSiteChannels:migration.generalWarnings.compactSummary",
                      )}
                    </div>
                  </div>
                  <Tooltip
                    content={
                      <WarningTooltipContent
                        items={preview.generalWarningCodes.map((code) =>
                          getGeneralWarningText(t, code),
                        )}
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
                      {preview.generalWarningCodes.length}{" "}
                      {t(
                        "managedSiteChannels:migration.preview.badges.limitsLabel",
                      )}
                    </Badge>
                  </Tooltip>
                </div>
              </div>

              <div className="max-h-96 space-y-3 overflow-y-auto rounded-md border p-3">
                {preview.items.map((item) => (
                  <div
                    key={item.channelId}
                    className="space-y-2 rounded-md border p-3"
                  >
                    <CollapsibleSection
                      title={
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {item.channelName}
                            </div>
                            <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-2 text-xs">
                              <span>#{item.channelId}</span>
                              <span className="truncate">
                                {item.sourceChannel.base_url || "—"}
                              </span>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {item.warningCodes.length > 0 && (
                              <Tooltip
                                content={
                                  <WarningTooltipContent
                                    items={item.warningCodes.map(
                                      (warningCode) =>
                                        getItemWarningText(t, warningCode),
                                    )}
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
                                  {item.warningCodes.length}{" "}
                                  {t(
                                    "managedSiteChannels:migration.preview.badges.warningsLabel",
                                  )}
                                </Badge>
                              </Tooltip>
                            )}
                            {item.status === "ready" ? (
                              <Badge variant="success" size="sm">
                                {t(
                                  "managedSiteChannels:migration.preview.status.ready",
                                )}
                              </Badge>
                            ) : (
                              <Tooltip
                                content={
                                  <div className="max-w-sm space-y-2 text-left">
                                    <div className="font-medium">
                                      {getBlockedReasonText(
                                        t,
                                        item.blockingReasonCode,
                                      )}
                                    </div>
                                    {item.blockingMessage && (
                                      <div>{item.blockingMessage}</div>
                                    )}
                                  </div>
                                }
                                position="left"
                                wrapperClassName="inline-flex"
                              >
                                <Badge
                                  variant="warning"
                                  size="sm"
                                  className="cursor-help whitespace-nowrap"
                                >
                                  {t(
                                    "managedSiteChannels:migration.preview.status.blocked",
                                  )}
                                </Badge>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                      }
                      defaultOpen={item.status === "blocked"}
                      buttonClassName="px-0 py-0 hover:bg-transparent dark:hover:bg-transparent"
                      panelClassName="mt-3 space-y-3 border-0 bg-transparent p-0"
                    >
                      <div className="space-y-3">
                        <div className="overflow-hidden rounded-md border">
                          <div className="bg-border grid gap-px md:grid-cols-[minmax(0,120px)_minmax(0,1fr)_minmax(0,1fr)]">
                            <div className="bg-muted/50 px-3 py-2 text-[11px] font-medium uppercase">
                              {t(
                                "managedSiteChannels:migration.preview.compare.fieldLabel",
                              )}
                            </div>
                            <div className="bg-muted/50 px-3 py-2 text-xs font-medium">
                              {t(
                                "managedSiteChannels:migration.target.sourceLabel",
                              )}
                            </div>
                            <div className="bg-muted/50 px-3 py-2 text-xs font-medium">
                              {t(
                                "managedSiteChannels:migration.target.destinationLabel",
                              )}
                            </div>
                          </div>
                          <PreviewComparisonRow
                            label={t("channelDialog:fields.baseUrl.label")}
                            sourceValue={
                              item.sourceChannel.base_url?.trim() || "—"
                            }
                            targetValue={item.draft?.base_url.trim() || "—"}
                          />
                          <PreviewComparisonRow
                            label={t("channelDialog:fields.type.label")}
                            sourceValue={getChannelTypeText(
                              sourceSiteType,
                              getNumericChannelType(item.sourceChannel.type),
                            )}
                            targetValue={
                              item.draft
                                ? getChannelTypeText(
                                    preview.targetSiteType,
                                    getNumericChannelType(item.draft.type),
                                  )
                                : "—"
                            }
                          />
                          <PreviewComparisonRow
                            label={t("channelDialog:fields.models.label")}
                            sourceValue={formatDelimitedValues(
                              item.sourceChannel.models,
                            )}
                            targetValue={
                              item.draft
                                ? formatArrayValues(item.draft.models)
                                : "—"
                            }
                          />
                          <PreviewComparisonRow
                            label={t("channelDialog:fields.groups.label")}
                            sourceValue={formatDelimitedValues(
                              item.sourceChannel.group,
                            )}
                            targetValue={
                              item.draft
                                ? formatArrayValues(item.draft.groups)
                                : "—"
                            }
                          />
                          <PreviewComparisonRow
                            label={t("channelDialog:fields.priority.label")}
                            sourceValue={String(
                              item.sourceChannel.priority ?? 0,
                            )}
                            targetValue={
                              item.draft ? String(item.draft.priority) : "—"
                            }
                          />
                          <PreviewComparisonRow
                            label={t("channelDialog:fields.weight.label")}
                            sourceValue={String(item.sourceChannel.weight ?? 0)}
                            targetValue={
                              item.draft ? String(item.draft.weight) : "—"
                            }
                          />
                          <PreviewComparisonRow
                            label={t("channelDialog:fields.status.label")}
                            sourceValue={getStatusText(
                              t,
                              item.sourceChannel.status,
                            )}
                            targetValue={
                              item.draft
                                ? getStatusText(t, item.draft.status)
                                : t(
                                    "managedSiteChannels:migration.preview.status.blocked",
                                  )
                            }
                          />
                        </div>

                        {item.status === "blocked" && (
                          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                            <div className="font-medium">
                              {getBlockedReasonText(t, item.blockingReasonCode)}
                            </div>
                            {item.blockingMessage && (
                              <div className="mt-1">{item.blockingMessage}</div>
                            )}
                          </div>
                        )}

                        {item.warningCodes.length > 0 && (
                          <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-xs">
                            {item.warningCodes.map((warningCode) => (
                              <li key={warningCode}>
                                {getItemWarningText(t, warningCode)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </CollapsibleSection>
                  </div>
                ))}
              </div>
            </>
          )}

          {executionResult && (
            <div className="space-y-3">
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
                <div className="font-medium">
                  {t("managedSiteChannels:migration.results.title")}
                </div>
                <div className="mt-1">
                  {t("managedSiteChannels:migration.results.summary", {
                    created: executionResult.createdCount,
                    failed: executionResult.failedCount,
                    skipped: executionResult.skippedCount,
                    total: executionResult.totalSelected,
                  })}
                </div>
              </div>

              <div className="max-h-96 space-y-3 overflow-y-auto rounded-md border p-3">
                {executionResult.items.map((item) => {
                  const badge = getExecutionBadge(t, item)
                  return (
                    <div
                      key={item.channelId}
                      className="space-y-2 rounded-md border p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {item.channelName}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            #{item.channelId}
                          </div>
                        </div>
                        <Badge variant={badge.variant} size="sm">
                          {badge.text}
                        </Badge>
                      </div>

                      {item.error && (
                        <div className="text-muted-foreground text-xs">
                          {item.error}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </Modal>

      <DestructiveConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => {
          if (!isRunning) setIsConfirmOpen(false)
        }}
        title={t("managedSiteChannels:migration.confirm.title")}
        description={t("managedSiteChannels:migration.confirm.description", {
          ready: preview?.readyCount ?? 0,
          total: preview?.totalCount ?? 0,
        })}
        warningTitle={t("managedSiteChannels:migration.confirm.warningTitle")}
        cancelLabel={t("managedSiteChannels:migration.actions.cancel")}
        confirmLabel={t("managedSiteChannels:migration.confirm.confirm")}
        onConfirm={() => {
          void handleConfirm()
        }}
        isWorking={isRunning}
      />
    </>
  )
}
