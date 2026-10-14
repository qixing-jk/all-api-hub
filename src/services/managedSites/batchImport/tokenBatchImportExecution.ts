import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type ManagedResourceRef,
  type ResourceFailure,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { openNativeManagedChannelImportSession } from "~/services/apiAdapters/managedResources/channelImport"
import { mapBatchImportWithConcurrency } from "~/services/managedSites/batchImport/tokenBatchImportConcurrency"
import { skipManagedSiteBatchDuplicates } from "~/services/managedSites/batchImport/tokenBatchImportDuplicates"
import { planManagedSiteTokenBatchImport } from "~/services/managedSites/batchImport/tokenBatchImportPlan"
import { createManagedSiteTokenBatchImportTarget } from "~/services/managedSites/batchImport/tokenBatchImportTarget"
import { getCurrentManagedSiteRuntimeConfig } from "~/services/managedSites/configuration/runtimeConfig"
import {
  assertManagedSiteMutationResult,
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations/contracts"
import {
  toPrivateManagedSiteMutationOutput,
  toPrivateManagedSiteThrownErrorMessage,
} from "~/services/managedSites/mutations/disclosure"
import { collectManagedResourceSecrets } from "~/services/managedSites/utils/resourceSecrets"
import {
  isExecutableManagedSiteTokenBatchExportPreviewItem,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS,
  type ManagedSiteTokenBatchExportExecutionItem,
  type ManagedSiteTokenBatchExportExecutionResult,
  type ManagedSiteTokenBatchExportPreview,
  type ManagedSiteTokenBatchImportMode,
} from "~/types/managedSiteTokenBatchExport"

const FALLBACK_EXECUTION_ERROR = "Failed to create channel"

const DEFINITE_NATIVE_IMPORT_FAILURE_CODES: ReadonlySet<
  ResourceFailure["code"]
> = new Set([
  MANAGED_RESOURCE_FAILURE_CODES.ConfigurationRequired,
  MANAGED_RESOURCE_FAILURE_CODES.InvalidConfiguration,
  MANAGED_RESOURCE_FAILURE_CODES.AuthenticationFailed,
  MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
  MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
  MANAGED_RESOURCE_FAILURE_CODES.ResourceChanged,
  MANAGED_RESOURCE_FAILURE_CODES.NotFound,
  MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected,
])

const isDefiniteNativeImportFailure = (error: unknown) =>
  error instanceof ManagedResourceError &&
  DEFINITE_NATIVE_IMPORT_FAILURE_CODES.has(error.failure.code)
export const MANAGED_SITE_TOKEN_BATCH_IMPORT_TARGET_CHANGED_ERROR_CODE =
  "managed-site-token-import-target-changed" as const

export class ManagedSiteTokenBatchImportTargetChangedError extends Error {
  readonly code = MANAGED_SITE_TOKEN_BATCH_IMPORT_TARGET_CHANGED_ERROR_CODE

  constructor() {
    super("The managed-site target changed. Review the target and try again.")
    this.name = "ManagedSiteTokenBatchImportTargetChangedError"
  }
}

/**
 * Creates target managed-site channels for selected executable preview rows
 * and returns per-token execution results without mutating source accounts.
 */
export async function executeManagedSiteTokenBatchExport(params: {
  preview: ManagedSiteTokenBatchExportPreview
  selectedItemIds: string[]
  mode?: ManagedSiteTokenBatchImportMode
  resourceNamesByItemId?: Readonly<Record<string, string>>
  targetsByGroupId?: Readonly<Record<string, ManagedResourceRef | null>>
}): Promise<ManagedSiteTokenBatchExportExecutionResult> {
  const runtimeConfig = await getCurrentManagedSiteRuntimeConfig()
  if (!runtimeConfig) {
    throw new ManagedSiteTokenBatchImportTargetChangedError()
  }

  const target = await createManagedSiteTokenBatchImportTarget(runtimeConfig)
  if (
    !params.preview.targetFingerprint ||
    target.targetFingerprint !== params.preview.targetFingerprint
  ) {
    throw new ManagedSiteTokenBatchImportTargetChangedError()
  }

  const selectedIds = new Set(params.selectedItemIds)
  const selectedPreviewItems = params.preview.items.filter((item) =>
    selectedIds.has(item.id),
  )
  const executableItems = skipManagedSiteBatchDuplicates(
    selectedPreviewItems,
    target.managedSite,
  ).filter(isExecutableManagedSiteTokenBatchExportPreviewItem)
  const groups = planManagedSiteTokenBatchImport(
    target.managedSite.siteType,
    executableItems,
    params.mode ?? "independent",
    params.targetsByGroupId,
  )
  if (groups.some((group) => group.requiresTargetSelection))
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
    })
  const executionItems = groups.map((group) => {
    const name = params.resourceNamesByItemId?.[group.id]
    return {
      ...executableItems.find((item) => item.id === group.id)!,
      importTarget: group.target,
      draft:
        name === undefined
          ? group.draft
          : { ...group.draft, name: name.trim() },
    }
  })
  const nativeImportSessionResult = executableItems.length
    ? await openNativeManagedChannelImportSession(
        target.managedSite.siteType,
      ).then(
        (session) => ({ session, error: null }),
        (error: unknown) => ({ session: null, error }),
      )
    : { session: null, error: null }
  const reconcileBestEffort = async () => {
    try {
      await nativeImportSessionResult.session?.reconcile()
    } catch {
      // Reconciliation is best effort; ambiguous creates remain non-replayable.
    }
  }
  let executedItems: ManagedSiteTokenBatchExportExecutionItem[]
  try {
    executedItems = await mapBatchImportWithConcurrency(
      executionItems,
      async (item): Promise<ManagedSiteTokenBatchExportExecutionItem> => {
        const secretCollection = collectManagedResourceSecrets(
          target.config,
          item.draft,
        )
        if (
          nativeImportSessionResult.error ||
          !nativeImportSessionResult.session
        ) {
          const message = secretCollection.complete
            ? toPrivateManagedSiteThrownErrorMessage(
                nativeImportSessionResult.error,
                { knownSecrets: secretCollection.knownSecrets },
              )
            : undefined
          return {
            id: item.id,
            accountName: item.accountName,
            runtimeKeyName: item.runtimeKeyName,
            result: MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.FAILED,
            success: false,
            skipped: false,
            error: message
              ? `${FALLBACK_EXECUTION_ERROR}: ${message}`
              : FALLBACK_EXECUTION_ERROR,
          }
        }
        let mutation: ManagedSiteMutationResult<unknown>
        try {
          if (item.importTarget) {
            if (!nativeImportSessionResult.session.append)
              throw new ManagedResourceError({
                code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable,
              })
            mutation = await nativeImportSessionResult.session.append(
              item.importTarget.ref,
              item.draft,
            )
          } else {
            mutation = await nativeImportSessionResult.session.submit(
              item.draft,
            )
          }
        } catch (error) {
          const message = secretCollection.complete
            ? toPrivateManagedSiteThrownErrorMessage(error, {
                knownSecrets: secretCollection.knownSecrets,
              })
            : undefined
          return {
            id: item.id,
            accountName: item.accountName,
            runtimeKeyName: item.runtimeKeyName,
            result: isDefiniteNativeImportFailure(error)
              ? MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.FAILED
              : MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.UNCERTAIN,
            success: false,
            skipped: false,
            error: message
              ? `${FALLBACK_EXECUTION_ERROR}: ${message}`
              : FALLBACK_EXECUTION_ERROR,
          }
        }
        assertManagedSiteMutationResult(mutation, {
          idempotent: Boolean(item.importTarget),
        })
        const privateOutput = secretCollection.complete
          ? toPrivateManagedSiteMutationOutput(mutation, {
              knownSecrets: secretCollection.knownSecrets,
            })
          : null
        const privateError = (() => {
          const details = [
            privateOutput?.statusCode
              ? `HTTP ${privateOutput.statusCode}`
              : null,
            privateOutput?.code !== undefined
              ? String(privateOutput.code)
              : null,
          ].filter((detail): detail is string => Boolean(detail))
          const fallback =
            details.length > 0
              ? `${FALLBACK_EXECUTION_ERROR} (${details.join(", ")})`
              : FALLBACK_EXECUTION_ERROR

          return privateOutput?.message
            ? `${fallback}: ${privateOutput.message}`
            : fallback
        })()

        switch (mutation.outcome) {
          case MANAGED_SITE_MUTATION_OUTCOMES.Succeeded:
            return {
              id: item.id,
              accountName: item.accountName,
              runtimeKeyName: item.runtimeKeyName,
              result: MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.CREATED,
              success: true,
              skipped: false,
            }
          case MANAGED_SITE_MUTATION_OUTCOMES.Rejected:
            return {
              id: item.id,
              accountName: item.accountName,
              runtimeKeyName: item.runtimeKeyName,
              result: MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.FAILED,
              success: false,
              skipped: false,
              error: privateError,
            }
          case MANAGED_SITE_MUTATION_OUTCOMES.Partial:
          case MANAGED_SITE_MUTATION_OUTCOMES.Uncertain:
            return {
              id: item.id,
              accountName: item.accountName,
              runtimeKeyName: item.runtimeKeyName,
              result:
                MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.UNCERTAIN,
              success: false,
              skipped: false,
              error: privateError,
            }
        }
      },
    )
    const groupResults = new Map(executedItems.map((item) => [item.id, item]))
    const resultByItemId = new Map(
      groups.flatMap((group) =>
        group.itemIds.map((id) => [id, groupResults.get(group.id)!] as const),
      ),
    )
    executedItems = executableItems.map((item) => ({
      ...resultByItemId.get(item.id)!,
      id: item.id,
      accountName: item.accountName,
      runtimeKeyName: item.runtimeKeyName,
    }))
  } catch (error) {
    await reconcileBestEffort()
    throw error
  }

  if (
    executedItems.some(
      (item) =>
        item.result ===
        MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.UNCERTAIN,
    )
  ) {
    await reconcileBestEffort()
  }

  const createdCount = executedItems.filter(
    (item) =>
      item.result === MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.CREATED,
  ).length
  const failedCount = executedItems.filter(
    (item) =>
      item.result === MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.FAILED,
  ).length
  const uncertainCount = executedItems.filter(
    (item) =>
      item.result ===
      MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.UNCERTAIN,
  ).length
  const skippedCount = selectedPreviewItems.length - executableItems.length

  return {
    totalSelected: selectedPreviewItems.length,
    attemptedCount: executableItems.length,
    createdCount,
    failedCount,
    uncertainCount,
    skippedCount,
    items: executedItems,
  }
}
