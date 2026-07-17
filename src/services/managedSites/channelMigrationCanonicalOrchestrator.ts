import type { ManagedSiteType } from "~/constants/siteType"
import {
  MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES,
  type ManagedSiteChannelMigrationBlockedReasonCode,
  type ManagedSiteChannelMigrationItemWarningCode,
} from "~/types/managedSiteMigration"
import {
  MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES,
  ManagedSiteMigrationExecutionAbortedError,
  type ManagedSiteMigrationCanonicalExecutionResult,
  type ManagedSiteMigrationCanonicalPreview,
  type ManagedSiteMigrationCanonicalPreviewItem,
  type ManagedSiteMigrationConfirmedFailureCode,
  type ManagedSiteMigrationCreateResult,
  type ManagedSiteMigrationCredentialResolution,
  type ManagedSiteMigrationExecutionCommand,
  type ManagedSiteMigrationSelection,
  type ManagedSiteMigrationSource,
  type ManagedSiteMigrationSourcePreparation,
  type ManagedSiteMigrationTargetPreparation,
} from "~/types/managedSiteMigrationCapability"

const PREVIEW_BUILD_CONCURRENCY = 5
const migrationFailures = MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES

const isAbortError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (("name" in error && error.name === "AbortError") ||
    ("code" in error && error.code === "ABORT_ERR"))

const throwIfCancelled = (signal?: AbortSignal, error?: unknown): void => {
  if (signal?.aborted) {
    throw signal.reason ?? error
  }
  if (error !== undefined && isAbortError(error)) {
    throw error
  }
}

const mapWithConcurrency = async <TItem, TResult>(
  items: readonly TItem[],
  concurrency: number,
  mapper: (item: TItem) => Promise<TResult>,
): Promise<TResult[]> => {
  const results = new Array<TResult>(items.length)
  let nextIndex = 0
  let stopped = false
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (!stopped && nextIndex < items.length) {
        const index = nextIndex++
        try {
          results[index] = await mapper(items[index])
        } catch (error) {
          stopped = true
          throw error
        }
      }
    }),
  )
  return results
}

type PrepareManagedSiteMigrationPreviewCoreParams = {
  sourceSiteType: ManagedSiteType
  targetSiteType: ManagedSiteType
  selections: readonly ManagedSiteMigrationSelection[]
  sourceFailureReasonCode: ManagedSiteChannelMigrationBlockedReasonCode
  targetFailureReasonCode: ManagedSiteChannelMigrationBlockedReasonCode
  signal?: AbortSignal
  prepareSource: (
    selection: ManagedSiteMigrationSelection,
  ) => Promise<ManagedSiteMigrationSourcePreparation>
  prepareTarget: (
    selection: ManagedSiteMigrationSelection,
    source: ManagedSiteMigrationSource,
  ) => Promise<ManagedSiteMigrationTargetPreparation>
  getReadyWarningCodes: (
    source: ManagedSiteMigrationSource,
    target: ManagedSiteMigrationTargetPreparation,
  ) => readonly ManagedSiteChannelMigrationItemWarningCode[]
  getBlockedWarningCodes?: (
    selection: ManagedSiteMigrationSelection,
  ) => readonly ManagedSiteChannelMigrationItemWarningCode[]
}

/** Coordinates bounded, secret-free canonical preview preparation. */
export async function prepareManagedSiteMigrationPreviewCore(
  params: PrepareManagedSiteMigrationPreviewCoreParams,
): Promise<ManagedSiteMigrationCanonicalPreview> {
  throwIfCancelled(params.signal)
  const blockedItem = (
    selection: ManagedSiteMigrationSelection,
    blockingReasonCode: ManagedSiteChannelMigrationBlockedReasonCode,
  ): ManagedSiteMigrationCanonicalPreviewItem => ({
    selection,
    status: "blocked",
    warningCodes: params.getBlockedWarningCodes?.(selection) ?? [],
    blockingReasonCode,
  })
  const items = await mapWithConcurrency(
    params.selections,
    PREVIEW_BUILD_CONCURRENCY,
    async (selection): Promise<ManagedSiteMigrationCanonicalPreviewItem> => {
      throwIfCancelled(params.signal)
      let sourcePreparation: ManagedSiteMigrationSourcePreparation
      try {
        sourcePreparation = await params.prepareSource(selection)
        throwIfCancelled(params.signal)
      } catch (error) {
        throwIfCancelled(params.signal, error)
        return blockedItem(selection, params.sourceFailureReasonCode)
      }
      if (sourcePreparation.status === "blocked") {
        return blockedItem(selection, sourcePreparation.reasonCode)
      }

      try {
        throwIfCancelled(params.signal)
        const source = sourcePreparation.source
        const target = await params.prepareTarget(selection, source)
        throwIfCancelled(params.signal)
        return {
          selection,
          status: "ready",
          source,
          target,
          warningCodes: params.getReadyWarningCodes(source, target),
        }
      } catch (error) {
        throwIfCancelled(params.signal, error)
        return blockedItem(selection, params.targetFailureReasonCode)
      }
    },
  )
  const readyCount = items.filter((item) => item.status === "ready").length
  return {
    sourceSiteType: params.sourceSiteType,
    targetSiteType: params.targetSiteType,
    generalWarningCodes: [
      MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES.CREATE_ONLY,
      MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES.NO_DEDUPE_OR_SYNC,
      MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES.NO_ROLLBACK,
    ],
    items,
    totalCount: items.length,
    readyCount,
    blockedCount: items.length - readyCount,
  }
}

type ExecuteManagedSiteMigrationCoreParams = {
  preview: ManagedSiteMigrationCanonicalPreview
  targetAvailable: boolean
  sourceFailureReasonCode: ManagedSiteChannelMigrationBlockedReasonCode
  signal?: AbortSignal
  resolveCredential: (
    selection: ManagedSiteMigrationSelection,
  ) => Promise<ManagedSiteMigrationCredentialResolution>
  create: (
    command: ManagedSiteMigrationExecutionCommand,
  ) => Promise<ManagedSiteMigrationCreateResult>
  isMutationStateUncertain?: (error: unknown) => boolean
}

/** Executes canonical commands while keeping credentials local to each create. */
export async function executeManagedSiteMigrationCore(
  params: ExecuteManagedSiteMigrationCoreParams,
): Promise<ManagedSiteMigrationCanonicalExecutionResult> {
  type ExecutionItem =
    ManagedSiteMigrationCanonicalExecutionResult["items"][number]
  type ExecutionOutcome =
    | { status: "created" }
    | {
        status: "failed"
        failureCode: ManagedSiteMigrationConfirmedFailureCode
      }
    | {
        status: "skipped"
        blockingReasonCode: ManagedSiteChannelMigrationBlockedReasonCode
      }
    | {
        status: "uncertain"
        failureCode: typeof migrationFailures.MutationStateUncertain
      }
  const items: ExecutionItem[] = []
  const append = (
    item: ManagedSiteMigrationCanonicalPreviewItem,
    outcome: ExecutionOutcome,
  ) =>
    items.push({
      selectionId: item.selection.selectionId,
      displayName: item.selection.displayName,
      ...outcome,
    })
  let attemptedCount = 0
  const count = (status: ExecutionItem["status"]) =>
    items.filter((item) => item.status === status).length
  const buildResultSnapshot =
    (): ManagedSiteMigrationCanonicalExecutionResult => ({
      totalSelected: params.preview.totalCount,
      attemptedCount,
      createdCount: count("created"),
      failedCount: count("failed"),
      skippedCount: count("skipped"),
      uncertainCount: count("uncertain"),
      items: [...items],
    })
  const throwIfExecutionCancelled = (
    remainingStartIndex: number,
    error?: unknown,
  ): void => {
    const cancelled =
      params.signal?.aborted || (error !== undefined && isAbortError(error))
    if (!cancelled) return

    const cause = params.signal?.aborted ? params.signal.reason ?? error : error
    throw new ManagedSiteMigrationExecutionAbortedError(
      {
        partialResult: buildResultSnapshot(),
        remainingSelections: params.preview.items
          .slice(remainingStartIndex)
          .map((item) => item.selection),
      },
      cause === undefined ? undefined : { cause },
    )
  }

  for (let index = 0; index < params.preview.items.length; index += 1) {
    throwIfExecutionCancelled(index)
    const item = params.preview.items[index]
    if (item.status === "blocked") {
      append(item, {
        status: "skipped",
        blockingReasonCode: item.blockingReasonCode,
      })
      continue
    }
    if (!params.targetAvailable) {
      append(item, {
        status: "failed",
        failureCode: migrationFailures.TargetUnavailable,
      })
      continue
    }

    let credentialResolution: ManagedSiteMigrationCredentialResolution
    try {
      credentialResolution = await params.resolveCredential(item.selection)
      throwIfExecutionCancelled(index)
    } catch (error) {
      throwIfExecutionCancelled(index, error)
      credentialResolution = {
        status: "blocked",
        reasonCode: params.sourceFailureReasonCode,
      }
    }
    if (credentialResolution.status === "blocked") {
      append(item, {
        status: "skipped",
        blockingReasonCode: credentialResolution.reasonCode,
      })
      continue
    }

    throwIfExecutionCancelled(index)
    attemptedCount += 1
    let createResult: ManagedSiteMigrationCreateResult
    try {
      createResult = await params.create({
        source: item.source,
        targetSiteType: params.preview.targetSiteType,
        projection: item.target.projection,
        credential: credentialResolution.credential,
      })
    } catch (error) {
      const uncertain = params.isMutationStateUncertain?.(error) ?? false
      if (uncertain) {
        append(item, {
          status: "uncertain",
          failureCode: migrationFailures.MutationStateUncertain,
        })
        throwIfExecutionCancelled(index + 1, error)
        continue
      }
      throwIfExecutionCancelled(index, error)
      append(item, {
        status: "failed",
        failureCode: migrationFailures.Unexpected,
      })
      continue
    }

    if (createResult.status === "created") {
      append(item, { status: "created" })
    } else if (createResult.status === "failed") {
      append(item, {
        status: "failed",
        failureCode: createResult.failureCode,
      })
    } else {
      append(item, {
        status: "uncertain",
        failureCode: migrationFailures.MutationStateUncertain,
      })
    }
    throwIfExecutionCancelled(index + 1)
  }
  return buildResultSnapshot()
}
