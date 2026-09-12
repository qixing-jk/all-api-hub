import type { ManagedSiteType } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  isManagedResourceRef,
  isManagedResourceRefFor,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES } from "~/types/managedSiteMigration"
import type {
  ManagedSiteMigrationCanonicalExecutionResult,
  ManagedSiteMigrationCanonicalPreview,
  ManagedSiteMigrationCredentialResolution,
  ManagedSiteMigrationSelection,
  ManagedSiteMigrationSelectionValidationContext,
  ManagedSiteMigrationTargetPreparation,
} from "~/types/managedSiteMigrationCapability"
import { MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES } from "~/types/managedSiteMigrationCapability"

import {
  executeManagedSiteMigrationCore,
  prepareManagedSiteMigrationPreviewCore,
} from "./channelMigrationCanonicalOrchestrator"
import { resolveManagedSiteMigrationCapability } from "./channelMigrationCapabilityRegistry"
import { planMigrationCredentials } from "./channelMigrationCredentials"
import { toMigrationWarningCodes } from "./channelMigrationWarnings"

const migrationBlockers = MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES

const withSelectionDisplayName = (
  selection: ManagedSiteMigrationSelection,
  target: ManagedSiteMigrationTargetPreparation,
): ManagedSiteMigrationTargetPreparation =>
  target.projection.name.trim()
    ? target
    : {
        ...target,
        projection: {
          ...target.projection,
          name:
            selection.displayName.trim() || `Channel #${selection.selectionId}`,
        },
      }

/** Builds a secret-free migration preview from canonical resource selections. */
export async function prepareManagedSiteMigrationPreview(params: {
  sourceSiteType: ManagedSiteType
  targetSiteType: ManagedSiteType
  selections: readonly ManagedSiteMigrationSelection[]
  options?: ResourceOperationOptions
}): Promise<ManagedSiteMigrationCanonicalPreview> {
  const hasValidSourceSelection = params.selections.some(
    (selection) =>
      isManagedResourceRef(selection.ref) &&
      selection.ref.siteType === params.sourceSiteType &&
      selection.ref.kind === MANAGED_RESOURCE_KINDS.Channel,
  )
  const sourceCapability = hasValidSourceSelection
    ? resolveManagedSiteMigrationCapability(params.sourceSiteType)?.source
    : undefined
  const targetCapability = hasValidSourceSelection
    ? resolveManagedSiteMigrationCapability(params.targetSiteType)?.target
    : undefined
  const preview = await prepareManagedSiteMigrationPreviewCore({
    sourceSiteType: params.sourceSiteType,
    targetSiteType: params.targetSiteType,
    selections: params.selections,
    signal: params.options?.signal,
    sourceFailureReasonCode: migrationBlockers.SOURCE_KEY_RESOLUTION_FAILED,
    targetFailureReasonCode: migrationBlockers.TARGET_DRAFT_PREPARATION_FAILED,
    getReadyWarningCodes: (source, target) =>
      toMigrationWarningCodes({
        lossSignals: source.lossSignals,
        adjustments: target.adjustments,
      }),
    prepareSource: (selection) =>
      isManagedResourceRef(selection.ref) &&
      selection.ref.siteType === params.sourceSiteType &&
      selection.ref.kind === MANAGED_RESOURCE_KINDS.Channel &&
      sourceCapability
        ? sourceCapability.prepare(selection, params.options)
        : Promise.resolve({
            status: "blocked",
            reasonCode: migrationBlockers.SOURCE_KEY_RESOLUTION_FAILED,
          }),
    prepareTarget: async (selection, source) => {
      if (!targetCapability)
        throw new Error("Migration target is not registered")
      return withSelectionDisplayName(
        selection,
        await targetCapability.prepare(source, params.options),
      )
    },
  })
  return planMigrationCredentials(
    preview,
    (source) =>
      targetCapability?.supportsMultipleCredentials?.(source) === true,
  )
}

/** Executes canonical migration rows without retaining credentials or commands. */
export async function executeManagedSiteMigration(params: {
  preview: ManagedSiteMigrationCanonicalPreview
  options?: ResourceOperationOptions
  resolveSourceCredential?: (
    selection: ManagedSiteMigrationSelection,
    options?: ResourceOperationOptions,
  ) => Promise<ManagedSiteMigrationCredentialResolution>
}): Promise<ManagedSiteMigrationCanonicalExecutionResult> {
  const { preview } = params
  const sourceCapability = resolveManagedSiteMigrationCapability(
    preview.sourceSiteType,
  )?.source
  const targetCapability = resolveManagedSiteMigrationCapability(
    preview.targetSiteType,
  )?.target
  const hasStructurallyValidItem = preview.items.some((item) =>
    isManagedResourceRefFor(item.selection.ref, {
      siteType: preview.sourceSiteType,
      kind: MANAGED_RESOURCE_KINDS.Channel,
    }),
  )
  const createSelectionValidationContext =
    sourceCapability?.createSelectionValidationContext
  let selectionValidationContext: ManagedSiteMigrationSelectionValidationContext | null =
    null
  if (hasStructurallyValidItem && createSelectionValidationContext) {
    try {
      selectionValidationContext = await createSelectionValidationContext(
        params.options,
      )
    } catch (error) {
      if (
        params.options?.signal?.aborted ||
        (typeof error === "object" &&
          error !== null &&
          "name" in error &&
          error.name === "AbortError")
      ) {
        throw error
      }
    }
  }
  const validatedItems = preview.items.map((item) => {
    const structurallyValid = isManagedResourceRefFor(item.selection.ref, {
      siteType: preview.sourceSiteType,
      kind: MANAGED_RESOURCE_KINDS.Channel,
    })
    const contextValid = createSelectionValidationContext
      ? selectionValidationContext?.isValid(item.selection) === true
      : true
    if (structurallyValid && contextValid) return item
    return {
      selection: item.selection,
      status: "blocked" as const,
      warningCodes: [],
      blockingReasonCode: migrationBlockers.SOURCE_KEY_RESOLUTION_FAILED,
    }
  })
  const validatedPreview: ManagedSiteMigrationCanonicalPreview = {
    ...preview,
    items: validatedItems,
    readyCount: validatedItems.filter((item) => item.status === "ready").length,
    blockedCount: validatedItems.filter((item) => item.status === "blocked")
      .length,
  }
  return await executeManagedSiteMigrationCore({
    preview: validatedPreview,
    targetAvailable: Boolean(targetCapability),
    signal: params.options?.signal,
    sourceFailureReasonCode: migrationBlockers.SOURCE_KEY_RESOLUTION_FAILED,
    resolveCredential: (selection) =>
      params.resolveSourceCredential
        ? params.resolveSourceCredential(selection, params.options)
        : sourceCapability
          ? sourceCapability.resolveCredential(selection, params.options)
          : Promise.resolve({
              status: "blocked",
              reasonCode: migrationBlockers.SOURCE_KEY_RESOLUTION_FAILED,
            }),
    create: (command) => {
      if (!targetCapability)
        throw new Error("Migration target is not registered")
      if (
        command.credentials &&
        !targetCapability.supportsMultipleCredentials?.(command.source)
      )
        return Promise.resolve({
          status: "failed",
          failureCode:
            MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.TargetRejected,
        })
      return targetCapability.create(command, params.options)
    },
  })
}
