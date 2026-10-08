import { type ManagedSiteChannelMigrationBlockedReasonCode } from "~/types/managedSiteMigration"
import type {
  ManagedSiteMigrationCanonicalExecutionResult,
  ManagedSiteMigrationCanonicalPreview,
  ManagedSiteMigrationCanonicalPreviewItem,
  ManagedSiteMigrationPreviewProjection,
  ManagedSiteMigrationSource,
} from "~/types/managedSiteMigrationCapability"

type MigrationSourceDisplayData = Pick<
  ManagedSiteMigrationSource,
  "sourceSiteType" | "resourceType" | "baseUrl" | "models" | "groups" | "status"
> & { keyCount?: number | null }

type MigrationTargetDisplayData = Omit<
  ManagedSiteMigrationPreviewProjection,
  "name"
>

type MigrationPreviewItemDisplayData = {
  selection: Pick<
    ManagedSiteMigrationCanonicalPreviewItem["selection"],
    "selectionId" | "displayName"
  >
  warningCodes: ManagedSiteMigrationCanonicalPreviewItem["warningCodes"]
} & (
  | {
      status: "ready"
      source: MigrationSourceDisplayData
      target: { projection: MigrationTargetDisplayData }
      blockingReasonCode?: never
    }
  | {
      status: "blocked"
      source?: MigrationSourceDisplayData
      target?: never
      blockingReasonCode: ManagedSiteChannelMigrationBlockedReasonCode
    }
)

/** Safe comparison facts; resource refs remain in the session's execution preview. */
export type ManagedResourceMigrationPreviewData = Omit<
  ManagedSiteMigrationCanonicalPreview,
  "items"
> & {
  items: readonly MigrationPreviewItemDisplayData[]
}

type MigrationExecutionItemDisplayData = Pick<
  ManagedSiteMigrationCanonicalExecutionResult["items"][number],
  "selectionId" | "displayName"
> &
  (
    | { status: "created" | "failed" | "uncertain"; blockingReasonCode?: never }
    | {
        status: "skipped"
        blockingReasonCode: ManagedSiteChannelMigrationBlockedReasonCode
      }
  )

export type ManagedResourceMigrationExecutionData = Pick<
  ManagedSiteMigrationCanonicalExecutionResult,
  | "totalSelected"
  | "createdCount"
  | "failedCount"
  | "skippedCount"
  | "uncertainCount"
> & { items: readonly MigrationExecutionItemDisplayData[] }

const projectSource = (
  source: ManagedSiteMigrationSource,
): MigrationSourceDisplayData => ({
  sourceSiteType: source.sourceSiteType,
  resourceType: source.resourceType,
  baseUrl: source.baseUrl,
  models: [...source.models],
  groups: [...source.groups],
  status: source.status,
  keyCount:
    source.credentialMetadata?.length ??
    (source.lossSignals.hasMultiKeyState ? null : 1),
})

/** Retains only language-independent values that the migration view can display. */
export function projectManagedResourceMigrationPreview(
  preview: ManagedSiteMigrationCanonicalPreview,
): ManagedResourceMigrationPreviewData {
  return {
    sourceSiteType: preview.sourceSiteType,
    targetSiteType: preview.targetSiteType,
    generalWarningCodes: [...preview.generalWarningCodes],
    totalCount: preview.totalCount,
    readyCount: preview.readyCount,
    blockedCount: preview.blockedCount,
    items: preview.items.map((item) => {
      const shared = {
        selection: {
          selectionId: item.selection.selectionId,
          displayName: item.selection.displayName,
        },
        warningCodes: [...item.warningCodes],
      }
      if (item.status === "blocked") {
        return {
          ...shared,
          status: item.status,
          blockingReasonCode: item.blockingReasonCode,
          source: item.source ? projectSource(item.source) : undefined,
        }
      }
      const target = item.target.projection
      return {
        ...shared,
        status: item.status,
        source: projectSource(item.source),
        target: {
          projection: {
            type: target.type,
            baseUrl: target.baseUrl,
            models: [...target.models],
            groups: [...target.groups],
            ...(target.groupAssignment === "platform-default-if-available"
              ? { groupAssignment: target.groupAssignment }
              : {}),
            enabled: target.enabled,
            keyCount: target.keyCount ?? 1,
          },
        },
      }
    }),
  }
}

/** Drops execution-only details while preserving outcome and recovery semantics. */
export function projectManagedResourceMigrationExecutionResult(
  result: ManagedSiteMigrationCanonicalExecutionResult,
): ManagedResourceMigrationExecutionData {
  return {
    totalSelected: result.totalSelected,
    createdCount: result.createdCount,
    failedCount: result.failedCount,
    skippedCount: result.skippedCount,
    uncertainCount: result.uncertainCount,
    items: result.items.map((item) => ({
      selectionId: item.selectionId,
      displayName: item.displayName,
      ...(item.status === "skipped"
        ? { status: item.status, blockingReasonCode: item.blockingReasonCode }
        : { status: item.status }),
    })),
  }
}
