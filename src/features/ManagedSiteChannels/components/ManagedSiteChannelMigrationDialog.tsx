import type { TFunction } from "i18next"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { AxonHubChannelTypeNames } from "~/constants/axonHub"
import { ClaudeCodeHubProviderTypeNames } from "~/constants/claudeCodeHub"
import { DoneHubChannelTypeNames } from "~/constants/doneHub"
import { ChannelTypeNames, type ChannelType } from "~/constants/managedSite"
import { OctopusOutboundTypeNames } from "~/constants/octopus"
import {
  PREVIEW_LOAD_ORIGINS,
  type PreviewLoadOrigin,
} from "~/constants/previewLoadOrigin"
import { SITE_TYPES } from "~/constants/siteType"
import { VeloeraChannelTypeNames } from "~/constants/veloera"
import {
  executeManagedSiteChannelMigration,
  prepareManagedSiteChannelMigrationPreview,
} from "~/services/managedSites/channelMigration"
import {
  getManagedSiteLabel,
  type ManagedSiteTargetOption,
} from "~/services/managedSites/utils/managedSite"
import type { UserPreferences } from "~/services/preferences/userPreferences"
import {
  trackProductAnalyticsActionCompleted,
  trackProductAnalyticsActionStarted,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import { resolveProductAnalyticsManagedSiteType } from "~/services/productAnalytics/managedSite"
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

import type {
  ManagedSiteMigrationLabels,
  ManagedSiteMigrationPreviewRow,
  ManagedSiteMigrationPreviewState,
  ManagedSiteMigrationResult,
} from "../presentation/contracts"
import { formatManagedSiteMigrationResultSummary } from "../presentation/managedResourceMigrationPresentation"
import { ManagedSiteMigrationDialogView } from "../presentation/ManagedSiteMigrationDialogView"
import type { ChannelRow } from "../types"

interface ManagedSiteChannelMigrationDialogProps {
  isOpen: boolean
  onClose: () => void
  onRecoverUncertainResult?: () => Promise<boolean>
  channels: ChannelRow[]
  preferences: UserPreferences
  sourceSiteType: ManagedSiteTargetOption["siteType"]
  availableTargets: ManagedSiteTargetOption[]
  resolveNewApiSourceKey?: (params: {
    channelId: number
    channelName: string
  }) => Promise<string>
}

/**
 * Counts general and per-channel preview warnings without exposing warning details.
 */
function countPreviewWarnings(
  preview: ManagedSiteChannelMigrationPreview,
): number {
  return (
    preview.generalWarningCodes.length +
    preview.items.reduce((count, item) => count + item.warningCodes.length, 0)
  )
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
    case MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_TYPE_UNSUPPORTED:
      return t(
        "managedSiteChannels:migration.blockedReasons.sourceTypeUnsupported",
      )
    case MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.TARGET_DRAFT_PREPARATION_FAILED:
      return t(
        "managedSiteChannels:migration.blockedReasons.targetDraftPreparationFailed",
      )
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

  if (item.uncertain) {
    return {
      text: t("managedSiteChannels:migration.results.status.uncertain"),
      variant: "warning" as const,
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
  type?: number | string,
) => {
  if (siteType === SITE_TYPES.AXON_HUB && typeof type === "string") {
    return (
      AxonHubChannelTypeNames[type as keyof typeof AxonHubChannelTypeNames] ??
      type
    )
  }

  if (siteType === SITE_TYPES.CLAUDE_CODE_HUB && typeof type === "string") {
    return (
      ClaudeCodeHubProviderTypeNames[
        type as keyof typeof ClaudeCodeHubProviderTypeNames
      ] ?? type
    )
  }

  if (siteType === SITE_TYPES.DONE_HUB && typeof type === "string") {
    const numericType = Number(type)
    return Number.isInteger(numericType)
      ? DoneHubChannelTypeNames[
          numericType as keyof typeof DoneHubChannelTypeNames
        ] ?? type
      : type
  }

  if (typeof type !== "number") {
    return "—"
  }

  return siteType === SITE_TYPES.OCTOPUS
    ? OctopusOutboundTypeNames[type] ?? String(type)
    : siteType === SITE_TYPES.DONE_HUB
      ? DoneHubChannelTypeNames[type as keyof typeof DoneHubChannelTypeNames] ??
        String(type)
      : siteType === SITE_TYPES.VELOERA
        ? VeloeraChannelTypeNames[
            type as keyof typeof VeloeraChannelTypeNames
          ] ?? String(type)
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
 * Modal flow for selecting a managed-site migration target, reviewing the
 * create-only preview, and showing per-channel execution results.
 */
export function ManagedSiteChannelMigrationDialog({
  isOpen,
  onClose,
  onRecoverUncertainResult,
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
  const [previewLoadOrigin, setPreviewLoadOrigin] =
    useState<PreviewLoadOrigin>(null)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isRecovering, setIsRecovering] = useState(false)
  const recoveryInFlightRef = useRef(false)
  const [executionResult, setExecutionResult] =
    useState<ManagedSiteChannelMigrationExecutionResult | null>(null)
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0)
  const pendingPreviewLoadOriginRef = useRef<PreviewLoadOrigin>(null)
  const isManualPreviewRefresh =
    previewLoadOrigin === PREVIEW_LOAD_ORIGINS.MANUAL

  const selectedCount = channels.length
  const selectedTarget = useMemo(
    () =>
      availableTargets.find((target) => target.siteType === targetSiteType) ??
      null,
    [availableTargets, targetSiteType],
  )
  const isSelectedTargetAvailable = Boolean(selectedTarget)
  const requiresUncertainResultRecovery = Boolean(
    onRecoverUncertainResult &&
      executionResult?.items.some((item) => item.uncertain),
  )

  useEffect(() => {
    if (!isOpen) {
      setTargetSiteType("")
      setPreview(null)
      setPreviewError(null)
      setIsLoadingPreview(false)
      setPreviewLoadOrigin(null)
      setIsConfirmOpen(false)
      setIsRunning(false)
      setIsRecovering(false)
      recoveryInFlightRef.current = false
      setExecutionResult(null)
      setPreviewRefreshKey(0)
      pendingPreviewLoadOriginRef.current = null
      return
    }

    const nextTargetSiteType = availableTargets.some(
      (target) => target.siteType === targetSiteType,
    )
      ? targetSiteType
      : availableTargets[0]?.siteType ?? ""

    if (nextTargetSiteType === targetSiteType) return

    setPreview(null)
    setPreviewError(null)
    setExecutionResult(null)
    if (nextTargetSiteType) {
      pendingPreviewLoadOriginRef.current = PREVIEW_LOAD_ORIGINS.AUTOMATIC
      setPreviewLoadOrigin(PREVIEW_LOAD_ORIGINS.AUTOMATIC)
    } else {
      pendingPreviewLoadOriginRef.current = null
      setPreviewLoadOrigin(null)
      setIsLoadingPreview(false)
    }
    setTargetSiteType(nextTargetSiteType)
  }, [availableTargets, isOpen, targetSiteType])

  useEffect(() => {
    if (!isOpen || !targetSiteType || !isSelectedTargetAvailable) {
      pendingPreviewLoadOriginRef.current = null
      setIsLoadingPreview(false)
      setPreviewLoadOrigin(null)
      return
    }

    let cancelled = false
    const requestOrigin =
      pendingPreviewLoadOriginRef.current ?? PREVIEW_LOAD_ORIGINS.AUTOMATIC
    pendingPreviewLoadOriginRef.current = null

    setPreviewLoadOrigin(requestOrigin)
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
          setPreviewLoadOrigin(null)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    channels,
    isOpen,
    isSelectedTargetAvailable,
    preferences,
    previewRefreshKey,
    resolveNewApiSourceKey,
    sourceSiteType,
    targetSiteType,
  ])

  const handleClose = () => {
    if (isRunning || isRecovering || requiresUncertainResultRecovery) {
      return
    }
    onClose()
  }

  const handleRecoverUncertainResult = async () => {
    if (isRunning || recoveryInFlightRef.current || !onRecoverUncertainResult) {
      return
    }
    recoveryInFlightRef.current = true
    setIsRecovering(true)
    try {
      const refreshAccepted = await onRecoverUncertainResult()
      if (refreshAccepted) {
        onClose()
      }
    } catch {
      // Keep uncertain results visible until a controlled refresh is accepted.
    } finally {
      recoveryInFlightRef.current = false
      setIsRecovering(false)
    }
  }

  const handleRefreshPreview = () => {
    if (isLoadingPreview || pendingPreviewLoadOriginRef.current || isRunning) {
      return
    }
    pendingPreviewLoadOriginRef.current = PREVIEW_LOAD_ORIGINS.MANUAL
    setPreviewLoadOrigin(PREVIEW_LOAD_ORIGINS.MANUAL)
    setIsLoadingPreview(true)
    setExecutionResult(null)
    setPreviewRefreshKey((value) => value + 1)
  }

  const handleTargetSiteTypeChange = (nextTargetSiteType: string) => {
    if (nextTargetSiteType === targetSiteType) return
    pendingPreviewLoadOriginRef.current = PREVIEW_LOAD_ORIGINS.AUTOMATIC
    setPreviewLoadOrigin(PREVIEW_LOAD_ORIGINS.AUTOMATIC)
    setIsLoadingPreview(true)
    setTargetSiteType(nextTargetSiteType)
  }

  const handleConfirm = async () => {
    if (!preview || preview.readyCount === 0) return

    setIsRunning(true)
    setIsConfirmOpen(false)
    const sourceManagedSiteType =
      resolveProductAnalyticsManagedSiteType(sourceSiteType)
    const targetManagedSiteType = resolveProductAnalyticsManagedSiteType(
      preview.targetSiteType,
    )
    const warningCount = countPreviewWarnings(preview)
    const analyticsContext = {
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.MigrateManagedSiteChannels,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    }
    void trackProductAnalyticsActionStarted(analyticsContext)
    try {
      const result = await executeManagedSiteChannelMigration({
        preview,
      })
      setExecutionResult(result)
      void trackProductAnalyticsActionCompleted({
        ...analyticsContext,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        insights: {
          itemCount: result.totalSelected,
          selectedCount: result.totalSelected,
          successCount: result.createdCount,
          failureCount: result.failedCount + (result.uncertainCount ?? 0),
          sourceManagedSiteType,
          targetManagedSiteType,
          readyCount: preview.readyCount,
          blockedCount: preview.blockedCount,
          warningCount,
        },
      })
    } catch (error) {
      setPreviewError(getErrorMessage(error))
      void trackProductAnalyticsActionCompleted({
        ...analyticsContext,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          itemCount: preview.readyCount,
          selectedCount: preview.readyCount,
          sourceManagedSiteType,
          targetManagedSiteType,
          readyCount: preview.readyCount,
          blockedCount: preview.blockedCount,
          warningCount,
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
        },
      })
    } finally {
      setIsRunning(false)
    }
  }

  const presentationPreview = useMemo<ManagedSiteMigrationPreviewState>(
    () => ({
      sourceLabel: getManagedSiteLabel(t, sourceSiteType),
      targetLabel: selectedTarget
        ? getManagedSiteLabel(t, selectedTarget.siteType)
        : undefined,
      rows:
        preview?.items.map((item) => {
          const comparisonStatus = (
            source: string,
            target: string,
          ): "same" | "changed" | "unsupported" =>
            !item.draft ? "unsupported" : source === target ? "same" : "changed"
          const baseURLSource = item.sourceChannel.base_url?.trim() || "—"
          const baseURLTarget = item.draft?.base_url.trim() || "—"
          const typeSource = getChannelTypeText(
            sourceSiteType,
            item.sourceChannel.type,
          )
          const typeTarget = item.draft
            ? getChannelTypeText(preview.targetSiteType, item.draft.type)
            : "—"
          const modelsSource = formatDelimitedValues(item.sourceChannel.models)
          const modelsTarget = item.draft
            ? formatArrayValues(item.draft.models)
            : "—"
          const groupsSource = formatDelimitedValues(item.sourceChannel.group)
          const groupsTarget = item.draft
            ? formatArrayValues(item.draft.groups)
            : "—"
          const prioritySource = String(item.sourceChannel.priority ?? 0)
          const priorityTarget = item.draft ? String(item.draft.priority) : "—"
          const weightSource = String(item.sourceChannel.weight ?? 0)
          const weightTarget = item.draft ? String(item.draft.weight) : "—"
          const statusSource = getStatusText(t, item.sourceChannel.status)
          const statusTarget = item.draft
            ? getStatusText(t, item.draft.status)
            : t("managedSiteChannels:migration.preview.status.blocked")

          return {
            rowKey: String(item.channelId),
            displayIdentifier: String(item.channelId),
            name: item.channelName,
            baseURL: item.sourceChannel.base_url || "",
            status: item.status,
            comparisons: [
              {
                id: "baseUrl",
                label: t("channelDialog:fields.baseUrl.label"),
                source: baseURLSource,
                target: baseURLTarget,
                status: comparisonStatus(baseURLSource, baseURLTarget),
              },
              {
                id: "type",
                label: t("channelDialog:fields.type.label"),
                source: typeSource,
                target: typeTarget,
                status: comparisonStatus(typeSource, typeTarget),
              },
              {
                id: "models",
                label: t("channelDialog:fields.models.label"),
                source: modelsSource,
                target: modelsTarget,
                status: comparisonStatus(modelsSource, modelsTarget),
              },
              {
                id: "groups",
                label: t("channelDialog:fields.groups.label"),
                source: groupsSource,
                target: groupsTarget,
                status: comparisonStatus(groupsSource, groupsTarget),
              },
              {
                id: "priority",
                label: t("channelDialog:fields.priority.label"),
                source: prioritySource,
                target: priorityTarget,
                status: comparisonStatus(prioritySource, priorityTarget),
              },
              {
                id: "weight",
                label: t("channelDialog:fields.weight.label"),
                source: weightSource,
                target: weightTarget,
                status: comparisonStatus(weightSource, weightTarget),
              },
              {
                id: "status",
                label: t("channelDialog:fields.status.label"),
                source: statusSource,
                target: statusTarget,
                status: comparisonStatus(statusSource, statusTarget),
              },
            ] as ManagedSiteMigrationPreviewRow["comparisons"],
            warningText: item.warningCodes.map((warningCode) =>
              getItemWarningText(t, warningCode),
            ),
            blockedReason:
              item.status === "blocked"
                ? getBlockedReasonText(t, item.blockingReasonCode)
                : undefined,
            blockedMessage: item.blockingMessage,
          }
        }) ?? [],
      generalWarnings:
        preview?.generalWarningCodes.map((code) =>
          getGeneralWarningText(t, code),
        ) ?? [],
      readyCount: preview?.readyCount ?? 0,
      blockedCount: preview?.blockedCount ?? 0,
      totalCount: preview?.totalCount ?? selectedCount,
      isLoading: isLoadingPreview,
      isManualLoading: isManualPreviewRefresh,
      error: previewError
        ? t("managedSiteChannels:migration.preview.loadFailed", {
            error: previewError,
          })
        : null,
    }),
    [
      isLoadingPreview,
      isManualPreviewRefresh,
      preview,
      previewError,
      selectedCount,
      selectedTarget,
      sourceSiteType,
      t,
    ],
  )

  const presentationResult = useMemo<ManagedSiteMigrationResult | null>(
    () =>
      executionResult
        ? {
            summary: formatManagedSiteMigrationResultSummary(t, {
              created: executionResult.createdCount,
              failed: executionResult.failedCount,
              skipped: executionResult.skippedCount,
              uncertain: executionResult.uncertainCount ?? 0,
              total: executionResult.totalSelected,
            }),
            items: executionResult.items.map((item) => {
              const badge = getExecutionBadge(t, item)
              return {
                rowKey: String(item.channelId),
                displayIdentifier: String(item.channelId),
                name: item.channelName,
                status: item.success
                  ? "success"
                  : item.skipped
                    ? "skipped"
                    : item.uncertain
                      ? "uncertain"
                      : "failed",
                statusLabel: badge.text,
                message: item.error,
              }
            }),
          }
        : null,
    [executionResult, t],
  )

  const presentationLabels = useMemo<ManagedSiteMigrationLabels>(
    () => ({
      title: t("managedSiteChannels:migration.title"),
      beta: t("managedSiteChannels:migration.betaBadge"),
      description: t("managedSiteChannels:migration.description", {
        selectedCount,
      }),
      targetLabel: t("managedSiteChannels:migration.target.label"),
      targetPlaceholder: t("managedSiteChannels:migration.target.placeholder"),
      sourceLabel: t("managedSiteChannels:migration.target.sourceLabel"),
      destinationLabel: t(
        "managedSiteChannels:migration.target.destinationLabel",
      ),
      unselectedTarget: t("managedSiteChannels:migration.target.unselected"),
      refreshPreview: t("managedSiteChannels:migration.actions.refreshPreview"),
      loadingPreview: t("managedSiteChannels:migration.preview.loading"),
      generalWarningsTitle: t(
        "managedSiteChannels:migration.generalWarnings.title",
      ),
      generalWarningsSummary: t(
        "managedSiteChannels:migration.generalWarnings.compactSummary",
      ),
      limitsLabel: t(
        "managedSiteChannels:migration.preview.badges.limitsLabel",
      ),
      warningsLabel: t(
        "managedSiteChannels:migration.preview.badges.warningsLabel",
      ),
      ready: t("managedSiteChannels:migration.preview.status.ready"),
      blocked: t("managedSiteChannels:migration.preview.status.blocked"),
      fieldLabel: t("managedSiteChannels:migration.preview.compare.fieldLabel"),
      resultsTitle: t("managedSiteChannels:migration.results.title"),
      close: t("managedSiteChannels:migration.actions.close"),
      cancel: t("managedSiteChannels:migration.actions.cancel"),
      start: t("managedSiteChannels:migration.actions.start"),
      running: t("managedSiteChannels:migration.actions.running"),
      footerSummary: executionResult
        ? formatManagedSiteMigrationResultSummary(t, {
            created: executionResult.createdCount,
            failed: executionResult.failedCount,
            skipped: executionResult.skippedCount,
            uncertain: executionResult.uncertainCount ?? 0,
            total: executionResult.totalSelected,
          })
        : preview
          ? t("managedSiteChannels:migration.preview.summary", {
              ready: preview.readyCount,
              blocked: preview.blockedCount,
              total: preview.totalCount,
            })
          : t("managedSiteChannels:migration.preview.selectedCount", {
              selectedCount,
            }),
      confirmationTitle: t("managedSiteChannels:migration.confirm.title"),
      confirmationDescription: t(
        "managedSiteChannels:migration.confirm.description",
        {
          ready: preview?.readyCount ?? 0,
          total: preview?.totalCount ?? 0,
        },
      ),
      confirmationWarningTitle: t(
        "managedSiteChannels:migration.confirm.warningTitle",
      ),
      confirmationConfirm: t("managedSiteChannels:migration.confirm.confirm"),
      missingValue: "—",
      refreshRequired: t(
        "managedSiteChannels:migration.results.refreshRequired",
      ),
      refreshRequiredAction: t(
        "managedSiteChannels:migration.actions.refreshChannels",
      ),
    }),
    [executionResult, preview, selectedCount, t],
  )

  return (
    <ManagedSiteMigrationDialogView
      isOpen={isOpen}
      selectedTarget={targetSiteType}
      targets={availableTargets.map((target) => ({
        value: target.siteType,
        label: getManagedSiteLabel(t, target.siteType),
      }))}
      preview={presentationPreview}
      result={presentationResult}
      labels={presentationLabels}
      isConfirmationOpen={isConfirmOpen}
      isRunning={isRunning}
      isRecoveryRunning={isRecovering}
      refreshRequired={requiresUncertainResultRecovery}
      callbacks={{
        onTargetChange: handleTargetSiteTypeChange,
        onRefreshPreview: handleRefreshPreview,
        onRecoverRefreshRequired: () => void handleRecoverUncertainResult(),
        onConfirm: () => void handleConfirm(),
        onClose: handleClose,
        onOpenConfirmation: () => setIsConfirmOpen(true),
        onCloseConfirmation: () => {
          if (!isRunning) setIsConfirmOpen(false)
        },
      }}
    />
  )
}
