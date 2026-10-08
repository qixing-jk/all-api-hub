import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type ResourceFailure,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { openNativeManagedChannelImportSession } from "~/services/apiAdapters/managedResources/channelImport"
import {
  assertManagedSiteMutationResult,
  MANAGED_SITE_MUTATION_OUTCOMES,
  toPrivateManagedSiteMutationOutput,
  toPrivateManagedSiteThrownErrorMessage,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations"
import { getCurrentManagedSiteRuntimeConfig } from "~/services/managedSites/runtimeConfig"
import { createManagedSiteTokenBatchImportTarget } from "~/services/managedSites/tokenBatchImportTarget"
import { collectManagedResourceSecrets } from "~/services/managedSites/utils/resourceSecrets"
import {
  isExecutableManagedSiteTokenBatchExportPreviewItem,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS,
  type ExecutableManagedSiteTokenBatchExportPreviewItem,
  type ManagedSiteTokenBatchExportExecutionItem,
  type ManagedSiteTokenBatchExportExecutionResult,
  type ManagedSiteTokenBatchExportPreview,
  type ManagedSiteTokenBatchExportPreviewItem,
} from "~/types/managedSiteTokenBatchExport"

import { mapBatchImportWithConcurrency } from "./tokenBatchImportConcurrency"

const FALLBACK_EXECUTION_ERROR = "Failed to create channel"

const DEFINITE_NATIVE_IMPORT_FAILURE_CODES: ReadonlySet<
  ResourceFailure["code"]
> = new Set([
  MANAGED_RESOURCE_FAILURE_CODES.ConfigurationRequired,
  MANAGED_RESOURCE_FAILURE_CODES.InvalidConfiguration,
  MANAGED_RESOURCE_FAILURE_CODES.AuthenticationFailed,
  MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
  MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
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
  const isSelectedExecutablePreviewItem = (
    item: ManagedSiteTokenBatchExportPreviewItem,
  ): item is ExecutableManagedSiteTokenBatchExportPreviewItem =>
    selectedIds.has(item.id) &&
    isExecutableManagedSiteTokenBatchExportPreviewItem(item)
  const executableItems = params.preview.items.filter(
    isSelectedExecutablePreviewItem,
  )
  const nativeImportSessionResult = executableItems.length
    ? await openNativeManagedChannelImportSession(
        target.managedSite.siteType,
      ).then(
        (session) => ({ session, error: null }),
        (error: unknown) => ({ session: null, error }),
      )
    : { session: null, error: null }
  let executedItems: ManagedSiteTokenBatchExportExecutionItem[]
  try {
    executedItems = await mapBatchImportWithConcurrency(
      executableItems,
      async (item): Promise<ManagedSiteTokenBatchExportExecutionItem> => {
        const preDispatchSecretCollection = collectManagedResourceSecrets(
          target.config,
          item.draft,
        )
        if (
          nativeImportSessionResult.error ||
          !nativeImportSessionResult.session
        ) {
          const message = preDispatchSecretCollection.complete
            ? toPrivateManagedSiteThrownErrorMessage(
                nativeImportSessionResult.error,
                { knownSecrets: preDispatchSecretCollection.knownSecrets },
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
        const secretCollection = preDispatchSecretCollection
        let mutation: ManagedSiteMutationResult<unknown>
        {
          try {
            mutation = await nativeImportSessionResult.session.submit(
              item.draft,
            )
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
        }
        assertManagedSiteMutationResult(mutation, { idempotent: false })
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
  } catch (error) {
    try {
      await nativeImportSessionResult.session?.reconcile()
    } catch {
      // Reconciliation is best effort; post-invocation failures stay non-replayable.
    }
    throw error
  }

  if (
    executedItems.some(
      (item) =>
        item.result ===
        MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.UNCERTAIN,
    )
  ) {
    try {
      await nativeImportSessionResult.session?.reconcile()
    } catch {
      // Reconciliation is best effort; ambiguous creates remain non-replayable.
    }
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
