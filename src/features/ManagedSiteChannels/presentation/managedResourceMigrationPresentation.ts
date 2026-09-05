import type { TFunction } from "i18next"

import {
  AxonHubChannelTypeNames,
  isAxonHubChannelType,
} from "~/constants/axonHub"
import { ChannelTypeNames } from "~/constants/managedSite"
import type { ManagedSiteType } from "~/constants/siteType"
import { SITE_TYPES } from "~/constants/siteType"
import { VeloeraChannelTypeNames } from "~/constants/veloera"
import {
  MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES,
  MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES,
  MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES,
  type ManagedSiteChannelMigrationBlockedReasonCode,
  type ManagedSiteChannelMigrationGeneralWarningCode,
  type ManagedSiteChannelMigrationItemWarningCode,
} from "~/types/managedSiteMigration"
import type {
  ManagedSiteMigrationCanonicalExecutionResult,
  ManagedSiteMigrationCanonicalPreview,
  ManagedSiteMigrationCanonicalPreviewItem,
  ManagedSiteMigrationSource,
} from "~/types/managedSiteMigrationCapability"

import type {
  ManagedSiteMigrationComparison,
  ManagedSiteMigrationPreviewState,
  ManagedSiteMigrationResult,
} from "./contracts"

type ManagedResourceMigrationPresentationOptions = {
  t: TFunction
  getSiteLabel: (siteType: ManagedSiteType) => string
}

const resolveUnsupportedChannelTypeLabel = (t: TFunction) =>
  t("managedSiteChannels:editor.options.channelType.unsupported")

type ManagedSiteMigrationResultCounts = {
  created: number
  failed: number
  skipped: number
  uncertain: number
  total: number
}

/** Composes independently pluralized migration metrics into one locale-owned summary. */
export const formatManagedSiteMigrationResultSummary = (
  t: TFunction,
  counts: ManagedSiteMigrationResultCounts,
) =>
  t("managedSiteChannels:migration.results.summary", {
    created: t("managedSiteChannels:migration.results.summaryMetrics.created", {
      count: counts.created,
    }),
    failed: t("managedSiteChannels:migration.results.summaryMetrics.failed", {
      count: counts.failed,
    }),
    skipped: t("managedSiteChannels:migration.results.summaryMetrics.skipped", {
      count: counts.skipped,
    }),
    uncertain: t(
      "managedSiteChannels:migration.results.summaryMetrics.uncertain",
      { count: counts.uncertain },
    ),
    total: t("managedSiteChannels:migration.results.summaryMetrics.total", {
      count: counts.total,
    }),
  })

const comparisonFieldIds = [
  "baseUrl",
  "type",
  "models",
  "groups",
  "priority",
  "weight",
  "status",
] as const satisfies readonly ManagedSiteMigrationComparison["id"][]

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key)

const getComparisonLabel = (
  t: TFunction,
  fieldId: ManagedSiteMigrationComparison["id"],
): string => {
  switch (fieldId) {
    case "baseUrl":
      return t("channelDialog:fields.baseUrl.label")
    case "type":
      return t("channelDialog:fields.type.label")
    case "models":
      return t("channelDialog:fields.models.label")
    case "groups":
      return t("channelDialog:fields.groups.label")
    case "priority":
      return t("channelDialog:fields.priority.label")
    case "weight":
      return t("channelDialog:fields.weight.label")
    case "status":
      return t("channelDialog:fields.status.label")
  }
}

const getGeneralWarningText = (
  t: TFunction,
  code: ManagedSiteChannelMigrationGeneralWarningCode,
): string | null => {
  switch (code) {
    case MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES.CREATE_ONLY:
      return t("managedSiteChannels:migration.generalWarnings.createOnly")
    case MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES.NO_DEDUPE_OR_SYNC:
      return t("managedSiteChannels:migration.generalWarnings.noDedupeOrSync")
    case MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES.NO_ROLLBACK:
      return t("managedSiteChannels:migration.generalWarnings.noRollback")
    default:
      return null
  }
}

const getItemWarningText = (
  t: TFunction,
  code: ManagedSiteChannelMigrationItemWarningCode,
): string | null => {
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
      return t(
        "managedSiteChannels:migration.itemWarnings.targetSimplifiesStatus",
      )
    default:
      return null
  }
}

const getBlockedReasonText = (
  t: TFunction,
  code: ManagedSiteChannelMigrationBlockedReasonCode,
): string => {
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

const getTypeText = (
  t: TFunction,
  siteType: ManagedSiteType,
  type: ManagedSiteMigrationSource["resourceType"] | string,
): string => {
  if (
    siteType === SITE_TYPES.VELOERA &&
    typeof type === "number" &&
    hasOwn(VeloeraChannelTypeNames, type)
  ) {
    return VeloeraChannelTypeNames[type as keyof typeof VeloeraChannelTypeNames]
  }
  if (typeof type === "number" && hasOwn(ChannelTypeNames, type)) {
    return ChannelTypeNames[type as keyof typeof ChannelTypeNames]
  }
  if (
    siteType === SITE_TYPES.AXON_HUB &&
    typeof type === "string" &&
    isAxonHubChannelType(type)
  ) {
    return AxonHubChannelTypeNames[type]
  }
  return resolveUnsupportedChannelTypeLabel(t)
}

const getStatusText = (
  t: TFunction,
  status: ManagedSiteMigrationSource["status"] | 1 | 2,
): string => {
  switch (status) {
    case "enabled":
    case 1:
      return t("managedSiteChannels:statusLabels.enabled")
    case "disabled":
    case 2:
      return t("managedSiteChannels:statusLabels.manualPause")
    case "other":
    default:
      return t("managedSiteChannels:statusLabels.unknown")
  }
}

const getExecutionStatusPresentation = (
  t: TFunction,
  status: ManagedSiteMigrationCanonicalExecutionResult["items"][number]["status"],
): Pick<
  ManagedSiteMigrationResult["items"][number],
  "status" | "statusLabel"
> => {
  switch (status) {
    case "created":
      return {
        status: "success",
        statusLabel: t("managedSiteChannels:migration.results.status.success"),
      }
    case "failed":
      return {
        status: "failed",
        statusLabel: t("managedSiteChannels:migration.results.status.failed"),
      }
    case "skipped":
      return {
        status: "skipped",
        statusLabel: t("managedSiteChannels:migration.results.status.skipped"),
      }
    case "uncertain":
      return {
        status: "uncertain",
        statusLabel: t(
          "managedSiteChannels:migration.results.status.uncertain",
        ),
      }
  }
}

const formatList = (values: readonly string[]): string => values.join(", ")

const getComparisonValues = (
  item: ManagedSiteMigrationCanonicalPreviewItem,
  preview: ManagedSiteMigrationCanonicalPreview,
  t: TFunction,
) => {
  const source = item.source
  const target = item.status === "ready" ? item.target.projection : undefined
  return {
    baseUrl: [source?.baseUrl ?? "", target?.baseUrl ?? ""],
    type: [
      source ? getTypeText(t, preview.sourceSiteType, source.resourceType) : "",
      target ? getTypeText(t, preview.targetSiteType, target.type) : "",
    ],
    models: [
      source ? formatList(source.models) : "",
      target ? formatList(target.models) : "",
    ],
    groups: [
      source ? formatList(source.groups) : "",
      target ? formatList(target.groups) : "",
    ],
    priority: [
      source ? String(source.priority) : "",
      target ? String(target.priority) : "",
    ],
    weight: [
      source ? String(source.weight) : "",
      target ? String(target.weight) : "",
    ],
    status: [
      source ? getStatusText(t, source.status) : "",
      target ? getStatusText(t, target.status) : "",
    ],
  } satisfies Record<
    ManagedSiteMigrationComparison["id"],
    readonly [string, string]
  >
}

/** Maps a secret-free canonical preview into the shared migration view. */
export function mapManagedResourceMigrationPreview(
  preview: ManagedSiteMigrationCanonicalPreview,
  options: ManagedResourceMigrationPresentationOptions,
): ManagedSiteMigrationPreviewState {
  return {
    sourceLabel: options.getSiteLabel(preview.sourceSiteType),
    targetLabel: options.getSiteLabel(preview.targetSiteType),
    rows: preview.items.map((item) => {
      const values = getComparisonValues(item, preview, options.t)
      const comparisons = comparisonFieldIds.map((id) => {
        const [source, target] = values[id]
        return {
          id,
          label: getComparisonLabel(options.t, id),
          source,
          target,
          status:
            item.status === "blocked"
              ? ("unsupported" as const)
              : source === target
                ? ("same" as const)
                : ("changed" as const),
        }
      }) as ManagedSiteMigrationPreviewState["rows"][number]["comparisons"]
      return {
        rowKey: item.selection.selectionId,
        displayIdentifier: item.selection.selectionId,
        name: item.selection.displayName,
        baseURL: item.source?.baseUrl ?? "",
        status: item.status,
        comparisons,
        warningText: item.warningCodes.flatMap((code) => {
          const text = getItemWarningText(options.t, code)
          return text ? [text] : []
        }),
        blockedReason:
          item.status === "blocked"
            ? getBlockedReasonText(options.t, item.blockingReasonCode)
            : undefined,
        blockedMessage: undefined,
      }
    }),
    generalWarnings: preview.generalWarningCodes.flatMap((code) => {
      const text = getGeneralWarningText(options.t, code)
      return text ? [text] : []
    }),
    readyCount: preview.readyCount,
    blockedCount: preview.blockedCount,
    totalCount: preview.totalCount,
    isLoading: false,
    isManualLoading: false,
    error: null,
  }
}

/** Maps canonical outcomes to controlled result copy and recovery controls. */
export function mapManagedResourceMigrationExecutionResult(
  result: ManagedSiteMigrationCanonicalExecutionResult,
  options: Pick<ManagedResourceMigrationPresentationOptions, "t">,
): ManagedSiteMigrationResult {
  return {
    summary: formatManagedSiteMigrationResultSummary(options.t, {
      created: result.createdCount,
      failed: result.failedCount,
      skipped: result.skippedCount,
      uncertain: result.uncertainCount,
      total: result.totalSelected,
    }),
    refreshRequired: result.items.some((item) => item.status === "uncertain"),
    canReplay: false,
    items: result.items.map((item) => {
      const status = getExecutionStatusPresentation(options.t, item.status)
      const message =
        item.status === "skipped"
          ? getBlockedReasonText(options.t, item.blockingReasonCode)
          : item.status === "uncertain"
            ? options.t("managedSiteChannels:migration.results.refreshRequired")
            : undefined
      return {
        rowKey: item.selectionId,
        displayIdentifier: item.selectionId,
        name: item.displayName,
        ...status,
        message,
      }
    }),
  }
}
